import type {
  CommandExecutor,
  FileSystem,
} from "@effect/platform"
import { Console, Effect, Option, Stream, SynchronizedRef } from "effect"
import { extractText } from "../agent/command"
import { fillVoiceTemplate } from "../agent/prompt"
import type { VoiceConfig } from "@qwq/shared/config/schema"
import type {
  AsrError,
  AudioError,
  KwsError,
  RemoteAskError,
  TtsError,
} from "@qwq/shared/errors"
import type { QwqEvent } from "@qwq/shared/server/rpc"
import { AudioSource } from "./audio"
import { Transcriber } from "./asr"
import { Kws } from "./kws"
import { appendBounded, concatChunks, isSilent } from "./pcm"
import { Tts } from "./tts"

export interface VoiceSessionOptions {
  readonly config: VoiceConfig
  readonly respond: (
    question: string,
  ) => Effect.Effect<
    { readonly sessionId: string; readonly answer: string },
    RemoteAskError
  >
  readonly events?: Stream.Stream<QwqEvent, RemoteAskError>
  // Answer permission prompts. The voice frontend speaks the request, listens
  // for an allow/deny answer and replies; on a timeout it denies.
  readonly respondPermission?: (
    requestId: string,
    allow: boolean,
  ) => Effect.Effect<void, RemoteAskError>
  readonly acknowledge: Option.Option<string>
  readonly asrError: Option.Option<string>
  readonly llmError: Option.Option<string>
  // Spoken feedback around tool calls and permission prompts.
  readonly speakTools: boolean
  readonly toolStartText: string
  readonly toolResultText: string
  readonly toolDeniedText: string
  readonly permissionText: string
  readonly permissionGrantedText: string
  readonly permissionDeniedText: string
  readonly permissionTimeoutText: string
  readonly permissionAllowWords: ReadonlyArray<string>
  readonly permissionDenyWords: ReadonlyArray<string>
  readonly permissionTimeoutMs: number
}

export type VoiceState =
  | { readonly _tag: "Idle"; readonly preRoll: Uint8Array }
  | { readonly _tag: "Acknowledging" }
  | {
      readonly _tag: "Capturing"
      // Frames are accumulated as chunks and concatenated once at the end, so
      // capturing an utterance stays O(n) instead of copying the whole buffer
      // on every audio frame.
      readonly utterance: ReadonlyArray<Uint8Array>
      readonly silence: number
      readonly total: number
      readonly speechStarted: boolean
    }
  | {
      readonly _tag: "Confirming"
      readonly requestId: string
      readonly utterance: ReadonlyArray<Uint8Array>
      readonly silence: number
      readonly total: number
      readonly speechStarted: boolean
    }
  | { readonly _tag: "Speaking" }

type VoiceInput =
  | { readonly _tag: "Frame"; readonly bytes: Uint8Array }
  | { readonly _tag: "Keyword"; readonly keyword: string }

export type VoiceAction =
  | { readonly _tag: "None" }
  | { readonly _tag: "Transcribe"; readonly pcm: Uint8Array; readonly target: "question" }
  | {
      readonly _tag: "Transcribe"
      readonly pcm: Uint8Array
      readonly target: "permission"
      readonly requestId: string
    }

export interface StepBounds {
  readonly preRollBytes: number
  readonly silenceBytes: number
  readonly initialSilenceBytes: number
  readonly maxBytes: number
  readonly silenceThreshold: number
}

export interface StepResult {
  readonly state: VoiceState
  readonly action: VoiceAction
}

interface PendingPermission {
  readonly requestId: string
  readonly tool: string
  readonly retries: number
}

const noAction: VoiceAction = { _tag: "None" }

const totalBytes = (chunks: ReadonlyArray<Uint8Array>): number =>
  chunks.reduce((size, chunk) => size + chunk.length, 0)

interface CaptureBuffer {
  readonly utterance: ReadonlyArray<Uint8Array>
  readonly silence: number
  readonly total: number
  readonly speechStarted: boolean
}

const capturingFrom = (
  utterance: ReadonlyArray<Uint8Array>,
  speechStarted: boolean,
): VoiceState => ({
  _tag: "Capturing",
  utterance,
  silence: 0,
  total: totalBytes(utterance),
  speechStarted,
})

// Extend a capture buffer by one frame. `done` is set once trailing silence
// reaches the limit, or the utterance reaches its maximum length.
const advance = (
  bounds: StepBounds,
  buffer: CaptureBuffer,
  bytes: Uint8Array,
): { readonly buffer: CaptureBuffer; readonly done: boolean } => {
  const total = buffer.total + bytes.length
  const silent = isSilent(bytes, bounds.silenceThreshold)
  const silence = silent ? buffer.silence + bytes.length : 0
  const speechStarted = buffer.speechStarted || !silent
  const limit = buffer.speechStarted
    ? bounds.silenceBytes
    : bounds.initialSilenceBytes
  return {
    buffer: { utterance: [...buffer.utterance, bytes], silence, total, speechStarted },
    done: silence >= limit || total >= bounds.maxBytes,
  }
}

