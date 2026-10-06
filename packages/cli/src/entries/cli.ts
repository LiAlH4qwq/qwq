import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import { readFileSync, writeSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline"
import {
  Effect,
  Layer,
  Option,
  Queue,
  Schema,
  SynchronizedRef,
} from "effect"
import type { Config } from "@qwq/shared/config/schema"
import { schemaDocument } from "../client/cli-schema"
import { findValue, stripValue, write } from "@qwq/shared/client/cli-util"
import { loadConfig } from "@qwq/shared/config/load"
import { getEnvVars } from "@qwq/shared/domain/env"
import { formatTime, type SessionSummary } from "@qwq/shared/domain/session"
import { formatDiagnostic } from "@qwq/shared/diagnostics"
import type { RemoteAskError } from "@qwq/shared/errors"
import { UsageError } from "@qwq/shared/errors"
import { defaultConfigPath } from "@qwq/shared/paths"
import {
  askWithEvents,
  QwqRpcClient,
  type ClientOptions,
} from "@qwq/shared/server/client"
import type { AskInput } from "@qwq/shared/server/rpc"
import { version } from "@qwq/shared/version"

const usage = `qwq-cli - 文本前端（机器友好的非交互接口 + REPL）

用法：
  qwq-cli ask [question...]              一次性提问（无参数或 - 从 stdin 读取）
  qwq-cli repl                           交互式 REPL（人类）
  qwq-cli repl --agent                   机器 REPL（ENQ 就绪，逐行提问）
  qwq-cli repl --protocol json           机器 REPL（ENQ + JSON 行协议）
  qwq-cli list                           列出所有会话
  qwq-cli get <id>                       输出一个会话
  qwq-cli rename <id> <title>            重命名会话
  qwq-cli delete <id>                    删除会话
  qwq-cli schema [--pretty]              输出本 CLI 的机器可读契约
  qwq-cli --help / --version

选项：
  -c, --config <path>        配置文件路径（默认 ./config.yaml）
  -s, --session <id>         继续指定会话（默认新建）
  -F, --format <fmt>         text | json | raw（非 TTY 默认 json）
      --permission <mode>    deny（默认，机器安全）| auto
      --stream               流式输出增量（仅 ask / 人类 repl）
      --error-format <fmt>   text | json（默认：TTY 为 text，否则 json）
  -q, --quiet                抑制 stderr 上的工具进度
  -h, --help                 显示帮助并退出
  -v, --version              显示版本并退出
`

type Format = "text" | "json" | "raw"
type ErrorFormat = "text" | "json"
type Permission = "deny" | "auto"
type Protocol = "interactive" | "enq" | "json"

interface Options {
  readonly configPath: string
  readonly session: Option.Option<string>
  readonly format: Format
  readonly errorFormat: ErrorFormat
  readonly permission: Permission
  readonly protocol: Protocol
  readonly stream: boolean
  readonly quiet: boolean
  readonly pretty: boolean
  readonly positionals: ReadonlyArray<string>
}

const hasFlag = (
  argv: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
): boolean => argv.some((arg) => names.includes(arg))

const valueNames: ReadonlyArray<string> = [
  "--config",
  "-c",
  "--format",
  "-F",
  "--session",
  "-s",
  "--permission",
  "--protocol",
  "--error-format",
]

const flagNames: ReadonlyArray<string> = [
  "--agent",
  "--automation",
  "--stream",
  "--quiet",
  "-q",
  "--json",
  "--pretty",
]

const parseOption = (argv: ReadonlyArray<string>): Options => {
  const format: Format = Option.match(findValue(argv, ["--format", "-F"]), {
    onNone: () => (hasFlag(argv, ["--json"]) ? "json" : process.stdout.isTTY ? "text" : "json"),
    onSome: (value) =>
      value === "json" || value === "raw" ? value : "text",
  })
  const errorFormat: ErrorFormat = Option.match(
    findValue(argv, ["--error-format"]),
    {
      onNone: () => (process.stderr.isTTY ? "text" : "json"),
      onSome: (value) => (value === "json" ? "json" : "text"),
    },
  )
  const permission: Permission = Option.match(
    findValue(argv, ["--permission"]),
    {
      onNone: () => "deny",
      onSome: (value) => (value === "auto" ? "auto" : "deny"),
    },
  )
  const protocol: Protocol = hasFlag(argv, ["--agent", "--automation"])
    ? "enq"
    : Option.match(findValue(argv, ["--protocol"]), {
        onNone: () => "interactive",
        onSome: (value) =>
          value === "json" ? "json" : value === "enq" ? "enq" : "interactive",
      })
  return {
    configPath: Option.getOrElse(findValue(argv, ["--config", "-c"]), () =>
      defaultConfigPath(),
    ),
    session: findValue(argv, ["--session", "-s"]),
    format,
    errorFormat,
    permission,
    protocol,
    stream: hasFlag(argv, ["--stream"]),
    quiet: hasFlag(argv, ["--quiet", "-q"]),
    pretty: hasFlag(argv, ["--pretty"]),
    positionals: stripValue(stripValue(argv, valueNames), flagNames),
  }
}

const clientOf = (config: Config): ClientOptions => ({
  host: config.server.host,
  port: config.server.port,
})

const tagOf = (error: unknown): string =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error
    ? String((error as { readonly _tag: unknown })._tag)
    : "Error"

const isUsage = (error: unknown): boolean => tagOf(error) === "UsageError"

// Diagnostics are written synchronously to fd 2 so a following `process.exit`
// cannot truncate them on a pipe.
const emitDiagnostics = (
  error: unknown,
  format: ErrorFormat,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const text =
      format === "json"
        ? `${JSON.stringify({
            version: 1,
            ok: false,
            diagnostics: [
              { code: tagOf(error), message: formatDiagnostic(error) },
            ],
          })}\n`
        : `${formatDiagnostic(error)}\n`
    writeSync(2, text)
  })

