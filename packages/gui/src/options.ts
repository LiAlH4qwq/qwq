import { Option } from "effect"

export const DEFAULT_SERVER = "ws://127.0.0.1:8787"
export const DEFAULT_POPUP_MS = 10000

export type PopupMode = "voice" | "all" | "none"
export type Theme = "light" | "dark"

export interface Options {
  readonly server: string
  readonly popupMs: number
  readonly theme: Theme
  readonly tray: boolean
  readonly hidden: boolean
  readonly popup: PopupMode
}

export type ParseResult =
  | { readonly _tag: "Run"; readonly options: Options }
  | { readonly _tag: "Help" }
  | { readonly _tag: "Version" }
  | { readonly _tag: "Error"; readonly message: string }

export type GuiEnv = Readonly<Record<string, string | undefined>>

const parseIntOption = (value: string): number | "error" => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : "error"
}

const popupModeOf = (value: string): PopupMode =>
  value === "all" || value === "none" ? value : "voice"

const themeOf = (value: string): Theme => (value === "dark" ? "dark" : "light")

export const parse = (
  args: ReadonlyArray<string>,
  env: GuiEnv,
): ParseResult => {
  const server = Option.getOrElse(
    Option.fromNullable(env["QWQ_SERVER"]),
    () => DEFAULT_SERVER,
  )
  const popupEnv = Option.getOrElse(
    Option.fromNullable(env["QWQ_GUI_POPUP_MS"]),
    () => String(DEFAULT_POPUP_MS),
  )
  const themeEnv = Option.getOrElse(
    Option.fromNullable(env["QWQ_GUI_THEME"]),
    () => "light",
  )
  const popupModeEnv = Option.getOrElse(
    Option.fromNullable(env["QWQ_GUI_POPUP"]),
    () => "voice",
  )
  const parsedPopup = parseIntOption(popupEnv)
  const base: Options = {
    server,
    popupMs: parsedPopup === "error" ? DEFAULT_POPUP_MS : parsedPopup,
    theme: themeOf(themeEnv),
    tray: true,
    hidden: false,
    popup: popupModeOf(popupModeEnv),
  }

  const step = (
    remaining: ReadonlyArray<string>,
    options: Options,
  ): ParseResult => {
    if (remaining.length === 0) {
      return { _tag: "Run", options }
    }
    const [head, ...rest] = remaining
    switch (head) {
      case "--help":
      case "-h":
        return { _tag: "Help" }
      case "--version":
      case "-v":
        return { _tag: "Version" }
      case "--no-tray":
        return step(rest, { ...options, tray: false })
      case "--hidden":
        return step(rest, { ...options, hidden: true })
      case "--server":
        return Option.match(Option.fromNullable(rest[0]), {
          onNone: () => ({ _tag: "Error", message: "--server 需要一个值" }),
          onSome: (value) => step(rest.slice(1), { ...options, server: value }),
        })
      case "--theme":
        return Option.match(Option.fromNullable(rest[0]), {
          onNone: () => ({ _tag: "Error", message: "--theme 需要一个值" }),
          onSome: (value) => {
            if (value !== "light" && value !== "dark") {
              return { _tag: "Error", message: "--theme 只能是 light 或 dark" }
            }
            return step(rest.slice(1), { ...options, theme: value })
          },
        })
      case "--popup":
        return Option.match(Option.fromNullable(rest[0]), {
          onNone: () => ({ _tag: "Error", message: "--popup 需要一个值" }),
          onSome: (value) => {
            if (value !== "voice" && value !== "all" && value !== "none") {
              return {
                _tag: "Error",
                message: "--popup 只能是 voice、all 或 none",
              }
            }
            return step(rest.slice(1), { ...options, popup: value })
          },
        })
      case "--popup-ms":
        return Option.match(Option.fromNullable(rest[0]), {
          onNone: () => ({ _tag: "Error", message: "--popup-ms 需要一个值" }),
          onSome: (value) => {
            const parsed = parseIntOption(value)
            return parsed === "error"
              ? { _tag: "Error", message: "--popup-ms 需要正整数" }
              : step(rest.slice(1), { ...options, popupMs: parsed })
          },
        })
      default:
        return { _tag: "Error", message: `未知参数：${head}` }
    }
  }
  return step(args, base)
}
