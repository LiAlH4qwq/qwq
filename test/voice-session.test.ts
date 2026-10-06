import { describe, expect, it } from "vitest"
import { Option } from "effect"
import {
  parsePermissionAnswer,
  step,
  type StepBounds,
  type VoiceState,
} from "@qwq/server/voice/session"

const bounds: StepBounds = {
  preRollBytes: 4,
  silenceBytes: 4,
  initialSilenceBytes: 8,
  maxBytes: 100,
  silenceThreshold: 1,
}

const loud = new Uint8Array([1, 0, 1, 0])
const quiet = new Uint8Array([0, 0, 0, 0])

describe("voice session state machine", () => {
  it("buffers frames while idle", () => {
    const result = step(
      bounds,
      { _tag: "Idle", preRoll: new Uint8Array(0) },
      { _tag: "Frame", bytes: loud },
    )
    expect(result.state).toEqual({ _tag: "Idle", preRoll: loud })
    expect(result.action).toEqual({ _tag: "None" })
  })

  it("starts capturing on a keyword, keeping the wake-word pre-roll", () => {
    const idle: VoiceState = { _tag: "Idle", preRoll: loud }
    const result = step(bounds, idle, { _tag: "Keyword", keyword: "小爱同学" })
    expect(result.state).toEqual({
      _tag: "Capturing",
      utterance: [loud],
      silence: 0,
      total: 4,
      speechStarted: false,
    })
  })

  it("ignores keywords while already capturing", () => {
    const capturing: VoiceState = {
      _tag: "Capturing",
      utterance: [loud],
      silence: 0,
      total: 4,
      speechStarted: false,
    }
    const result = step(bounds, capturing, {
      _tag: "Keyword",
      keyword: "小爱同学",
    })
    expect(result.state).toEqual(capturing)
  })

  it("does not stop while waiting for the user to start speaking", () => {
    const capturing: VoiceState = {
      _tag: "Capturing",
      utterance: [loud],
      silence: 0,
      total: 4,
      speechStarted: false,
    }
    const first = step(bounds, capturing, { _tag: "Frame", bytes: quiet })
    expect(first.action).toEqual({ _tag: "None" })
    expect(first.state).toMatchObject({
      _tag: "Capturing",
      speechStarted: false,
    })
  })

  it("gives up after the initial silence timeout", () => {
    const capturing: VoiceState = {
      _tag: "Capturing",
      utterance: [loud],
      silence: 8,
      total: 12,
      speechStarted: false,
    }
    const result = step(bounds, capturing, { _tag: "Frame", bytes: quiet })
    expect(result.action._tag).toBe("Transcribe")
    expect(result.state).toEqual({ _tag: "Idle", preRoll: new Uint8Array(0) })
  })

  it("ends on trailing silence once speech has started", () => {
    const capturing: VoiceState = {
      _tag: "Capturing",
      utterance: [loud],
      silence: 0,
      total: 4,
      speechStarted: false,
    }
    const speaking = step(bounds, capturing, { _tag: "Frame", bytes: loud })
    expect(speaking.state).toMatchObject({
      _tag: "Capturing",
      speechStarted: true,
    })
    const ended = step(bounds, speaking.state, {
      _tag: "Frame",
      bytes: quiet,
    })
    expect(ended.action._tag).toBe("Transcribe")
  })

  it("ends an utterance at the maximum length", () => {
    const capturing: VoiceState = {
      _tag: "Capturing",
      utterance: [loud],
      silence: 0,
      total: 98,
      speechStarted: true,
    }
    const result = step(bounds, capturing, { _tag: "Frame", bytes: loud })
    expect(result.action._tag).toBe("Transcribe")
  })

  it("captures a spoken permission answer separately from a question", () => {
    const confirming: VoiceState = {
      _tag: "Confirming",
      requestId: "r1",
      utterance: [loud],
      silence: 0,
      total: 4,
      speechStarted: true,
    }
    const result = step(bounds, confirming, { _tag: "Frame", bytes: quiet })
    expect(result.action).toEqual({
      _tag: "Transcribe",
      pcm: new Uint8Array([1, 0, 1, 0, 0, 0, 0, 0]),
      target: "permission",
      requestId: "r1",
    })
  })
})

describe("permission answer parsing", () => {
  const allow = ["允许", "是", "yes"]
  const deny = ["拒绝", "不", "no"]

  it("recognises allow and deny, with deny winning ties", () => {
    expect(parsePermissionAnswer(allow, deny, "允许")).toEqual(Option.some(true))
    expect(parsePermissionAnswer(allow, deny, "可以，允许吧")).toEqual(
      Option.some(true),
    )
    expect(parsePermissionAnswer(allow, deny, "拒绝")).toEqual(Option.some(false))
    expect(parsePermissionAnswer(allow, deny, "不允许")).toEqual(
      Option.some(false),
    )
    expect(parsePermissionAnswer(allow, deny, "嗯……")).toEqual(Option.none())
    expect(parsePermissionAnswer(allow, deny, "  ")).toEqual(Option.none())
  })
})
