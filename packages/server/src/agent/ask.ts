import type {
  CommandExecutor,
  FileSystem,
  HttpClient,
} from "@effect/platform"
import { Effect, Option, Schema } from "effect"
import { resolveApiKey } from "@qwq/shared/config/load"
import type { Config } from "@qwq/shared/config/schema"
import type { EnvVar } from "@qwq/shared/domain/env"
import type { Message } from "@qwq/shared/domain/message"
import type { ApiKeyError, LlmRequestError, LlmResponseError } from "@qwq/shared/errors"
import type { ToolStatus } from "@qwq/shared/server/rpc"
import { complete, type CompleteOptions } from "../llm/client"
import type { LlmMessage, ToolCall, ToolSpec } from "../llm/types"
import { extractCommand, hasCommand, processAnswer } from "./command"
import {
  buildDebugAnswer,
  composeSystemPrompt,
  type PromptCapability,
} from "./prompt"
import { commandReviewReason, definitions, type ToolDefinition } from "./tools"

export type AskError = ApiKeyError | LlmRequestError | LlmResponseError

export interface AgentHooks {
  readonly onDelta?: (text: string) => Effect.Effect<void>
  readonly onToolStart?: (name: string, detail: string) => Effect.Effect<void>
  readonly onToolResult?: (
    name: string,
    detail: string,
    status: ToolStatus,
  ) => Effect.Effect<void>
  // Ask the connected frontend whether a reviewed tool call may run. Resolves to
  // `false` when the frontend cannot answer, which lets the agent move on.
  readonly requestPermission?: (
    tool: string,
    detail: string,
  ) => Effect.Effect<boolean>
}

export interface AskInput {
  readonly config: Config
  readonly capability: PromptCapability
  readonly envVars: ReadonlyArray<EnvVar>
  readonly shellName: string
  readonly question: string
  readonly history: ReadonlyArray<Message>
  readonly hooks?: AgentHooks
}

export interface AskOutcome {
  readonly answer: string
  readonly messages: ReadonlyArray<Message>
}

const safeParse = (text: string): unknown =>
  Option.getOrElse(
    Schema.decodeUnknownOption(Schema.parseJson(Schema.Unknown))(text),
    () => ({}),
  )

const fire = (
  hooks: Option.Option<AgentHooks>,
  pick: (
    hooks: AgentHooks,
  ) => ((name: string, detail: string) => Effect.Effect<void>) | undefined,
  name: string,
  detail: string,
): Effect.Effect<void> =>
  Option.match(hooks, {
    onNone: () => Effect.void,
    onSome: (value) =>
      Option.match(Option.fromNullable(pick(value)), {
        onNone: () => Effect.void,
        onSome: (fn) => fn(name, detail),
      }),
  })

const fireResult = (
  hooks: Option.Option<AgentHooks>,
  pick: (
    hooks: AgentHooks,
  ) =>
    | ((name: string, detail: string, status: ToolStatus) => Effect.Effect<void>)
    | undefined,
  name: string,
  detail: string,
  status: ToolStatus,
): Effect.Effect<void> =>
  Option.match(hooks, {
    onNone: () => Effect.void,
    onSome: (value) =>
      Option.match(Option.fromNullable(pick(value)), {
        onNone: () => Effect.void,
        onSome: (fn) => fn(name, detail, status),
      }),
  })

const permissionOf = (
  loop: LoopOptions,
  tool: string,
  detail: string,
): Effect.Effect<boolean> =>
  loop.config.tools.permission.mode === "deny"
    ? Effect.succeed(false)
    : Option.match(loop.hooks, {
        onNone: () => Effect.succeed(false),
        onSome: (hooks) =>
          Option.match(Option.fromNullable(hooks.requestPermission), {
            onNone: () => Effect.succeed(false),
            onSome: (fn) => fn(tool, detail),
          }),
      })

const toLlm = (message: Message): LlmMessage => {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content }
    case "user":
      return { role: "user", content: message.content }
    case "assistant":
      return {
        role: "assistant",
        content: message.content,
        toolCalls: Option.getOrElse(
          Option.fromNullable(message.toolCalls),
          () => [],
        ),
      }
    case "tool":
      return {
        role: "tool",
        toolCallId: Option.getOrElse(
          Option.fromNullable(message.toolCallId),
          () => "",
        ),
        name: Option.getOrElse(
          Option.fromNullable(message.name),
          () => "tool",
        ),
        content: message.content,
      }
  }
}

