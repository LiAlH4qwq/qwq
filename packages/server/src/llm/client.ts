import { HttpClient, HttpClientRequest } from "@effect/platform"
import type { HttpClientResponse } from "@effect/platform"
import {
  Array as Arr,
  Effect,
  Either,
  Match,
  Option,
  ParseResult,
  Schema,
  Stream,
} from "effect"
import type { ApiConfig } from "@qwq/shared/config/schema"
import { LlmRequestError, LlmResponseError } from "@qwq/shared/errors"
import { formatParseError } from "@qwq/shared/parse"
import type {
  CompletionResult,
  LlmMessage,
  ToolCall,
  ToolSpec,
} from "./types"

export interface CompleteOptions {
  readonly tools?: ReadonlyArray<ToolSpec>
  readonly onDelta?: (text: string) => Effect.Effect<void>
}

const valueOr = <A>(value: A | undefined, fallback: A): A =>
  Option.getOrElse(Option.fromNullable(value), () => fallback)

const issuesOf = (error: unknown): ReadonlyArray<string> =>
  error instanceof ParseResult.ParseError
    ? formatParseError(error)
    : [String(error)]

/* ------------------------------------------------------------------ */
/* OpenAI wire format                                                  */
/* ------------------------------------------------------------------ */

const toOpenaiMessage = (message: LlmMessage): unknown =>
  Match.value(message).pipe(
    Match.when({ role: "system" }, (m) => ({
      role: "system",
      content: m.content,
    })),
    Match.when({ role: "user" }, (m) => ({ role: "user", content: m.content })),
    Match.when({ role: "assistant" }, (m) => ({
      role: "assistant",
      content: m.content,
      ...(m.toolCalls.length > 0
        ? {
            tool_calls: m.toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    })),
    Match.when({ role: "tool" }, (m) => ({
      role: "tool",
      tool_call_id: m.toolCallId,
      content: m.content,
    })),
    Match.exhaustive,
  )

const toOpenaiTools = (tools: ReadonlyArray<ToolSpec>): unknown =>
  tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

const OpenaiToolCallRaw = Schema.Struct({
  id: Schema.String,
  function: Schema.Struct({
    name: Schema.String,
    arguments: Schema.String,
  }),
})

const OpenaiMessage = Schema.Struct({
  content: Schema.optional(Schema.NullOr(Schema.String)),
  tool_calls: Schema.optional(Schema.Array(OpenaiToolCallRaw)),
})

const OpenaiResponse = Schema.Struct({
  choices: Schema.Array(Schema.Struct({ message: OpenaiMessage })),
})

const toToolCalls = (
  raw: ReadonlyArray<typeof OpenaiToolCallRaw.Type>,
): ReadonlyArray<ToolCall> =>
  raw.map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: call.function.arguments,
  }))

const parseOpenai = (
  url: string,
  text: string,
): Effect.Effect<CompletionResult, LlmResponseError> =>
  Schema.decodeUnknown(Schema.parseJson(OpenaiResponse))(text).pipe(
    Effect.mapError(
      (error) => new LlmResponseError({ url, issues: issuesOf(error) }),
    ),
    Effect.flatMap((response) =>
      Option.match(Arr.head(response.choices), {
        onNone: () =>
          Effect.fail(new LlmResponseError({ url, issues: ["empty choices"] })),
        onSome: (choice) =>
          Effect.succeed({
            text: Option.getOrElse(
              Option.fromNullable(choice.message.content),
              () => "",
            ),
            toolCalls: toToolCalls(valueOr(choice.message.tool_calls, [])),
          }),
      }),
    ),
  )

/* ------------------------------------------------------------------ */
/* Anthropic wire format                                               */
/* ------------------------------------------------------------------ */

const AnthropicContentBlock = Schema.Union(
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("tool_use"),
    id: Schema.String,
    name: Schema.String,
    input: Schema.Unknown,
  }),
)

const AnthropicResponse = Schema.Struct({
  content: Schema.Array(AnthropicContentBlock),
})