const formatSessions = (
  sessions: ReadonlyArray<SessionSummary>,
  format: Format,
): string => {
  if (format === "json") {
    return JSON.stringify(
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        origin: session.origin,
        messages: session.messageCount,
        updatedAt: session.updatedAt,
      })),
    )
  }
  return sessions.length === 0
    ? "（暂无会话）"
    : sessions
        .map(
          (session) =>
            `${session.title}\n  id: ${session.id}  前端: ${session.origin}  消息: ${session.messageCount}  更新: ${formatTime(session.updatedAt)}`,
        )
        .join("\n")
}

const runList = (
  _config: Config,
  options: Options,
): Effect.Effect<string, RemoteAskError, QwqRpcClient> =>
  Effect.gen(function* () {
    const client = yield* QwqRpcClient
    const sessions = yield* client.listSessions
    return formatSessions(sessions, options.format)
  })

interface AskOutcome {
  readonly sessionId: string
  readonly answer: string
  readonly streamed: boolean
}

const runAskOnce = (
  config: Config,
  options: Options,
  sessionId: string,
  question: string,
): Effect.Effect<AskOutcome, RemoteAskError, QwqRpcClient> =>
  Effect.gen(function* () {
    const client = yield* QwqRpcClient
    const envVars = getEnvVars(config.envAccess.envVars)
    const streamed = yield* SynchronizedRef.make(false)
    const input: AskInput = {
      origin: "cli",
      sessionId,
      shell: "Cli",
      question,
      envVars,
    }
    const result = yield* askWithEvents(input, {
      onDelta: (text) =>
        options.stream
          ? SynchronizedRef.set(streamed, true).pipe(
              Effect.zipRight(write(text, "stdout")),
            )
          : Effect.void,
      onTool: (name, _detail, phase) =>
        options.quiet
          ? Effect.void
          : write(`[${phase === "start" ? "▶" : "✓"} ${name}]\n`, "stderr"),
      onPermission: ({ requestId, tool, detail }) =>
        Effect.gen(function* () {
          const allow = options.permission === "auto"
          if (!options.quiet) {
            yield* write(
              `[? ${tool} ${allow ? "自动允许" : "自动拒绝"}: ${detail}]\n`,
              "stderr",
            )
          }
          yield* client.respondPermission(requestId, allow).pipe(
            Effect.ignore,
          )
        }),
    })
    return {
      sessionId: result.sessionId,
      answer: result.answer,
      streamed: yield* SynchronizedRef.get(streamed),
    }
  })