const fromLlm = (message: LlmMessage): Message => {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content }
    case "user":
      return { role: "user", content: message.content }
    case "assistant":
      return {
        role: "assistant",
        content: message.content,
        ...(message.toolCalls.length > 0
          ? { toolCalls: message.toolCalls }
          : {}),
      }
    case "tool":
      return {
        role: "tool",
        content: message.content,
        name: message.name,
        toolCallId: message.toolCallId,
      }
  }
}

interface LoopOptions {
  readonly config: Config
  readonly apiKey: string
  readonly capability: PromptCapability
  readonly tools: ReadonlyArray<ToolDefinition>
  readonly specs: ReadonlyArray<ToolSpec>
  readonly sendNative: boolean
  readonly execute: boolean
  readonly hooks: Option.Option<AgentHooks>
  readonly maxSteps: number
}

const runOneTool = (
  loop: LoopOptions,
  call: ToolCall,
): Effect.Effect<
  LlmMessage,
  never,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    yield* fire(loop.hooks, (h) => h.onToolStart, call.name, call.arguments)
    const definition = Option.fromNullable(
      loop.tools.find((tool) => tool.spec.name === call.name),
    )
    const review = yield* Option.match(definition, {
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: (tool) =>
        Option.match(Option.fromNullable(tool.review), {
          onNone: () => Effect.succeed(Option.none<string>()),
          onSome: (fn) =>
            fn(safeParse(call.arguments)).pipe(
              Effect.orElseSucceed(() => Option.none<string>()),
            ),
        }),
    })
    const allowed = yield* Option.match(review, {
      onNone: () => Effect.succeed(true),
      onSome: (detail) => permissionOf(loop, call.name, detail),
    })
    const outcome = yield* (allowed
      ? Option.match(definition, {
          onNone: () =>
            Effect.succeed({
              text: `未知工具：${call.name}`,
              status: "error" as const,
            }),
          onSome: (tool) =>
            tool.run(safeParse(call.arguments)).pipe(
              Effect.match({
                onFailure: (error) => ({
                  text: `工具出错：${error.message}`,
                  status: Option.getOrElse(
                    Option.fromNullable(error.denied),
                    () => false,
                  )
                    ? ("denied" as const)
                    : ("error" as const),
                }),
                onSuccess: (text) => ({ text, status: "ok" as const }),
              }),
            ),
        })
      : Effect.succeed({
          text: `用户拒绝了工具「${call.name}」的调用。`,
          status: "denied" as const,
        }))
    yield* fireResult(
      loop.hooks,
      (h) => h.onToolResult,
      call.name,
      outcome.text,
      outcome.status,
    )
    return {
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      content: outcome.text,
    }
  })

const runBashText = (
  loop: LoopOptions,
  command: string,
): Effect.Effect<
  string,
  never,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const definition = Option.fromNullable(
      loop.tools.find((tool) => tool.spec.name === "bash"),
    )
    if (Option.isNone(definition)) {
      return "（无法执行：未找到 bash 工具）"
    }
    yield* fire(loop.hooks, (h) => h.onToolStart, "bash", command)
    const review = yield* commandReviewReason(loop.config.tools, command)
    const allowed = yield* Option.match(review, {
      onNone: () => Effect.succeed(true),
      onSome: (detail) => permissionOf(loop, "bash", detail),
    })
    const outcome = yield* (allowed
      ? definition.value.run({ command }).pipe(
          Effect.match({
            onFailure: (error) => ({
              text: `工具出错：${error.message}`,
              status: Option.getOrElse(
                Option.fromNullable(error.denied),
                () => false,
              )
                ? ("denied" as const)
                : ("error" as const),
            }),
            onSuccess: (text) => ({ text, status: "ok" as const }),
          }),
        )
      : Effect.succeed({
          text: "用户拒绝了该命令的执行。",
          status: "denied" as const,
        }))
    yield* fireResult(
      loop.hooks,
      (h) => h.onToolResult,
      "bash",
      outcome.text,
      outcome.status,
    )
    return outcome.text
  })

interface LoopOutcome {
  readonly answer: string
  readonly appended: ReadonlyArray<LlmMessage>
}

