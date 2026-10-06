import { describe, expect, it } from "vitest"
import {
  DEFAULT_POPUP_MS,
  DEFAULT_SERVER,
  parse,
} from "../packages/gui/src/options"

describe("gui options", () => {
  it("uses defaults and environment overrides", () => {
    expect(parse([], {})).toEqual({
      _tag: "Run",
      options: {
        server: DEFAULT_SERVER,
        popupMs: DEFAULT_POPUP_MS,
        theme: "light",
        tray: true,
        hidden: false,
        popup: "voice",
      },
    })
    expect(
      parse([], {
        QWQ_SERVER: "ws://example:9",
        QWQ_GUI_POPUP_MS: "500",
        QWQ_GUI_THEME: "dark",
        QWQ_GUI_POPUP: "all",
      }),
    ).toEqual({
      _tag: "Run",
      options: {
        server: "ws://example:9",
        popupMs: 500,
        theme: "dark",
        tray: true,
        hidden: false,
        popup: "all",
      },
    })
  })

  it("parses flags", () => {
    expect(
      parse(["--server", "ws://x:1", "--popup-ms", "250", "--popup", "none", "--theme", "dark", "--no-tray", "--hidden"], {}),
    ).toEqual({
      _tag: "Run",
      options: {
        server: "ws://x:1",
        popupMs: 250,
        theme: "dark",
        tray: false,
        hidden: true,
        popup: "none",
      },
    })
  })

  it("reports help and version", () => {
    expect(parse(["--help"], {})).toEqual({ _tag: "Help" })
    expect(parse(["-v"], {})).toEqual({ _tag: "Version" })
  })

  it("rejects unknown flags and bad values", () => {
    expect(parse(["--nope"], {})).toEqual({
      _tag: "Error",
      message: "未知参数：--nope",
    })
    expect(parse(["--theme", "blue"], {})).toEqual({
      _tag: "Error",
      message: "--theme 只能是 light 或 dark",
    })
    expect(parse(["--popup-ms", "0"], {})).toEqual({
      _tag: "Error",
      message: "--popup-ms 需要正整数",
    })
  })
})