const renderAnswer = (outcome: AskOutcome, options: Options): string => {
  if (options.format === "json") {
    return JSON.stringify({
      sessionId: outcome.sessionId,
      answer: outcome.answer,
    })
  }
  if (outcome.streamed && options.stream) {
    return ""
  }
  return outcome.answer
}

const readStdin = (): Effect.Effect<string> =>
  process.stdin.isTTY
    ? Effect.succeed("")
    : Effect.try(() => readFileSync(0, "utf8")).pipe(
        Effect.orElseSucceed(() => ""),
      )

const runAsk = (
  config: Config,
  options: Options,
): Effect.Effect<string, UsageError | RemoteAskError, QwqRpcClient> =>
  Effect.gen(function* () {
    const fromArgs = options.positionals.join(" ").trim()
    const question =
      fromArgs === "" || fromArgs === "-"
        ? (yield* readStdin()).trim()
        : fromArgs
    if (question === "") {
      return yield* Effect.fail(
        new UsageError({ message: "缺少问题（位置参数或 stdin）" }),
      )
    }
    const sessionId = Option.getOrElse(options.session, () => randomUUID())
    const outcome = yield* runAskOnce(config, options, sessionId, question)
    return renderAnswer(outcome, options)
  })

/* ------------------------------------------------------------------ */
/* REPL                                                                */
/* ------------------------------------------------------------------ */

const replRequest = Schema.Struct({
  question: Schema.optional(Schema.String),
  input: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
})

const requestText = (
  request: typeof replRequest.Type,
): Option.Option<string> =>
  Option.firstSomeOf([
    Option.fromNullable(request.question),
    Option.fromNullable(request.input),
    Option.fromNullable(request.command),
  ])

const renderHistory = (
  messages: ReadonlyArray<{ readonly role: string; readonly content: string }>,
): string =>
  messages
    .filter((message) => message.role !== "system")
    .map((message) =>
      message.role === "user"
        ? `你：${message.content}`
        : `qwq：${message.content}`,
    )
    .join("\n")

const respondLine = (payload: unknown): Effect.Effect<void> =>
  write(`${JSON.stringify(payload)}\n`, "stdout")

const runReplInteractive = (
  config: Config,
  options: Options,
): Effect.Effect<void, RemoteAskError, QwqRpcClient> =>
  Effect.gen(function* () {
    const client = yield* QwqRpcClient
    const current = yield* SynchronizedRef.make(
      Option.getOrElse(options.session, () => randomUUID()),
    )
    if (Option.isSome(options.session)) {
      const loaded = yield* client.getSession(options.session.value).pipe(
        Effect.option,
      )
      yield* Option.match(loaded, {
        onNone: () => Effect.void,
        onSome: (session) =>
          write(`${renderHistory(session.messages)}\n\n`, "stdout"),
      })
    }
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY,
    })
    const queue = yield* Queue.unbounded<Option.Option<string>>()
    yield* Effect.sync(() => {
      readline.on("line", (line) => Queue.unsafeOffer(queue, Option.some(line)))
      readline.on("close", () => Queue.unsafeOffer(queue, Option.none()))
    })
    yield* write(
      "qwq-cli REPL — :help 帮助，:new 新建，:sessions 列表，:quit 退出\n\n",
      "stdout",
    )
    const loop = (): Effect.Effect<void, RemoteAskError, QwqRpcClient> =>
      Effect.gen(function* () {
        yield* write("qwq> ", "stdout")
        const line = yield* Queue.take(queue)
        if (Option.isNone(line)) {
          return
        }
        const question = line.value.trim()
        if (question === "") {
          return yield* loop()
        }
        if (question === ":quit" || question === ":exit") {
          return
        }
        if (question === ":new") {
          yield* SynchronizedRef.set(current, randomUUID())
          yield* write("已开始新会话。\n\n", "stdout")
          return yield* loop()
        }
        if (question === ":sessions" || question === ":list") {
          const sessions = yield* client.listSessions.pipe(
            Effect.orElseSucceed(() => [] as ReadonlyArray<SessionSummary>),
          )
          yield* write(`${formatSessions(sessions, "text")}\n\n`, "stdout")
          return yield* loop()
        }
        if (question.startsWith(":session ")) {
          yield* SynchronizedRef.set(
            current,
            question.slice(":session ".length).trim(),
          )
          yield* write("已切换会话。\n\n", "stdout")
          return yield* loop()
        }
        if (question === ":help") {
          yield* write(
            ":new 新建 · :sessions 列表 · :session <id> 切换 · :quit 退出\n\n",
            "stdout",
          )
          return yield* loop()
        }
        const sessionId = yield* SynchronizedRef.get(current)
        const outcome = yield* runAskOnce(config, options, sessionId, question)
        yield* write(
          outcome.streamed ? "\n" : `\n${outcome.answer}\n\n`,
          "stdout",
        )
        return yield* loop()
      })
    yield* loop().pipe(Effect.ensuring(Effect.sync(() => readline.close())))
  })

