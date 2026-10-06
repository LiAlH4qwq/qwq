import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  capabilityOf,
  characterCount,
  cleanTopic,
  fallbackTopic,
  isVoiceActive,
  originLabel,
  summarize,
  timeTitle,
  topicTitle,
  type Session,
} from "@qwq/shared/domain/session"

const session: Session = {
  id: "abc",
  title: "命令行：你好",
  origin: "cli",
  createdAt: 1000,
  updatedAt: 2000,
  voiceExpiresAt: 0,
  messages: [
    { role: "user", content: "你好呀" },
    { role: "assistant", content: "你好！" },
  ],
}

describe("session helpers", () => {
  it("summarises a session", () => {
    expect(summarize(session)).toEqual({
      id: "abc",
      title: "命令行：你好",
      origin: "cli",
      createdAt: 1000,
      updatedAt: 2000,
      voiceExpiresAt: 0,
      messageCount: 2,
    })
  })

  it("maps origins to prompt capabilities", () => {
    expect(capabilityOf("command")).toBe("command")
    expect(capabilityOf("voice")).toBe("voice")
    expect(capabilityOf("cli")).toBe("chat")
    expect(capabilityOf("tui")).toBe("chat")
    expect(capabilityOf("gui")).toBe("chat")
  })

  it("labels origins in Chinese", () => {
    expect(originLabel("voice")).toBe("语音")
    expect(originLabel("gui")).toBe("图形界面")
  })

  it("marks only active voice sessions", () => {
    expect(
      isVoiceActive({ origin: "voice", voiceExpiresAt: 5000 }, 4000),
    ).toBe(true)
    expect(
      isVoiceActive({ origin: "voice", voiceExpiresAt: 3000 }, 4000),
    ).toBe(false)
    expect(isVoiceActive({ origin: "cli", voiceExpiresAt: 9000 }, 4000)).toBe(
      false,
    )
  })

  it("counts characters", () => {
    expect(characterCount(session.messages)).toBe(6)
  })

  it("builds topics and time titles", () => {
    expect(topicTitle("voice", "天气")).toBe("语音：天气")
    expect(timeTitle("gui", 0)).toContain("图形界面：")
  })
})

describe("topic helpers", () => {
  it("falls back to the collapsed first message", () => {
    expect(Option.getOrThrow(fallbackTopic("  你好   世界 ", 20))).toBe(
      "你好 世界",
    )
    expect(Option.isNone(fallbackTopic("   ", 20))).toBe(true)
  })

  it("truncates long topics", () => {
    expect(Option.getOrThrow(fallbackTopic("一二三四五六", 3))).toBe("一二三…")
  })

  it("cleans model output", () => {
    expect(Option.getOrThrow(cleanTopic("「关于天气的讨论。」", 20))).toBe(
      "关于天气的讨论",
    )
    expect(Option.isNone(cleanTopic("  ", 20))).toBe(true)
  })
})
