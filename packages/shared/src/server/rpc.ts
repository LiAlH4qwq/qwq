import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"
import { Origin, Session, SessionSummary } from "../domain/session"

export const EnvVarSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
})

export const AskInputSchema = Schema.Struct({
  // Omitted to create (or reuse, per policy) a session on the server.
  sessionId: Schema.optional(Schema.String),
  origin: Origin,
  shell: Schema.String,
  question: Schema.String,
  envVars: Schema.Array(EnvVarSchema),
})
export type AskInput = typeof AskInputSchema.Type

export const MessageEvent = Schema.Struct({
  _tag: Schema.Literal("Message"),
  sessionId: Schema.String,
  origin: Origin,
  role: Schema.Literal("user", "assistant"),
  content: Schema.String,
})

export const ToolStatus = Schema.Literal("ok", "denied", "error")
export type ToolStatus = typeof ToolStatus.Type

export const ToolEvent = Schema.Struct({
  _tag: Schema.Literal("Tool"),
  sessionId: Schema.String,
  origin: Origin,
  name: Schema.String,
  phase: Schema.Literal("start", "result"),
  detail: Schema.String,
  // Present on `result` events: whether the tool ran, was denied by policy/user,
  // or failed. Optional so older/partial producers still decode.
  status: Schema.optional(ToolStatus),
})

export const DeltaEvent = Schema.Struct({
  _tag: Schema.Literal("Delta"),
  sessionId: Schema.String,
  origin: Origin,
  content: Schema.String,
})

export const SessionUpsertedEvent = Schema.Struct({
  _tag: Schema.Literal("SessionUpserted"),
  session: SessionSummary,
})

export const SessionDeletedEvent = Schema.Struct({
  _tag: Schema.Literal("SessionDeleted"),
  sessionId: Schema.String,
})

export const PermissionEvent = Schema.Struct({
  _tag: Schema.Literal("Permission"),
  sessionId: Schema.String,
  origin: Origin,
  requestId: Schema.String,
  tool: Schema.String,
  detail: Schema.String,
})

export const EventSchema = Schema.Union(
  MessageEvent,
  ToolEvent,
  DeltaEvent,
  SessionUpsertedEvent,
  SessionDeletedEvent,
  PermissionEvent,
)
export type QwqEvent = typeof EventSchema.Type

export const ErrorSchema = Schema.Struct({ message: Schema.String })

export class Ask extends Rpc.make("Ask", {
  payload: AskInputSchema,
  success: Schema.Struct({
    sessionId: Schema.String,
    answer: Schema.String,
  }),
  error: ErrorSchema,
}) {}

export class Ping extends Rpc.make("Ping", {
  success: Schema.Struct({ version: Schema.String }),
}) {}

export class Subscribe extends Rpc.make("Subscribe", {
  payload: Schema.Struct({}),
  success: EventSchema,
  stream: true,
}) {}

export class ListSessions extends Rpc.make("ListSessions", {
  success: Schema.Array(SessionSummary),
  error: ErrorSchema,
}) {}

export class GetSession extends Rpc.make("GetSession", {
  payload: Schema.Struct({ sessionId: Schema.String }),
  success: Session,
  error: ErrorSchema,
}) {}

export class RenameSession extends Rpc.make("RenameSession", {
  payload: Schema.Struct({ sessionId: Schema.String, title: Schema.String }),
  success: SessionSummary,
  error: ErrorSchema,
}) {}

export class DeleteSession extends Rpc.make("DeleteSession", {
  payload: Schema.Struct({ sessionId: Schema.String }),
  success: Schema.Struct({ ok: Schema.Boolean }),
  error: ErrorSchema,
}) {}

export class RespondPermission extends Rpc.make("RespondPermission", {
  payload: Schema.Struct({
    requestId: Schema.String,
    allow: Schema.Boolean,
  }),
  success: Schema.Struct({ ok: Schema.Boolean }),
}) {}

export const QwqRpcs = RpcGroup.make(
  Ask,
  Ping,
  Subscribe,
  ListSessions,
  GetSession,
  RenameSession,
  DeleteSession,
  RespondPermission,
)