const enq = Effect.sync(() => {
  process.stdout.write("\x05")
})

const runReplMachine = (
  config: Config,
  options: Options,
): Effect.Effect<void, RemoteAskError, QwqRpcClient> =>
  Effect.gen(function* () {
    const current = yield* SynchronizedRef.make(
      Option.getOrElse(options.session, () => randomUUID()),
    )
    const readline = createInterface({
      input: process.stdin,
      terminal: false,
    })
    const queue = yield* Queue.unbounded<Option.Option<string>>()
    yield* Effect.sync(() => {
      readline.on("line", (line) => Queue.unsafeOffer(queue, Option.some(line)))
      readline.on("close", () => Queue.unsafeOffer(queue, Option.none()))
    })
    const machineOptions: Options = {
      ...options,
      stream: false,
      quiet: true,
      format: "text",
    }
    const decodeRequest = (line: string): Option.Option<string> =>
      options.protocol === "enq"
        ? Option.some(line.trim())
        : Option.flatMap(
            Schema.decodeUnknownOption(Schema.parseJson(replRequest))(line),
            requestText,
          )
    const loop = (): Effect.Effect<void, RemoteAskError, QwqRpcClient> =>
      Effect.gen(function* () {
        yield* enq
        const line = yield* Queue.take(queue)
        if (Option.isNone(line)) {
          return
        }
        const question = Option.getOrElse(
          decodeRequest(line.value),
          () => "",
        )
        if (question === "") {
          yield* respondLine({ ok: false, error: "empty request" })
          return yield* loop()
        }
        if (question === ":quit" || question === ":exit") {
          return
        }
        const sessionId = yield* SynchronizedRef.get(current)
        const result = yield* runAskOnce(
          config,
          machineOptions,
          sessionId,
          question,
        ).pipe(Effect.option)
        yield* Option.match(result, {
          onNone: () => respondLine({ ok: false, error: "request failed" }),
          onSome: (value) =>
            respondLine({
              ok: true,
              sessionId: value.sessionId,
              answer: value.answer,
            }),
        })
        return yield* loop()
      })
    yield* loop().pipe(Effect.ensuring(Effect.sync(() => readline.close())))
  })

/* ------------------------------------------------------------------ */
/* session management + schema                                         */
/* ------------------------------------------------------------------ */

const runGet = (
  _config: Config,
  options: Options,
  id: string,
): Effect.Effect<string, RemoteAskError, QwqRpcClient> =>
  Effect.gen(function* () {
    const client = yield* QwqRpcClient
    const session = yield* client.getSession(id)
    return options.format === "json"
      ? JSON.stringify(session)
      : renderHistory(session.messages)
  })

const runRename = (
  _config: Config,
  options: Options,
  id: string,
  title: string,
): Effect.Effect<string, RemoteAskError, QwqRpcClient> =>
  Effect.gen(function* () {
    const client = yield* QwqRpcClient
    const summary = yield* client.renameSession(id, title)
    return options.format === "json"
      ? JSON.stringify(summary)
      : `已重命名：${summary.title}`
  })

const runDelete = (
  _config: Config,
  options: Options,
  id: string,
): Effect.Effect<string, RemoteAskError, QwqRpcClient> =>
  Effect.gen(function* () {
    const client = yield* QwqRpcClient
    const result = yield* client.deleteSession(id)
    return options.format === "json"
      ? JSON.stringify(result)
      : result.ok
        ? "已删除。"
        : "未删除。"
  })

