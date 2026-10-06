import { describe, expect, it } from "vitest"
import {
  buildShellFunction,
  composeSystemPrompt,
  presetVoicePhrases,
} from "@qwq/server/agent/prompt"
import { commandBeginMarker } from "@qwq/shared/domain/markers"

const envVars = [
  { name: "SHELL", value: "/usr/bin/fish" },
  { name: "USER", value: "lialh4" },
]

describe("prompt composition", () => {
  it("uses the command module for the command capability", () => {
    const prompt = composeSystemPrompt({
      preset: "default",
      capability: "command",
      overrides: {},
      envVars,
      shellName: "FishShell",
      execution: false,
    })
    expect(prompt).toContain(commandBeginMarker)
    expect(prompt).toContain("当前 Shell：FishShell")
    expect(prompt).toContain("SHELL: /usr/bin/fish")
    expect(prompt).not.toContain("语音助手")
  })

  it("uses the voice module for the voice capability", () => {
    const prompt = composeSystemPrompt({
      preset: "default",
      capability: "voice",
      overrides: {},
      envVars: [],
      shellName: "",
      execution: false,
    })
    expect(prompt).toContain("语音助手")
    expect(prompt).not.toContain(commandBeginMarker)
  })

  it("uses the chat module for the chat capability", () => {
    const prompt = composeSystemPrompt({
      preset: "default",
      capability: "chat",
      overrides: {},
      envVars: [],
      shellName: "",
      execution: false,
    })
    expect(prompt).toContain("图形界面")
  })

  it("appends the agent module only when execution is enabled", () => {
    const withTools = composeSystemPrompt({
      preset: "default",
      capability: "voice",
      overrides: {},
      envVars: [],
      shellName: "",
      execution: true,
    })
    expect(withTools).toContain("bash")
    expect(withTools).toContain(commandBeginMarker)

    const without = composeSystemPrompt({
      preset: "default",
      capability: "voice",
      overrides: {},
      envVars: [],
      shellName: "",
      execution: false,
    })
    expect(without).not.toContain("bash")
  })

  it("applies the preset and per-module overrides", () => {
    const kawaii = composeSystemPrompt({
      preset: "kawaii",
      capability: "command",
      overrides: {},
      envVars: [],
      shellName: "",
      execution: false,
    })
    expect(kawaii).toContain("喵")

    const overridden = composeSystemPrompt({
      preset: "default",
      capability: "command",
      overrides: { common: "CUSTOM-COMMON" },
      envVars: [],
      shellName: "",
      execution: false,
    })
    expect(overridden).toContain("CUSTOM-COMMON")
  })
})

describe("voice phrases", () => {
  it("provides distinct preset acknowledgement and error phrases", () => {
    const standard = presetVoicePhrases("default")
    expect(standard.acknowledge).toBe("我在")
    expect(standard.asrError).toContain("语音识别")
    expect(standard.llmError).toContain("大模型")

    const cute = presetVoicePhrases("kawaii")
    expect(cute.acknowledge).toContain("喵")
    expect(cute.asrError).not.toBe(standard.asrError)
    expect(cute.llmError).not.toBe(standard.llmError)
  })
})

describe("shell integration", () => {
  it("renders a fish function", () => {
    const rendered = buildShellFunction({
      isExeFile: true,
      path: "qwq",
      funcName: "qwq",
      shell: "fish",
    })
    expect(rendered).toContain("function qwq")
    expect(rendered).toContain("qwq ask FishShell")
  })

  it("renders a posix function with a custom name", () => {
    const rendered = buildShellFunction({
      isExeFile: true,
      path: "qwq",
      funcName: "ask",
      shell: "sh",
    })
    expect(rendered).toContain("ask() {")
    expect(rendered).toContain("qwq ask PosixShell")
  })

  it("reports unsupported shells", () => {
    expect(
      buildShellFunction({
        isExeFile: true,
        path: "qwq",
        funcName: "qwq",
        shell: "nushell",
      }),
    ).toBe("暂不支持nushell")
  })
})
