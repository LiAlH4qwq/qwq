import { describe, expect, it } from "vitest"
import {
  busyStatus,
  clampLines,
  permissionView,
  presentParts,
  sessionSubtitle,
  toolGlyph,
  toolTone,
  windowOf,
} from "@qwq/shared/client/view"
import type { SessionSummary } from "@qwq/shared/domain/session"

const summary: SessionSummary = {
  id: "s1",
  title: "语音：测试",
  origin: "voice",
  createdAt: 0,
  updatedAt: 0,
  voiceExpiresAt: 10_000,
  messageCount: 3,
}

describe("shared view model", () => {
  it("maps chat parts to UI-agnostic view parts", () => {
    const parts = presentParts([
      { _tag: "User", content: "你好" },
      { _tag: "Assistant", content: "在的" },
      {
        _tag: "Tool",
        name: "bash",
        detail: "ls",
        phase: "result",
        output: "a\nb",
      },
    ])
    expect(parts).toEqual([
      { _tag: "User", content: "你好" },
      { _tag: "Assistant", content: "在的" },
      {
        _tag: "Tool",
        name: "bash",
        glyph: "✓",
        detail: "ls",
        output: "a\nb",
        phase: "result",
        tone: "ok",
      },
    ])
  })

  it("uses a warning tone while a tool is running", () => {
    expect(toolGlyph("start")).toBe("▶")
    expect(toolTone("start")).toBe("warn")
    expect(toolTone("result")).toBe("ok")
  })

  it("reports busy status in Chinese", () => {
    expect(busyStatus(true)).toEqual({ text: "● 运行中", tone: "warn" })
    expect(busyStatus(false)).toEqual({ text: "○ 空闲", tone: "muted" })
  })

  it("clamps long text and windows long lists", () => {
    expect(clampLines("a\nb\nc", 2)).toBe("a\nb\n…")
    expect(clampLines("a\nb", 2)).toBe("a\nb")
    expect(windowOf([1, 2, 3, 4], 2)).toEqual([3, 4])
    expect(windowOf([1, 2], 2)).toEqual([1, 2])
  })

  it("summarises a session row", () => {
    expect(sessionSubtitle(summary, 5_000)).toEqual({
      voice: true,
      origin: "语音",
      count: 3,
    })
    expect(sessionSubtitle(summary, 20_000).voice).toBe(false)
  })

  it("renders a permission prompt", () => {
    expect(
      permissionView({ requestId: "r", tool: "bash", detail: "rm -rf build" }),
    ).toEqual({
      title: "⚠ 需要确认：bash",
      body: "rm -rf build",
      hint: "允许执行？[y/N]",
    })
  })
})
