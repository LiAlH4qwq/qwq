import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import type { CommandExecutor, FileSystem } from "@effect/platform"
import { Console, Effect, Layer, Option } from "effect"
import { findConfigPath, stripConfigArgs, write } from "@qwq/shared/client/cli-util"
import { loadConfig } from "@qwq/shared/config/load"
import { formatDiagnostic } from "@qwq/shared/diagnostics"
import { ServerStartError } from "@qwq/shared/errors"
import type {
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
} from "@qwq/shared/errors"
import { defaultConfigPath } from "@qwq/shared/paths"
import { serverLayer } from "../server/service"
import { layer as sessionStoreLayer } from "../server/sessions"
import { version } from "@qwq/shared/version"

const usage = `qwq - 本地优先的 AI 伴侣服务器

用法：
  qwq serve [--config <path>]     运行服务器
  qwq --help                      显示本帮助
  qwq --version                   显示版本号

前端是独立的程序：
  qwq-command   Shell 集成（一次性提问）
  qwq-cli       非交互接口（ask / repl / list / get / rename / delete / schema）
  qwq-tui       全屏终端界面（ink / React）
  qwq-voice     语音前端
  qwq-gui       图形界面（Electron）

选项：
  -c, --config <path>   配置文件路径（默认 ./config.yaml）
  -h, --help            显示帮助并退出
  -v, --version         显示版本并退出
`

const runServe = (
  configPath: string,
): Effect.Effect<
  void,
  | ConfigReadError
  | ConfigParseError
  | ConfigValidationError
  | ServerStartError,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const config = yield* loadConfig(configPath)
    yield* Layer.launch(
      serverLayer({
        host: config.server.host,
        port: config.server.port,
        permissionTimeoutMs: config.tools.permission.timeoutMs,
      }).pipe(
        Layer.provide(sessionStoreLayer(config)),
        Layer.provide(NodeHttpClient.layer),
      ),
    ).pipe(Effect.mapError((cause) => new ServerStartError({ cause })))
  })

const program = Effect.gen(function* () {
  const argv = yield* Effect.sync(() => process.argv.slice(2))
  if (argv.includes("--help") || argv.includes("-h")) {
    yield* Console.log(usage)
    return
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    yield* Console.log(`qwq ${version}`)
    return
  }
  const configPath = Option.getOrElse(findConfigPath(argv), () =>
    defaultConfigPath(),
  )
  const args = stripConfigArgs(argv)
  if (args.at(0) === "serve") {
    yield* runServe(configPath)
  } else {
    yield* Console.log(usage)
  }
})

const main = program.pipe(
  Effect.tapError((error) => write(`${formatDiagnostic(error)}\n`, "stderr")),
)

NodeRuntime.runMain(
  Effect.provide(main, Layer.mergeAll(NodeContext.layer, NodeHttpClient.layer)),
  { disableErrorReporting: true },
)
