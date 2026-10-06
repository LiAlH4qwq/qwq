import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import { Registry } from "@effect-atom/atom"
import type { FileSystem } from "@effect/platform"
import { randomUUID } from "node:crypto"
import {
  Deferred,
  Effect,
  Layer,
  Option,
  Ref,
  Stream,
  SynchronizedRef,
} from "effect"
import { chatAtom, permissionAtom, sessionsAtom } from "@qwq/shared/client/atoms"
import {
  findConfigPath,
  findSessionArg,
  write,
} from "@qwq/shared/client/cli-util"
import {
  applyEvent,
  applySessionEvent,
  chatFromMessages,
  initialChatState,
  isChatEvent,
  type ChatEvent,
} from "@qwq/shared/client/state"
import { startTui } from "../client/tui"
import { loadConfig } from "@qwq/shared/config/load"
import { getEnvVars } from "@qwq/shared/domain/env"
import type { Config } from "@qwq/shared/config/schema"
import type {
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
  RemoteAskError,
} from "@qwq/shared/errors"
import { formatDiagnostic } from "@qwq/shared/diagnostics"
import { defaultConfigPath } from "@qwq/shared/paths"
import { QwqRpcClient } from "@qwq/shared/server/client"
import type { AskInput } from "@qwq/shared/server/rpc"
import { version } from "@qwq/shared/version"

const usage = `qwq-tui - 全屏终端界面（ink / React）

用法：
  qwq-tui [--config <path>] [--session <id>]   启动终端界面
  qwq-tui --help                               显示本帮助
  qwq-tui --version                            显示版本号

选项：
  -c, --config <path>   配置文件路径（默认 ./config.yaml）
  -s, --session <id>    继续指定会话（默认新建）
  -h, --help            显示帮助并退出
  -v, --version         显示版本并退出
`

const clientOf = (config: {
  readonly server: { readonly host: string; readonly port: number }
}) => ({ host: config.server.host, port: config.server.port })

const runTui = (
  config: Config,
  sessionArg: Option.Option<string>,
): Effect.Effect<
  void,
  ConfigReadError | ConfigParseError | ConfigValidationError,
  FileSystem.FileSystem | QwqRpcClient
> =>
  Effect.gen(function* () {
    const client = yield* QwqRpcClient
    const envVars = getEnvVars(config.envAccess.envVars)
    const current = yield* SynchronizedRef.make(
      Option.getOrElse(sessionArg, () => randomUUID()),
    )
    const registry = Registry.make()
    const done = yield* Deferred.make<void>()

    const seedCurrent = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        const sessionId = yield* SynchronizedRef.get(current)
        const loaded = yield* client.getSession(sessionId).pipe(
          Effect.option,
        )
        yield* Option.match(loaded, {
          onNone: () =>
            Effect.sync(() =>
              registry.update(chatAtom, () => initialChatState),
            ),
          onSome: (session) =>
            Effect.sync(() => {
              registry.update(chatAtom, () =>
                chatFromMessages(session.messages),
              )
              registry.update(sessionsAtom, (state) => ({
                ...state,
                current: Option.some(session.id),
              }))
            }),
        })
      })

    const refreshSessions = (): Effect.Effect<void> =>
      client.listSessions.pipe(
        Effect.tap((list) =>
          Effect.sync(() =>
            registry.update(sessionsAtom, (state) => ({ ...state, list })),
          ),
        ),
        Effect.ignore,
      )

    yield* Effect.all([seedCurrent(), refreshSessions()], {
      concurrency: "unbounded",
    })

    const instance = startTui(registry, {
      ask: (question) => {
        if (question === "/new") {
          Effect.runSync(SynchronizedRef.set(current, randomUUID()))
          registry.update(chatAtom, () => initialChatState)
          return
        }
        Effect.runFork(
          Effect.gen(function* () {
            const sessionId = yield* SynchronizedRef.get(current)
            const input: AskInput = {
              origin: "tui",
              sessionId,
              shell: "Tui",
              question,
              envVars,
            }
            yield* client.ask(input)
          }).pipe(Effect.ignore),
        )
      },
      selectSession: (sessionId) => {
        Effect.runFork(
          Effect.gen(function* () {
            yield* SynchronizedRef.set(current, sessionId)
            const session = yield* client.getSession(sessionId)
            registry.update(chatAtom, () => chatFromMessages(session.messages))
            registry.update(sessionsAtom, (state) => ({
              ...state,
              current: Option.some(sessionId),
            }))
          }).pipe(Effect.ignore),
        )
      },
      respondPermission: (requestId, allow) => {
        registry.update(permissionAtom, () => Option.none())
        Effect.runFork(
          client.respondPermission(requestId, allow).pipe(Effect.ignore),
        )
      },
      exit: () => {
        Effect.runFork(Deferred.succeed(done, void 0))
      },
    })

    // Chat deltas are coalesced and flushed at ~20fps so a fast token stream
    // does not re-render the terminal once per token (CPU / battery).
    const buffer = yield* Ref.make<ReadonlyArray<ChatEvent>>([])
    yield* Effect.forever(
      Effect.gen(function* () {
        yield* Effect.sleep("50 millis")
        const pending = yield* Ref.getAndSet(buffer, [])
        if (pending.length > 0) {
          const sessionId = yield* SynchronizedRef.get(current)
          const events = pending.filter(
            (event) => event.sessionId === sessionId,
          )
          if (events.length > 0) {
            yield* Effect.sync(() =>
              registry.update(chatAtom, (state) =>
                events.reduce((acc, event) => applyEvent(acc, event), state),
              ),
            )
          }
        }
      }),
    ).pipe(Effect.fork)

    yield* client.subscribe.pipe(
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          const sessionId = yield* SynchronizedRef.get(current)
          if (
            event._tag === "SessionUpserted" ||
            event._tag === "SessionDeleted"
          ) {
            yield* Effect.sync(() =>
              registry.update(sessionsAtom, (state) =>
                applySessionEvent(state, event),
              ),
            )
            return
          }
          if (event._tag === "Permission") {
            if (sessionId === event.sessionId) {
              yield* Effect.sync(() =>
                registry.update(permissionAtom, () =>
                  Option.some({
                    requestId: event.requestId,
                    tool: event.tool,
                    detail: event.detail,
                  }),
                ),
              )
            }
            return
          }
          if (isChatEvent(event)) {
            yield* Ref.update(buffer, (list) => [...list, event])
          }
        }),
      ),
      Effect.catchTag("RemoteAskError", (error: RemoteAskError) =>
        Effect.logWarning(`事件订阅失败：${error.message}`),
      ),
      Effect.fork,
    )
    yield* Deferred.await(done)
    instance.unmount()
  })

const program = Effect.gen(function* () {
  const argv = yield* Effect.sync(() => process.argv.slice(2))
  if (argv.includes("--help") || argv.includes("-h")) {
    yield* write(usage, "stdout")
    return
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    yield* write(`qwq-tui ${version}\n`, "stdout")
    return
  }
  const configPath = Option.getOrElse(findConfigPath(argv), () =>
    defaultConfigPath(),
  )
  const sessionArg = findSessionArg(argv)
  const config = yield* loadConfig(configPath)
  yield* runTui(config, sessionArg).pipe(
    Effect.provide(QwqRpcClient.layerSocket(clientOf(config))),
  )
})

const main = program.pipe(
  Effect.tapError((error) => write(`${formatDiagnostic(error)}\n`, "stderr")),
)

NodeRuntime.runMain(
  Effect.provide(main, Layer.mergeAll(NodeContext.layer, NodeHttpClient.layer)),
  { disableErrorReporting: true },
)