const runLoop = (
  loop: LoopOptions,
  messages: ReadonlyArray<LlmMessage>,
): Effect.Effect<
  LoopOutcome,
  AskError,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const onDelta = Option.flatMap(loop.hooks, (hooks) =>
      Option.fromNullable(hooks.onDelta),
    )
    const options: CompleteOptions = {
      tools: loop.sendNative ? loop.specs : [],
      ...(Option.isSome(onDelta) ? { onDelta: onDelta.value } : {}),
    }
    const step = (
      current: ReadonlyArray<LlmMessage>,
      remaining: number,
      last: string,
      appended: ReadonlyArray<LlmMessage>,
    ): Effect.Effect<
      LoopOutcome,
      AskError,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient
    > =>
      remaining <= 0
        ? Effect.succeed({ answer: last, appended })
        : Effect.gen(function* () {
            const result = yield* complete(
              loop.config.api,
              loop.apiKey,
              current,
              options,
            )
            const calls = loop.execute ? result.toolCalls : []
            if (calls.length > 0) {
              const toolMessages = yield* Effect.all(
                calls.map((call) => runOneTool(loop, call)),
              )
              const assistant: LlmMessage = {
                role: "assistant",
                content: result.text,
                toolCalls: calls,
              }
              return yield* step(
                [...current, assistant, ...toolMessages],
                remaining - 1,
                result.text === "" ? last : result.text,
                [...appended, assistant, ...toolMessages],
              )
            }
            const executeText =
              loop.execute &&
              loop.capability !== "command" &&
              hasCommand(result.text)
            if (executeText) {
              const command = extractCommand(result.text)
              if (command !== "") {
                const output = yield* runBashText(loop, command)
                const assistant: LlmMessage = {
                  role: "assistant",
                  content: result.text,
                  toolCalls: [],
                }
                const feedback: LlmMessage = {
                  role: "user",
                  content: `命令输出：\n${output}\n\n请基于以上输出继续；如果已经可以回答用户，请直接给出最终回答，不要再输出命令块。`,
                }
                return yield* step(
                  [...current, assistant, feedback],
                  remaining - 1,
                  result.text,
                  [...appended, assistant, feedback],
                )
              }
            }
            return {
              answer: result.text === "" ? last : result.text,
              appended,
            }
          })
    return yield* step(messages, loop.maxSteps, "", [])
  })

const dropTrailingAssistant = (
  appended: ReadonlyArray<LlmMessage>,
): ReadonlyArray<LlmMessage> =>
  Option.match(Option.fromNullable(appended.at(-1)), {
    onNone: () => appended,
    onSome: (last) =>
      last.role === "assistant" ? appended.slice(0, -1) : appended,
  })

export const askWithHistory = (
  input: AskInput,
): Effect.Effect<
  AskOutcome,
  AskError,
  HttpClient.HttpClient | FileSystem.FileSystem | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const { config } = input
    if (config.debug) {
      const answer = buildDebugAnswer(
        input.capability,
        input.envVars,
        input.shellName,
        input.question,
      )
      return {
        answer,
        messages: [
          ...input.history,
          { role: "user", content: input.question },
          { role: "assistant", content: answer },
        ],
      }
    }
    const apiKey = yield* resolveApiKey(config.api)
    const tools = definitions(config.tools)
    const execute = config.tools.enable && config.tools.mode === "auto"
    const sendNative = execute && config.tools.native !== "off"
    const system: LlmMessage = {
      role: "system",
      content: composeSystemPrompt({
        preset: config.prompts.preset,
        capability: input.capability,
        overrides: config.prompts.modules,
        envVars: input.envVars,
        shellName: input.shellName,
        execution: execute,
      }),
    }
    const history: ReadonlyArray<LlmMessage> = input.history.map(toLlm)
    const loop: LoopOptions = {
      config,
      apiKey,
      capability: input.capability,
      tools,
      specs: tools.map((tool) => tool.spec),
      sendNative,
      execute,
      hooks: Option.fromNullable(input.hooks),
      maxSteps: config.tools.maxSteps,
    }
    const outcome = yield* runLoop(loop, [
      system,
      ...history,
      { role: "user", content: input.question },
    ])
    const answer = processAnswer(outcome.answer)
    const trace = dropTrailingAssistant(outcome.appended)
    const messages: ReadonlyArray<Message> = [
      ...input.history,
      { role: "user", content: input.question },
      ...trace.map(fromLlm),
      { role: "assistant", content: answer },
    ]
    return { answer, messages }
  })
