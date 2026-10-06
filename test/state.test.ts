import { describe, expect, it } from "vitest"
import {
  applyEvent,
  chatFromMessages,
  initialChatState,
  streamingText,
  type ChatEvent,
} from "@qwq/shared/client/state"

const event = (value: ChatEvent): ChatEvent => value

describe("chat timeline", () => {
  it("keeps tool activity inline with the conversation", () => {
    const state = [
      event({
        _tag: "Message",
        sessionId: "s",
        origin: "tui",
        role: "user",
        content: "列出文件",
      }),
      event({
        _tag: "Tool",
        sessionId: "s",
        origin: "tui",
        name: "bash",
        phase: "start",
        detail: "ls",
      }),
      event({
        _tag: "Tool",
        sessionId: "s",
        origin: "tui",
        name: "bash",
        phase: "result",
        detail: "a.txt",
      }),
      event({
        _tag: "Message",
        sessionId: "s",
        origin: "tui",
        role: "assistant",
        content: "有 a.txt",
      }),
    ].reduce(applyEvent, initialChatState)

    expect(state.parts).toEqual([
      { _tag: "User", content: "列出文件" },
      { _tag: "Tool", name: "bash", detail: "ls", phase: "result", output: "a.txt" },
      { _tag: "Assistant", content: "有 a.txt" },
    ])
  })

  it("accumulates streaming deltas", () => {
    const first = applyEvent(
      initialChatState,
      event({ _tag: "Delta", sessionId: "s", origin: "tui", content: "你" }),
    )
    const second = applyEvent(
      first,
      event({ _tag: "Delta", sessionId: "s", origin: "tui", content: "好" }),
    )
    expect(streamingText(second)).toBe("你好")
    expect(second.busy).toBe(true)
  })

  it("replays persisted tool results when loading history", () => {
    const chat = chatFromMessages([
      { role: "system", content: "system" },
      { role: "user", content: "hi" },
      { role: "tool", content: "out", name: "bash", toolCallId: "1" },
      { role: "assistant", content: "done" },
    ])
    expect(chat.parts).toEqual([
      { _tag: "User", content: "hi" },
      { _tag: "Tool", name: "bash", detail: "", phase: "result", output: "out" },
      { _tag: "Assistant", content: "done" },
    ])
  })
})
