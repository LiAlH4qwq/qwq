import { Schema } from "effect"

export const Role = Schema.Literal("system", "user", "assistant", "tool")
export type Role = typeof Role.Type

// A tool call requested by the assistant. Persisted so a resumed session can
// replay the tool timeline instead of losing it.
export const ToolCall = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  arguments: Schema.String,
})
export type ToolCall = typeof ToolCall.Type

export const Message = Schema.Struct({
  role: Role,
  content: Schema.String,
  // Tool messages: which call they answer, and the tool name.
  toolCallId: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  // Assistant messages: the calls it requested.
  toolCalls: Schema.optional(Schema.Array(ToolCall)),
})
export type Message = typeof Message.Type

export const Messages = Schema.Array(Message)
export type Messages = typeof Messages.Type
