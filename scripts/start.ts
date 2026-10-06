import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Command } from "@effect/platform"
import { Effect, Option } from "effect"

// `pnpm start <component>` runs a component from source (`tsx`), so no build is
// needed for the Node frontends. The Electron GUI is bundled first because its
// renderer must be compiled.
const usage = `qwq - 在仓库根目录启动任意组件

用法：
  pnpm start server [options]     启动服务器（qwq serve）
  pnpm start cli [arguments]      命令行客户端（qwq-cli）
  pnpm start tui [options]        全屏终端界面（qwq-tui）
  pnpm start voice [options]      语音前端（qwq-voice）
  pnpm start command [arguments]  Shell 集成（qwq-command）
  pnpm start gui [options]        图形前端（先构建，再用 Electron 启动）
  pnpm start                      等同于 pnpm start server

无参数时启动服务器。
`

type Component = "server" | "cli" | "tui" | "voice" | "command" | "gui"

const components: ReadonlyArray<Component> = [
  "server",
  "cli",
  "tui",
  "voice",
  "command",
  "gui",
]

const isComponent = (value: string): value is Component =>
  components.some((component) => component === value)

const entryOf = (component: Exclude<Component, "gui">): string => {
  switch (component) {
    case "server":
      return "packages/server/src/entries/qwq.ts"
    case "cli":
      return "packages/cli/src/entries/cli.ts"
    case "tui":
      return "packages/tui/src/entries/tui.ts"
    case "voice":
      return "packages/voice/src/entries/voice.ts"
    case "command":
      return "packages/command/src/entries/command.ts"
  }
}

const withInheritedStdio = (command: Command.Command): Command.Command =>
  command.pipe(
    Command.stdin("inherit"),
    Command.stdout("inherit"),
    Command.stderr("inherit"),
  )

const runNode = (
  component: Exclude<Component, "gui">,
  args: ReadonlyArray<string>,
) => {
  const prefix = component === "server" ? ["serve"] : []
  return Command.exitCode(
    withInheritedStdio(
      Command.make("pnpm", "exec", "tsx", entryOf(component), ...prefix, ...args),
    ),
  )
}

const runGui = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const build = yield* Command.exitCode(
      withInheritedStdio(Command.make("pnpm", "build:gui")),
    )
    if (build !== 0) {
      return build
    }
    return yield* Command.exitCode(
      withInheritedStdio(Command.make("electron", "packages/gui", ...args)),
    )
  })

const program = Effect.gen(function* () {
  const argv = yield* Effect.sync(() => process.argv.slice(2))
  const head = Option.getOrElse(
    Option.fromNullable(argv[0]),
    () => "server",
  )
  if (head === "--help" || head === "-h") {
    yield* Effect.sync(() => process.stdout.write(usage))
    return
  }
  if (!isComponent(head)) {
    yield* Effect.sync(() =>
      process.stderr.write(`未知组件：${head}\n\n${usage}`),
    )
    yield* Effect.sync(() => process.exit(2))
    return
  }
  const rest = argv.slice(1)
  const code =
    head === "gui" ? yield* runGui(rest) : yield* runNode(head, rest)
  if (code !== 0) {
    yield* Effect.sync(() => process.exit(code))
  }
})

NodeRuntime.runMain(
  Effect.provide(program, NodeContext.layer),
  { disableErrorReporting: true },
)
