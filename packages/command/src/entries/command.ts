import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import type { FileSystem } from "@effect/platform"
import { Console, Effect, Layer, Match, Option } from "effect"
import { extractCommand, extractText, hasCommand } from "@qwq/server/agent/command"
import { buildShellFunction } from "@qwq/server/agent/prompt"
import { findConfigPath, shellNameOf, stripConfigArgs, write } from "@qwq/shared/client/cli-util"
import { loadConfig } from "@qwq/shared/config/load"
import { getEnvVars } from "@qwq/shared/domain/env"
import { formatDiagnostic } from "@qwq/shared/diagnostics"
import type {
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
  RemoteAskError,
} from "@qwq/shared/errors"
import { defaultConfigPath } from "@qwq/shared/paths"
import { QwqRpcClient } from "@qwq/shared/server/client"
import { version } from "@qwq/shared/version"

const usage = `qwq-command - 指令建议 / Shell 集成客户端

用法：
  qwq-command ask <shell> <question...>   通过服务器提问（Shell 集成使用）
  qwq-command integrate-shell <shell> [func]  输出 Shell 函数
  qwq-command check-cmd-exist <answer...> 回答中是否含命令
  qwq-command extract-text <answer...>    取出回答文本
  qwq-command extract-cmd <answer...>     取出命令
  qwq-command --help                      显示本帮助
  qwq-command --version                   显示版本号

选项：
  -c, --config <path>   配置文件路径（默认 ./config.yaml）
  -h, --help            显示帮助并退出
  -v, --version         显示版本并退出
`

const runAsk = (
  args: ReadonlyArray<string>,
  configPath: string,
): Effect.Effect<
  void,
  | ConfigReadError
  | ConfigParseError
  | ConfigValidationError
  | RemoteAskError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const config = yield* loadConfig(configPath)
    const shellName = shellNameOf(Option.fromNullable(args.at(0)))
    const question = args.slice(1).join(" ").trim()
    const envVars = getEnvVars(config.envAccess.envVars)
    const result = yield* Effect.gen(function* () {
      const client = yield* QwqRpcClient
      return yield* client.ask({
        origin: "command",
        shell: shellName,
        question,
        envVars,
      })
    }).pipe(
      Effect.provide(
        QwqRpcClient.layerSocket({
          host: config.server.host,
          port: config.server.port,
        }),
      ),
    )
    yield* Console.log(result.answer)
  })

const runCheckCmdExist = (args: ReadonlyArray<string>): Effect.Effect<void> =>
  Console.log(hasCommand(args.join(" ").trim()) ? "true" : "false")

const runExtractText = (args: ReadonlyArray<string>): Effect.Effect<void> =>
  Console.log(extractText(args.join(" ").trim()))

const runExtractCommand = (args: ReadonlyArray<string>): Effect.Effect<void> =>
  Console.log(extractCommand(args.join(" ").trim()))

const runIntegrateShell = (args: ReadonlyArray<string>): Effect.Effect<void> =>
  Console.log(
    buildShellFunction({
      isExeFile: true,
      path: "qwq-command",
      funcName: Option.getOrElse(Option.fromNullable(args.at(1)), () => "qwq"),
      shell: shellNameOf(Option.fromNullable(args.at(0))).toLowerCase(),
    }),
  )

const program = Effect.gen(function* () {
  const argv = yield* Effect.sync(() => process.argv.slice(2))
  if (argv.includes("--help") || argv.includes("-h")) {
    yield* Console.log(usage)
    return
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    yield* Console.log(`qwq-command ${version}`)
    return
  }
  const configPath = Option.getOrElse(findConfigPath(argv), () =>
    defaultConfigPath(),
  )
  const args = stripConfigArgs(argv)
  yield* Match.value(args.at(0)).pipe(
    Match.when("ask", () => runAsk(args.slice(1), configPath)),
    Match.when("check-cmd-exist", () => runCheckCmdExist(args.slice(1))),
    Match.when("extract-text", () => runExtractText(args.slice(1))),
    Match.when("extract-cmd", () => runExtractCommand(args.slice(1))),
    Match.when("integrate-shell", () => runIntegrateShell(args.slice(1))),
    Match.orElse(() => Console.log(usage)),
  )
})

const main = program.pipe(
  Effect.tapError((error) => write(`${formatDiagnostic(error)}\n`, "stderr")),
)

NodeRuntime.runMain(
  Effect.provide(main, Layer.mergeAll(NodeContext.layer, NodeHttpClient.layer)),
  { disableErrorReporting: true },
)
