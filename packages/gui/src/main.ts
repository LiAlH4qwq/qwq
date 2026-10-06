import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from "electron"
import { Effect, HashMap, Option, Ref, Stream } from "effect"
import { join, resolve } from "node:path"
import { isVoiceActive, type SessionSummary } from "@qwq/shared/domain/session"
import type { AskInput, QwqEvent } from "@qwq/shared/server/rpc"
import { QwqRpcClient, type QwqRpcClientShape } from "@qwq/shared/server/client"
import { version } from "@qwq/shared/version"
import { DEFAULT_POPUP_MS, DEFAULT_SERVER, parse, type Options } from "./options"

const TRAY_ICON =
  "iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAKUlEQVR4nGOoirn2nxaYgeYGd+d8pQoeNXjU4FGDRw0eNXikGTxk6jwAXAFcmD9v6qYAAAAASUVORK5CYII="

const usage = `qwq-gui - qwq 桌面前端（Electron）

用法：
  qwq-gui [options]

选项：
  --server <ws-url>       服务器地址（默认 $QWQ_SERVER 或 ${DEFAULT_SERVER}）
  --popup-ms <n>          回复弹窗时长（默认 $QWQ_GUI_POPUP_MS 或 ${DEFAULT_POPUP_MS}）
  --popup <mode>          弹窗来源：voice（仅语音，默认）| all | none
  --theme <light|dark>    主题（默认 $QWQ_GUI_THEME 或 light）
  --no-tray               不注册系统托盘
  --hidden                启动时不显示聊天窗口
  -h, --help              显示本帮助并退出
  -v, --version           显示版本并退出
`

const chromiumFlagPrefixes = [
  "--no-sandbox",
  "--ozone-platform",
  "--enable-features",
  "--disable-features",
  "--disable-gpu",
  "--inspect",
  "--remote-debugging",
  "--user-data-dir",
  "--log-file",
  "--password-store",
  "--gtk-version",
  "--use-gl",
]

const appArgs = (): ReadonlyArray<string> => {
  const appPath = app.getAppPath()
  return process.argv
    .slice(1)
    .filter(
      (arg) =>
        arg !== process.execPath &&
        resolve(arg) !== resolve(appPath) &&
        !chromiumFlagPrefixes.some((prefix) => arg.startsWith(prefix)),
    )
}

type WindowKind = "chat" | "popup"

interface WindowSpec {
  readonly width: number
  readonly height: number
  readonly frame: boolean
  readonly alwaysOnTop: boolean
  readonly show: boolean
  readonly resizable: boolean
  readonly skipTaskbar: boolean
}

const specFor = (kind: WindowKind, options: Options): WindowSpec =>
  kind === "popup"
    ? {
        width: 460,
        height: 180,
        frame: false,
        alwaysOnTop: true,
        show: false,
        resizable: false,
        skipTaskbar: true,
      }
    : {
        width: 760,
        height: 560,
        frame: true,
        alwaysOnTop: false,
        show: !options.hidden,
        resizable: true,
        skipTaskbar: false,
      }

const textArg = (args: ReadonlyArray<unknown>, index: number): string =>
  Option.getOrElse(
    Option.map(Option.fromNullable(args[index]), (value) => String(value)),
    () => "",
  )

type Windows = Ref.Ref<HashMap.HashMap<WindowKind, BrowserWindow>>

const createWindow = (
  kind: WindowKind,
  options: Options,
): Effect.Effect<BrowserWindow> =>
  Effect.gen(function* () {
    const spec = specFor(kind, options)
    const window = yield* Effect.sync(
      () =>
        new BrowserWindow({
          width: spec.width,
          height: spec.height,
          frame: spec.frame,
          alwaysOnTop: spec.alwaysOnTop,
          show: spec.show,
          resizable: spec.resizable,
          skipTaskbar: spec.skipTaskbar,
          webPreferences: { nodeIntegration: true, contextIsolation: false },
        }),
    )
    yield* Effect.promise(() =>
      window.loadFile(join(__dirname, "..", "index.html"), {
        hash: kind,
        query: { popupMs: String(options.popupMs), theme: options.theme },
      }),
    )
    return window
  })

const getWindow = (
  windows: Windows,
  kind: WindowKind,
): Effect.Effect<Option.Option<BrowserWindow>> =>
  Ref.get(windows).pipe(Effect.map((map) => HashMap.get(map, kind)))

