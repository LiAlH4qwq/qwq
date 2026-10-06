import { Data } from "effect"

export class UsageError extends Data.TaggedError("UsageError")<{
  readonly message: string
}> {}

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly path: string
  readonly issues: ReadonlyArray<string>
}> {}

export class ConfigValidationError extends Data.TaggedError(
  "ConfigValidationError",
)<{
  readonly issues: ReadonlyArray<string>
}> {}

export class ApiKeyError extends Data.TaggedError("ApiKeyError")<{
  readonly envVar: string
}> {}

export class LlmRequestError extends Data.TaggedError("LlmRequestError")<{
  readonly url: string
  readonly message: string
  readonly cause: unknown
}> {}

export class LlmResponseError extends Data.TaggedError("LlmResponseError")<{
  readonly url: string
  readonly issues: ReadonlyArray<string>
}> {}

export class SessionReadError extends Data.TaggedError("SessionReadError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class SessionWriteError extends Data.TaggedError("SessionWriteError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class SessionNotFoundError extends Data.TaggedError(
  "SessionNotFoundError",
)<{
  readonly sessionId: string
}> {}

export class ServerUnavailableError extends Data.TaggedError(
  "ServerUnavailableError",
)<{
  readonly url: string
  readonly cause: unknown
}> {}

export class ServerStartError extends Data.TaggedError("ServerStartError")<{
  readonly cause: unknown
}> {}

export class RemoteAskError extends Data.TaggedError("RemoteAskError")<{
  readonly message: string
}> {}

export class AudioError extends Data.TaggedError("AudioError")<{
  readonly backend: string
  readonly message: string
  readonly cause: unknown
}> {}

export class KwsError extends Data.TaggedError("KwsError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class AsrError extends Data.TaggedError("AsrError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class TtsError extends Data.TaggedError("TtsError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class ToolError extends Data.TaggedError("ToolError")<{
  readonly tool: string
  readonly message: string
  readonly cause: unknown
  // Set when the safety policy (not a runtime failure) rejected the call, so
  // frontends can distinguish a denial from an error.
  readonly denied?: boolean
}> {}

export class VoiceConfigError extends Data.TaggedError("VoiceConfigError")<{
  readonly message: string
}> {}