export const step = (
  bounds: StepBounds,
  state: VoiceState,
  input: VoiceInput,
): StepResult => {
  if (input._tag === "Keyword") {
    return state._tag === "Idle"
      ? {
          state: capturingFrom([state.preRoll], false),
          action: noAction,
        }
      : { state, action: noAction }
  }
  if (state._tag === "Capturing") {
    const advanced = advance(bounds, state, input.bytes)
    if (!advanced.done) {
      return {
        state: { _tag: "Capturing", ...advanced.buffer },
        action: noAction,
      }
    }
    return {
      state: { _tag: "Idle", preRoll: new Uint8Array(0) },
      action:
        totalBytes(advanced.buffer.utterance) > 0
          ? {
              _tag: "Transcribe",
              pcm: concatChunks(advanced.buffer.utterance),
              target: "question",
            }
          : noAction,
    }
  }
  if (state._tag === "Confirming") {
    const advanced = advance(bounds, state, input.bytes)
    if (!advanced.done) {
      return {
        state: {
          _tag: "Confirming",
          requestId: state.requestId,
          ...advanced.buffer,
        },
        action: noAction,
      }
    }
    return {
      state: { _tag: "Idle", preRoll: new Uint8Array(0) },
      action:
        totalBytes(advanced.buffer.utterance) > 0
          ? {
              _tag: "Transcribe",
              pcm: concatChunks(advanced.buffer.utterance),
              target: "permission",
              requestId: state.requestId,
            }
          : noAction,
    }
  }
  return {
    state: {
      _tag: "Idle",
      preRoll:
        state._tag === "Idle"
          ? appendBounded(state.preRoll, input.bytes, bounds.preRollBytes)
          : new Uint8Array(0),
    },
    action: noAction,
  }
}

const containsAny = (words: ReadonlyArray<string>, text: string): boolean =>
  words.some((word) => word !== "" && text.includes(word))

// Interpret a spoken answer to a permission prompt. Deny words win ties so
// "不允许" is a denial even though it contains "允许".
export const parsePermissionAnswer = (
  allowWords: ReadonlyArray<string>,
  denyWords: ReadonlyArray<string>,
  text: string,
): Option.Option<boolean> => {
  const normalized = text.trim().toLowerCase()
  if (normalized === "") {
    return Option.none()
  }
  if (containsAny(denyWords, normalized)) {
    return Option.some(false)
  }
  if (containsAny(allowWords, normalized)) {
    return Option.some(true)
  }
  return Option.none()
}

