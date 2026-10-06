import type { SessionSummary } from "../domain/session"
import { isVoiceActive, originLabel } from "../domain/session"
import type { PermissionPrompt } from "./atoms"
import type { ChatPart } from "./state"

// UI-agnostic presentation model shared by the ink TUI and the Electron GUI.
// It carries no React/ink/DOM types: each frontend maps a `Tone` to its own
// colors (see `./theme`) and its own components.
export type Tone =
  | "user"
  | "assistant"
  | "tool"
  | "muted"
  | "accent"
  | "warn"
  | "ok"

export type ViewPart =
  | { readonly _tag: "User"; readonly content: string }
  | { readonly _tag: "Assistant"; readonly content: string }
  | {
      readonly _tag: "Tool"
      readonly name: string
      readonly glyph: string
      readonly detail: string
      readonly output: string
      readonly phase: "start" | "result"
      readonly tone: Tone
    }

export const toolGlyph = (phase: "start" | "result"): string =>
  phase === "start" ? "▶" : "✓"

export const toolTone = (phase: "start" | "result"): Tone =>
  phase === "start" ? "warn" : "ok"

export const presentParts = (
  parts: ReadonlyArray<ChatPart>,
): ReadonlyArray<ViewPart> =>
  parts.map((part): ViewPart => {
    if (part._tag === "User") {
      return { _tag: "User", content: part.content }
    }
    if (part._tag === "Assistant") {
      return { _tag: "Assistant", content: part.content }
    }
    return {
      _tag: "Tool",
      name: part.name,
      glyph: toolGlyph(part.phase),
      detail: part.detail,
      output: part.output,
      phase: part.phase,
      tone: toolTone(part.phase),
    }
  })

export interface BusyStatus {
  readonly text: string
  readonly tone: Tone
}

export const busyStatus = (busy: boolean): BusyStatus =>
  busy
    ? { text: "● 运行中", tone: "warn" }
    : { text: "○ 空闲", tone: "muted" }

export const clampLines = (text: string, maxLines: number): string => {
  const lines = text.split("\n")
  return lines.length <= maxLines
    ? text
    : `${lines.slice(0, maxLines).join("\n")}\n…`
}

export const windowOf = <A>(
  items: ReadonlyArray<A>,
  max: number,
): ReadonlyArray<A> =>
  items.length <= max ? items : items.slice(items.length - max)

export interface SessionSubtitle {
  readonly voice: boolean
  readonly origin: string
  readonly count: number
}

export const sessionSubtitle = (
  summary: SessionSummary,
  now: number,
): SessionSubtitle => ({
  voice: isVoiceActive(summary, now),
  origin: originLabel(summary.origin),
  count: summary.messageCount,
})

export interface PermissionView {
  readonly title: string
  readonly body: string
  readonly hint: string
}

export const permissionView = (prompt: PermissionPrompt): PermissionView => ({
  title: `⚠ 需要确认：${prompt.tool}`,
  body: prompt.detail,
  hint: "允许执行？[y/N]",
})