const toAnthropicRequest = (
  messages: ReadonlyArray<LlmMessage>,
  tools: ReadonlyArray<ToolSpec>,
): {
  readonly system: string
  readonly messages: ReadonlyArray<unknown>
 } => {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => ("content" in message ? message.content : ""))
    .join("\n\n")
  const rest = messages.flatMap((message): ReadonlyArray<unknown> => {
    switch (message.role) {
      case "system":
        return []
      case "user":
        return [{ role: "user", content: [{ type: "text", text: message.content }] }]
      case "assistant":
        return [
          {
            role: "assistant",
            content: [
              ...(message.content === ""
                ? []
                : [{ type: "text", text: message.content }]),
              ...message.toolCalls.map((call) => ({
                type: "tool_use",
                id: call.id,
                name: call.name,
                input: safeJson(call.arguments),
              })),
            ],
          },
        ]
      case "tool":
        return [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: message.toolCallId,
                content: message.content,
              },
            ],
          },
        ]
    }
  })
  return {
    system,
    messages: rest,
    ...(tools.length > 0
      ? {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
          })),
        }
      : {}),
  }
}

const safeJson = (text: string): unknown =>
  Either.getOrElse(
    Schema.decodeUnknownEither(Schema.parseJson(Schema.Unknown))(text),
    () => ({}),
  )

const parseAnthropic = (
  url: string,
  text: string,
): Effect.Effect<CompletionResult, LlmResponseError> =>
  Schema.decodeUnknown(Schema.parseJson(AnthropicResponse))(text).pipe(
    Effect.mapError(
      (error) => new LlmResponseError({ url, issues: issuesOf(error) }),
    ),
    Effect.map((response) => ({
      text: response.content
        .filter((block) => block.type === "text")
        .map((block) => ("text" in block ? block.text : ""))
        .join(""),
      toolCalls: response.content.flatMap((block): ReadonlyArray<ToolCall> =>
        block.type === "tool_use"
          ? [
              {
                id: block.id,
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            ]
          : [],
      ),
    })),
  )

const extractAnswer = (
  api: ApiConfig,
  text: string,
): Effect.Effect<CompletionResult, LlmResponseError> =>
  Match.value(api.type).pipe(
    Match.when("anthropic", () => parseAnthropic(api.url, text)),
    Match.when("openai", () => parseOpenai(api.url, text)),
    Match.exhaustive,
  )

/* ------------------------------------------------------------------ */
/* OpenAI streaming                                                    */
/* ------------------------------------------------------------------ */

interface PartialCall {
  readonly id: string
  readonly name: string
  readonly args: string
}

interface StreamState {
  readonly text: string
  readonly calls: Readonly<Record<string, PartialCall>>
}

const OpenaiStreamChunk = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      delta: Schema.Struct({
        content: Schema.optional(Schema.NullOr(Schema.String)),
        tool_calls: Schema.optional(
          Schema.Array(
            Schema.Struct({
              index: Schema.optional(Schema.Number),
              id: Schema.optional(Schema.String),
              function: Schema.optional(
                Schema.Struct({
                  name: Schema.optional(Schema.String),
                  arguments: Schema.optional(Schema.String),
                }),
              ),
            }),
          ),
        ),
      }),
    }),
  ),
})

const mergeStreamState = (
  state: StreamState,
  chunk: typeof OpenaiStreamChunk.Type,
): StreamState =>
  Option.match(Option.fromNullable(chunk.choices.at(0)), {
    onNone: () => state,
    onSome: (choice) => {
      const delta = choice.delta
      const text = state.text + valueOr(delta.content, "")
      const calls = valueOr(delta.tool_calls, []).reduce(
        (acc, raw): Readonly<Record<string, PartialCall>> => {
          const index = String(valueOr(raw.index, 0))
          const existing = valueOr(acc[index], { id: "", name: "", args: "" })
          const fn = Option.fromNullable(raw.function)
          const id = valueOr(raw.id, existing.id)
          const name = Option.getOrElse(
            Option.flatMap(fn, (f) => Option.fromNullable(f.name)),
            () => existing.name,
          )
          const args =
            existing.args +
            Option.getOrElse(
              Option.flatMap(fn, (f) => Option.fromNullable(f.arguments)),
              () => "",
            )
          return { ...acc, [index]: { id, name, args } }
        },
        state.calls,
      )
      return { text, calls }
    },
  })

const streamStateToResult = (state: StreamState): CompletionResult => ({
  text: state.text,
  toolCalls: Object.entries(state.calls)
    .toSorted((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, call]) => ({
      id: call.id,
      name: call.name,
      arguments: call.args,
    })),
})