export const runVoice = (
  options: VoiceSessionOptions,
): Effect.Effect<
  void,
  AudioError | KwsError,
  | AudioSource
  | Kws
  | Transcriber
  | Tts
  | FileSystem.FileSystem
  | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const audio = yield* AudioSource
    const kws = yield* Kws
    const asr = yield* Transcriber
    const tts = yield* Tts
    const state = yield* SynchronizedRef.make<VoiceState>({
      _tag: "Idle",
      preRoll: new Uint8Array(0),
    })
    const active = yield* SynchronizedRef.make(Option.none<string>())
    const pending = yield* SynchronizedRef.make(
      Option.none<PendingPermission>(),
    )
    const { config } = options
    const bytesPerMs = (config.audio.sampleRate * 2) / 1000
    const bounds: StepBounds = {
      preRollBytes: Math.floor(config.preRollMs * bytesPerMs),
      silenceBytes: Math.floor(config.silenceMs * bytesPerMs),
      initialSilenceBytes: Math.floor(config.initialSilenceMs * bytesPerMs),
      maxBytes: Math.floor(config.maxUtteranceMs * bytesPerMs),
      silenceThreshold: config.silenceThreshold,
    }

    const resetIdle = (): Effect.Effect<void> =>
      SynchronizedRef.set(state, { _tag: "Idle", preRoll: new Uint8Array(0) })

    const speakPhrase = (
      text: string,
    ): Effect.Effect<
      void,
      never,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      text === ""
        ? Effect.void
        : tts.speak(text).pipe(
            Effect.catchTag("TtsError", (error: TtsError) =>
              Effect.logWarning(`语音播报失败：${error.message}`),
            ),
          )

    const speakError = (
      message: string,
      phrase: Option.Option<string>,
    ): Effect.Effect<
      void,
      never,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      Effect.logError(message).pipe(
        Effect.zipRight(
          Option.match(phrase, {
            onNone: () => Effect.void,
            onSome: (text) => speakPhrase(text),
          }),
        ),
      )

    const respondPermission = (
      requestId: string,
      allow: boolean,
    ): Effect.Effect<void> =>
      Option.match(Option.fromNullable(options.respondPermission), {
        onNone: () => Effect.void,
        onSome: (respond) =>
          respond(requestId, allow).pipe(
            Effect.catchTag("RemoteAskError", (error: RemoteAskError) =>
              Effect.logWarning(`授权回复失败：${error.message}`),
            ),
          ),
      })

    // Speak the permission request, then start listening for the answer.
    const promptPermission = (
      requestId: string,
      tool: string,
    ): Effect.Effect<
      void,
      never,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      Effect.gen(function* () {
        yield* SynchronizedRef.set(state, { _tag: "Speaking" })
        yield* speakPhrase(fillVoiceTemplate(options.permissionText, tool))
        yield* SynchronizedRef.update(state, (current) =>
          current._tag === "Speaking"
            ? ({
                _tag: "Confirming",
                requestId,
                utterance: [],
                silence: 0,
                total: 0,
                speechStarted: false,
              } as const)
            : current,
        )
      })

    const requestPermission = (
      requestId: string,
      tool: string,
    ): Effect.Effect<
      void,
      never,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      Effect.gen(function* () {
        const started = yield* SynchronizedRef.modify(pending, (current) =>
          Option.isSome(current)
            ? ([false, current] as const)
            : ([true, Option.some({ requestId, tool, retries: 0 })] as const),
        )
        if (!started) {
          return
        }
        yield* Effect.fork(promptPermission(requestId, tool))
        yield* Effect.fork(
          Effect.sleep(options.permissionTimeoutMs).pipe(
            Effect.zipRight(
              SynchronizedRef.modify(pending, (current) =>
                Option.exists(
                  current,
                  (item) => item.requestId === requestId,
                )
                  ? ([true, Option.none<PendingPermission>()] as const)
                  : ([false, current] as const),
              ),
            ),
            Effect.tap((expired) =>
              expired
                ? Effect.gen(function* () {
                    yield* respondPermission(requestId, false)
                    yield* speakPhrase(options.permissionTimeoutText)
                    yield* resetIdle()
                  })
                : Effect.void,
            ),
          ),
        )
      })

    const handlePermissionSpeech = (
      pcm: Uint8Array,
      requestId: string,
    ): Effect.Effect<
      void,
      never,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      Effect.gen(function* () {
        const text = (yield* asr.transcribe(pcm)).trim()
        yield* Console.log(`授权答复：${text}`)
        const current = yield* SynchronizedRef.get(pending)
        const answer = parsePermissionAnswer(
          options.permissionAllowWords,
          options.permissionDenyWords,
          text,
        )
        const tool = Option.match(current, {
          onNone: () => "",
          onSome: (item) => item.tool,
        })
        if (Option.isNone(current) || tool === "") {
          yield* resetIdle()
          return
        }
        if (Option.isNone(answer)) {
          const retry = yield* SynchronizedRef.modify(pending, (item) => {
            if (Option.isNone(item)) {
              return [false, item] as const
            }
            const value = item.value
            return value.requestId === requestId && value.retries < 1
              ? ([
                  true,
                  Option.some({ ...value, retries: value.retries + 1 }),
                ] as const)
              : ([false, item] as const)
          })
          if (retry) {
            yield* promptPermission(requestId, tool)
          } else {
            yield* respondPermission(requestId, false)
            yield* SynchronizedRef.set(pending, Option.none())
            yield* speakPhrase(options.permissionDeniedText)
            yield* resetIdle()
          }
        } else {
          const allow = answer.value
          yield* SynchronizedRef.set(pending, Option.none())
          yield* respondPermission(requestId, allow)
          yield* speakPhrase(
            allow
              ? options.permissionGrantedText
              : options.permissionDeniedText,
          )
          yield* resetIdle()
        }
      }).pipe(
        Effect.catchTag("AsrError", (error: AsrError) =>
          speakError(`语音识别失败：${error.message}`, options.asrError).pipe(
            Effect.zipRight(resetIdle()),
          ),
        ),
      )

    yield* Option.match(Option.fromNullable(options.events), {
      onNone: () => Effect.void,
      onSome: (events) =>
        events.pipe(
          Stream.runForEach((event) =>
            Effect.gen(function* () {
              const sessionId = yield* SynchronizedRef.get(active)
              if (event._tag === "Permission") {
                const mine = Option.exists(
                  sessionId,
                  (id) => id === event.sessionId,
                )
                if (mine) {
                  yield* requestPermission(event.requestId, event.tool)
                }
                return
              }
              if (event._tag === "Tool") {
                const mine = Option.exists(
                  sessionId,
                  (id) => id === event.sessionId,
                )
                if (!mine) {
                  return
                }
                const busy = Option.isSome(
                  yield* SynchronizedRef.get(pending),
                )
                if (options.speakTools && !busy) {
                  const phrase =
                    event.phase === "start"
                      ? options.toolStartText
                      : event.status === "denied"
                        ? options.toolDeniedText
                        : options.toolResultText
                  yield* speakPhrase(fillVoiceTemplate(phrase, event.name))
                }
              }
            }),
          ),
          Effect.catchTag("RemoteAskError", (error: RemoteAskError) =>
            Effect.logWarning(`事件订阅失败：${error.message}`),
          ),
          Effect.fork,
        ),
    })

    const speech = (
      pcm: Uint8Array,
    ): Effect.Effect<
      void,
      never,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      Effect.gen(function* () {
        const text = (yield* asr.transcribe(pcm)).trim()
        if (text === "") {
          return
        }
        yield* Console.log(`你说：${text}`)
        const result = yield* options.respond(text)
        yield* SynchronizedRef.set(active, Option.some(result.sessionId))
        yield* Console.log(result.answer)
        yield* tts.speak(extractText(result.answer))
      }).pipe(
        Effect.catchTags({
          AsrError: (error: AsrError) =>
            speakError(`语音识别失败：${error.message}`, options.asrError),
          TtsError: (error: TtsError) =>
            Effect.logError(`语音合成失败：${error.message}`),
          RemoteAskError: (error: RemoteAskError) =>
            speakError(`请求失败：${error.message}`, options.llmError),
        }),
        Effect.ensuring(resetIdle()),
      )

    const handleFrame = (
      bytes: Uint8Array,
    ): Effect.Effect<
      void,
      KwsError,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      Effect.gen(function* () {
        const action = yield* SynchronizedRef.modify(state, (current) => {
          if (
            current._tag === "Speaking" ||
            current._tag === "Acknowledging"
          ) {
            return [null, current] as const
          }
          const result = step(bounds, current, { _tag: "Frame", bytes })
          const next: VoiceState =
            result.action._tag === "Transcribe"
              ? { _tag: "Speaking" }
              : result.state
          return [result.action, next] as const
        })
        if (action === null) {
          return
        }
        yield* kws.write(bytes)
        if (action._tag === "Transcribe" && action.target === "question") {
          yield* Effect.fork(speech(action.pcm))
        }
        if (action._tag === "Transcribe" && action.target === "permission") {
          yield* Effect.fork(
            handlePermissionSpeech(action.pcm, action.requestId),
          )
        }
      })

    const handleKeyword = (): Effect.Effect<
      void,
      never,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      Effect.gen(function* () {
        const preRoll = yield* SynchronizedRef.modify(state, (current) => {
          if (current._tag !== "Idle") {
            return [Option.none<Uint8Array>(), current] as const
          }
          if (Option.isNone(options.acknowledge)) {
            return [
              Option.none<Uint8Array>(),
              capturingFrom([current.preRoll], false),
            ] as const
          }
          return [
            Option.some(current.preRoll),
            { _tag: "Acknowledging" } as VoiceState,
          ] as const
        })
        if (Option.isNone(preRoll)) {
          return
        }
        // Speak the acknowledgement; only start listening for the question once
        // it has finished, so the acknowledgement itself and the user's pause
        // while reacting do not get captured.
        yield* Effect.fork(
          tts
            .speak(Option.getOrElse(options.acknowledge, () => ""))
            .pipe(
              Effect.catchTag("TtsError", (error: TtsError) =>
                Effect.logWarning(`语音播报失败：${error.message}`),
              ),
              Effect.ensuring(
                SynchronizedRef.set(
                  state,
                  capturingFrom([preRoll.value], false),
                ),
              ),
            ),
        )
      })

    const frames: Stream.Stream<VoiceInput, AudioError> = audio.stream.pipe(
      Stream.map((bytes): VoiceInput => ({ _tag: "Frame", bytes })),
    )
    const keywords: Stream.Stream<VoiceInput, KwsError> = kws.events.pipe(
      Stream.map(
        (event): VoiceInput => ({ _tag: "Keyword", keyword: event.keyword }),
      ),
    )
    const handle = (
      input: VoiceInput,
    ): Effect.Effect<
      void,
      KwsError,
      FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      input._tag === "Frame"
        ? handleFrame(input.bytes)
        : handleKeyword()
    yield* Stream.merge(frames, keywords).pipe(Stream.runForEach(handle))
  })