const ensureWindow = (
  windows: Windows,
  kind: WindowKind,
  options: Options,
): Effect.Effect<BrowserWindow> =>
  Effect.gen(function* () {
    const existing = yield* getWindow(windows, kind)
    if (Option.isSome(existing)) {
      return existing.value
    }
    const window = yield* createWindow(kind, options)
    // Drop the reference as soon as the window is destroyed so later sends
    // never touch a disposed Electron object ("Object has been destroyed").
    yield* Effect.sync(() =>
      window.on("closed", () =>
        Effect.runFork(
          Ref.update(windows, (map) => HashMap.remove(map, kind)),
        ),
      ),
    )
    yield* Ref.update(windows, (map) => HashMap.set(map, kind, window))
    return window
  })

const showWindow = (
  windows: Windows,
  kind: WindowKind,
  options: Options,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const window = yield* ensureWindow(windows, kind, options)
    yield* Effect.sync(() => {
      if (!window.isDestroyed()) {
        window.show()
      }
    })
  })

const hideWindow = (windows: Windows, kind: WindowKind): Effect.Effect<void> =>
  Effect.gen(function* () {
    const current = yield* getWindow(windows, kind)
    yield* Option.match(current, {
      onNone: () => Effect.void,
      onSome: (window) =>
        Effect.sync(() => {
          if (!window.isDestroyed()) {
            window.hide()
          }
        }),
    })
  })

const sendTo = (
  windows: Windows,
  kind: WindowKind,
  channel: string,
  payload: unknown,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const current = yield* getWindow(windows, kind)
    yield* Option.match(current, {
      onNone: () => Effect.void,
      onSome: (window) =>
        Effect.sync(() => {
          if (!window.isDestroyed()) {
            window.webContents.send(channel, payload)
          }
        }),
    })
  })

const shouldPopup = (
  options: Options,
  sessions: HashMap.HashMap<string, SessionSummary>,
  event: QwqEvent,
): boolean => {
  if (event._tag !== "Message" || event.role !== "assistant") {
    return false
  }
  if (options.popup === "none") {
    return false
  }
  if (options.popup === "all") {
    return true
  }
  return Option.exists(HashMap.get(sessions, event.sessionId), (summary) =>
    isVoiceActive(summary, Date.now()),
  )
}

const deliver = (
  options: Options,
  windows: Windows,
  sessions: Ref.Ref<HashMap.HashMap<string, SessionSummary>>,
  event: QwqEvent,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* sendTo(windows, "chat", "qwq-event", event)
    if (event._tag === "SessionUpserted") {
      yield* Ref.update(sessions, (map) =>
        HashMap.set(map, event.session.id, event.session),
      )
    }
    if (event._tag === "SessionDeleted") {
      yield* Ref.update(sessions, (map) =>
        HashMap.remove(map, event.sessionId),
      )
    }
    const current = yield* Ref.get(sessions)
    if (event._tag === "Message" && shouldPopup(options, current, event)) {
      yield* sendTo(windows, "popup", "qwq-popup", event.content)
      yield* showWindow(windows, "popup", options)
    }
  })

const createTray = (
  windows: Windows,
  options: Options,
): Effect.Effect<Option.Option<Tray>> =>
  Effect.try({
    try: () => {
      const image = nativeImage.createFromDataURL(
        `data:image/png;base64,${TRAY_ICON}`,
      )
      const instance = new Tray(image)
      instance.setToolTip("qwq")
      instance.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: "打开问答",
            click: () => Effect.runFork(showWindow(windows, "chat", options)),
          },
          {
            label: "显示最近回复",
            click: () => Effect.runFork(showWindow(windows, "popup", options)),
          },
          {
            label: "暂停/恢复自动关闭",
            click: () =>
              Effect.runFork(
                sendTo(windows, "popup", "qwq-toggle-pause", null),
              ),
          },
          { type: "separator" },
          { label: "退出", click: () => app.quit() },
        ]),
      )
      instance.on("click", () =>
        Effect.runFork(showWindow(windows, "chat", options)),
      )
      return instance
    },
    catch: (error) => error,
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => console.error("无法注册系统托盘：", error)),
    ),
    Effect.option,
  )

