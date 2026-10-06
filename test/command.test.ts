import { describe, expect, it } from "vitest"
import {
  extractCommand,
  extractText,
  hasCommand,
  processAnswer,
} from "@qwq/server/agent/command"
import {
  commandBeginMarker,
  commandEndMarker,
  terminateMarker,
  terminateMessage,
} from "@qwq/shared/domain/markers"

const withCommand = `先看看系统信息哦。

${commandBeginMarker}
uname -a
ls /
${commandEndMarker}`

describe("command parsing", () => {
  it("detects a command block", () => {
    expect(hasCommand(withCommand)).toBe(true)
    expect(hasCommand("只是普通回答")).toBe(false)
  })

  it("splits text and command", () => {
    expect(extractText(withCommand)).toBe("先看看系统信息哦。")
    expect(extractCommand(withCommand)).toBe("uname -a\nls /")
    expect(extractCommand("没有指令")).toBe("")
  })

  it("handles multiple command blocks by using the last one", () => {
    const text = `a\n${commandBeginMarker}\nfirst\n${commandEndMarker}\nb\n${commandBeginMarker}\nsecond\n${commandEndMarker}`
    expect(extractCommand(text)).toBe("second")
    expect(extractText(text)).toBe(`a\n${commandBeginMarker}\nfirst\n${commandEndMarker}\nb`)
  })

  it("maps the terminate marker to the termination message", () => {
    expect(processAnswer(`${terminateMarker}`)).toBe(terminateMessage)
    expect(processAnswer(`前文 ${terminateMarker}`)).toBe(terminateMessage)
    expect(processAnswer("正常回答")).toBe("正常回答")
  })
})