const openaiStream = (
  response: HttpClientResponse.HttpClientResponse,
  onDelta: (text: string) => Effect.Effect<void>,
): Effect.Effect<CompletionResult, LlmRequestError> =>
  response.stream.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.filter((line) => line.startsWith("data:")),
    Stream.map((line) => line.slice("data:".length).trim()),
    Stream.filter((data) => data !== "" && data !== "[DONE]"),
    Stream.map((data) =>
      Schema.decodeUnknownOption(Schema.parseJson(OpenaiStreamChunk))(data),
    ),
    Stream.filter(Option.isSome),
    Stream.map((option) => option.value),
    Stream.tap((chunk) => {
      const delta = Option.flatMap(
        Option.fromNullable(chunk.choices.at(0)),
        (choice) => Option.fromNullable(choice.delta.content),
      )
      return Option.match(delta, {
        onNone: () => Effect.void,
        onSome: (text) => (text === "" ? Effect.void : onDelta(text)),
      })
    }),
    Stream.runFold(
      { text: "", calls: {} } as StreamState,
      mergeStreamState,
    ),
    Effect.map(streamStateToResult),
    Effect.mapError(
      (cause) =>
        new LlmRequestError({
          url: "",
          message: "failed to read the response stream",
          cause,
        }),
    ),
  )

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

const buildRequest = (
  api: ApiConfig,
  apiKey: string,
  body: unknown,
  streaming: boolean,
): HttpClientRequest.HttpClientRequest => {
  const base = HttpClientRequest.post(api.url).pipe(
    HttpClientRequest.setHeader("authorization", `Bearer ${apiKey}`),
    HttpClientRequest.setHeader("content-type", "application/json"),
  )
  const withAccept = streaming
    ? base.pipe(
        HttpClientRequest.setHeader("accept", "text/event-stream"),
        HttpClientRequest.setHeader("cache-control", "no-cache"),
      )
    : base
  return withAccept.pipe(HttpClientRequest.bodyText(JSON.stringify(body)))
}

export const complete = (
  api: ApiConfig,
  apiKey: string,
  messages: ReadonlyArray<LlmMessage>,
  options?: CompleteOptions,
): Effect.Effect<
  CompletionResult,
  LlmRequestError | LlmResponseError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const tools: ReadonlyArray<ToolSpec> = Option.getOrElse(
      Option.flatMap(Option.fromNullable(options), (value) =>
        Option.fromNullable(value.tools),
      ),
      () => [] as ReadonlyArray<ToolSpec>,
    )
    const onDelta = Option.flatMap(Option.fromNullable(options), (value) =>
      Option.fromNullable(value.onDelta),
    )
    const wantsStream =
      api.stream && api.type === "openai" && Option.isSome(onDelta)

    const run = (
      useStream: boolean,
    ): Effect.Effect<
      CompletionResult,
      LlmRequestError | LlmResponseError,
      HttpClient.HttpClient
    > =>
      Effect.gen(function* () {
        const body =
          api.type === "openai"
            ? {
                model: api.model,
                enable_thinking: false,
                stream: useStream,
                messages: messages.map(toOpenaiMessage),
                ...(tools.length > 0
                  ? { tools: toOpenaiTools(tools), tool_choice: "auto" }
                  : {}),
              }
            : {
                model: api.model,
                max_tokens: 4096,
                ...toAnthropicRequest(messages, tools),
              }
        const response = yield* client
          .execute(buildRequest(api, apiKey, body, useStream))
          .pipe(
            Effect.mapError(
              (cause) =>
                new LlmRequestError({
                  url: api.url,
                  message: "request failed",
                  cause,
                }),
            ),
          )
        if (response.status < 200 || response.status >= 300) {
          return yield* Effect.fail(
            new LlmRequestError({
              url: api.url,
              message: `unexpected status ${response.status}`,
              cause: response.status,
            }),
          )
        }
        if (useStream && Option.isSome(onDelta)) {
          return yield* openaiStream(response, onDelta.value)
        }
        const text = yield* response.text.pipe(
          Effect.mapError(
            (cause) =>
              new LlmRequestError({
                url: api.url,
                message: "failed to read response body",
                cause,
              }),
          ),
        )
        return yield* extractAnswer(api, text)
      })

    return yield* wantsStream
      ? run(true).pipe(
          Effect.catchTag("LlmRequestError", (error: LlmRequestError) =>
            Effect.logWarning(
              `流式请求失败，改用非流式重试：${error.message}`,
            ).pipe(Effect.zipRight(run(false))),
          ),
        )
      : run(false)
  })