/* ------------------------------------------------------------------ */
/* program                                                             */
/* ------------------------------------------------------------------ */

const knownCommands: ReadonlyArray<string> = [
  "list",
  "ask",
  "repl",
  "get",
  "rename",
  "delete",
]

const program = Effect.gen(function* () {
  const argv = yield* Effect.sync(() => process.argv.slice(2))
  if (
    argv.length === 0 ||
    argv.includes("--help") ||
    argv.includes("-h")
  ) {
    yield* write(usage, "stdout")
    return
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    yield* write(`qwq-cli ${version}\n`, "stdout")
    return
  }
  const options = parseOption(argv)
  const command = options.positionals.at(0)
  if (command === "schema") {
    yield* write(
      `${JSON.stringify(schemaDocument(), null, options.pretty ? 2 : 0)}\n`,
      "stdout",
    )
    return
  }
  if (
    !Option.exists(
      Option.fromNullable(command),
      (name) => knownCommands.includes(name),
    )
  ) {
    return yield* Effect.fail(
      new UsageError({
        message: `未知命令：${Option.getOrElse(
          Option.fromNullable(command),
          () => "",
        )}`,
      }),
    )
  }
  const config = yield* loadConfig(options.configPath)
  const clientLayer = QwqRpcClient.layerSocket(clientOf(config))
  const withClient = <A, E>(
    effect: Effect.Effect<A, E, QwqRpcClient>,
  ): Effect.Effect<A, E> => Effect.provide(effect, clientLayer)
  if (command === "list") {
    yield* write(`${yield* withClient(runList(config, options))}\n`, "stdout")
    return
  }
  if (command === "ask") {
    const askOptions: Options = {
      ...options,
      positionals: options.positionals.slice(1),
    }
    yield* write(`${yield* withClient(runAsk(config, askOptions))}\n`, "stdout")
    return
  }
  if (command === "repl") {
    yield* withClient(
      options.protocol === "interactive"
        ? runReplInteractive(config, options)
        : runReplMachine(config, options),
    )
    return
  }
  if (command === "get") {
    const id = Option.fromNullable(options.positionals.at(1))
    if (Option.isNone(id)) {
      return yield* Effect.fail(new UsageError({ message: "get 需要 <id>" }))
    }
    yield* write(
      `${yield* withClient(runGet(config, options, id.value))}\n`,
      "stdout",
    )
    return
  }
  if (command === "rename") {
    const id = Option.fromNullable(options.positionals.at(1))
    if (Option.isNone(id)) {
      return yield* Effect.fail(
        new UsageError({ message: "rename 需要 <id> <title>" }),
      )
    }
    const title = options.positionals.slice(2).join(" ").trim()
    if (title === "") {
      return yield* Effect.fail(
        new UsageError({ message: "rename 需要 <id> <title>" }),
      )
    }
    yield* write(
      `${yield* withClient(runRename(config, options, id.value, title))}\n`,
      "stdout",
    )
    return
  }
  if (command === "delete") {
    const id = Option.fromNullable(options.positionals.at(1))
    if (Option.isNone(id)) {
      return yield* Effect.fail(new UsageError({ message: "delete 需要 <id>" }))
    }
    yield* write(
      `${yield* withClient(runDelete(config, options, id.value))}\n`,
      "stdout",
    )
    return
  }
  return yield* Effect.fail(
    new UsageError({
      message: `未知命令：${Option.getOrElse(
        Option.fromNullable(command),
        () => "",
      )}`,
    }),
  )
})

const main = program.pipe(
  Effect.matchEffect({
    onFailure: (error) =>
      emitDiagnostics(
        error,
        isUsage(error)
          ? "text"
          : process.stderr.isTTY
            ? "text"
            : "json",
      ).pipe(
        Effect.zipRight(
          Effect.sync(() => {
            process.exit(isUsage(error) ? 2 : 1)
          }),
        ),
      ),
    onSuccess: () => Effect.void,
  }),
)

NodeRuntime.runMain(
  Effect.provide(main, Layer.mergeAll(NodeContext.layer, NodeHttpClient.layer)),
  { disableErrorReporting: true },
)
