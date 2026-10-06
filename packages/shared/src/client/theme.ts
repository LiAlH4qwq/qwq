import type { Tone } from "./view"

// Semantic tones mapped to each frontend's palette. The ink TUI uses valid ink
// color names; the GUI uses valid Radix Themes color names. The literal unions
// keep both assignments type-safe without coupling this module (or the rest of
// `@qwq/shared`) to either UI library.
export type InkColor = "cyan" | "white" | "gray" | "magenta" | "yellow" | "green"
export type RadixColor = "blue" | "gray" | "violet" | "amber" | "green"

export const inkColorByTone: Readonly<Record<Tone, InkColor>> = {
  user: "cyan",
  assistant: "white",
  tool: "gray",
  muted: "gray",
  accent: "magenta",
  warn: "yellow",
  ok: "green",
}

export const radixColorByTone: Readonly<Record<Tone, RadixColor>> = {
  user: "blue",
  assistant: "gray",
  tool: "gray",
  muted: "gray",
  accent: "violet",
  warn: "amber",
  ok: "green",
}