const registerIpc = (
  client: QwqRpcClientShape,
  windows: Windows,
  options: Options,
): Effect.Effect<void> =>
  Effect.sync(() => {
    ipcMain.on("qwq-list-sessions", () => {
      Effect.runFork(
        client.listSessions.pipe(
          Effect.tap((list) =>
            sendTo(windows, "chat", "qwq-sessions", list),
          ),
          Effect.ignore,
        ),
      )
    })
    ipcMain.on("qwq-get-session", (_event, ...args) => {
      const sessionId = textArg(args, 0)
      if (sessionId === "") {
        return
      }
      Effect.runFork(
        client.getSession(sessionId).pipe(
          Effect.tap((session) =>
            sendTo(windows, "chat", "qwq-session", session),
          ),
          Effect.ignore,
        ),
      )
    })
    ipcMain.on("qwq-ask", (_event, ...args) => {
      const rawId = textArg(args, 0)
      const question = textArg(args, 1).trim()
      if (question === "") {
        return
      }
      const base = {
        origin: "gui" as const,
        shell: "Gui",
        question,
        envVars: [],
      }
      const input: AskInput =
        rawId === "" ? base : { ...base, sessionId: rawId }
      Effect.runFork(client.ask(input).pipe(Effect.ignore))
    })
    ipcMain.on("qwq-rename-session", (_event, ...args) => {
      const sessionId = textArg(args, 0)
      const title = textArg(args, 1)
      if (sessionId === "" || title.trim() === "") {
        return
      }
      Effect.runFork(
        client.renameSession(sessionId, title).pipe(Effect.ignore),
      )
    })
    ipcMain.on("qwq-respond-permission", (_event, ...args) => {
      const requestId = textArg(args, 0)
      if (requestId === "") {
        return
      }
      const allow = args[1] === true
      Effect.runFork(
        client.respondPermission(requestId, allow).pipe(Effect.ignore),
      )
    })
    ipcMain.on("qwq-delete-session", (_event, ...args) => {
      const sessionId = textArg(args, 0)
      if (sessionId === "") {
        return
      }
      Effect.runFork(client.deleteSession(sessionId).pipe(Effect.ignore))
    })
    ipcMain.on("qwq-open-chat", () => {
      Effect.runFork(showWindow(windows, "chat", options))
    })
    ipcMain.on("qwq-hide-popup", () => {
      Effect.runFork(hideWindow(windows, "popup"))
    })
  })

const run = (options: Options): Effect.Effect<void, never, QwqRpcClient> =>
  Effect.gen(function* () {
    const client = yield* QwqRpcClient
    const windows = yield* Ref.make(
      HashMap.empty<WindowKind, BrowserWindow>(),
    )
    const sessions = yield* Ref.make(HashMap.empty<string, SessionSummary>())
    const tray = yield* Ref.make(Option.none<Tray>())

    yield* client.subscribe.pipe(
      Stream.runForEach((event) => deliver(options, windows, sessions, event)),
      Effect.catchTag("RemoteAskError", (error) =>
        Effect.logWarning(`事件订阅失败：${error.message}`),
      ),
      Effect.fork,
    )

    yield* registerIpc(client, windows, options)

    const created = yield* createTray(windows, options)
    yield* Ref.set(tray, created)

    yield* Effect.sync(() => {
      // With a tray the app stays alive when every window is closed; without
      // one it behaves like a normal windowed app.
      app.on("window-all-closed", () => {
        if (!options.tray) {
          app.quit()
        }
      })
      app.on("activate", () => {
        Effect.runFork(showWindow(windows, "chat", options))
      })
    })

    yield* showWindow(windows, "chat", options)
    yield* Effect.never
  })

const program = (options: Options): Effect.Effect<void, never, QwqRpcClient> =>
  Effect.gen(function* () {
    yield* Effect.promise(() => app.whenReady())
    yield* run(options)
  })

const parsed = parse(appArgs(), process.env)
if (parsed._tag === "Help") {
  process.stdout.write(usage)
  process.exit(0)
}
if (parsed._tag === "Version") {
  process.stdout.write(`qwq-gui ${version}\n`)
  process.exit(0)
}
if (parsed._tag === "Error") {
  process.stderr.write(`${parsed.message}\n\n${usage}`)
  process.exit(2)
}
const options: Options = parsed.options

void Effect.runPromise(
  program(options).pipe(
    Effect.provide(QwqRpcClient.layerSocketUrl(options.server)),
  ),
)
