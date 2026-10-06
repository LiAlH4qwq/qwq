import { Command } from "@effect/platform"
import type { CommandExecutor } from "@effect/platform"
import { Context, Effect, Layer, Option, Stream } from "effect"
import type { Scope } from "effect"
import type { VoiceAudioConfig } from "@qwq/shared/config/schema"
import { AudioError } from "@qwq/shared/errors"

export interface AudioSourceShape {
  readonly stream: Stream.Stream<Uint8Array, AudioError>
}

export class AudioSource extends Context.Tag("qwq/AudioSource")<
  AudioSource,
  AudioSourceShape
>() {}

type ConcreteBackend = "pipewire" | "pulse" | "alsa"

const autoCandidates: ReadonlyArray<ConcreteBackend> = [
  "pipewire",
  "pulse",
  "alsa",
]

const binaryFor = (backend: ConcreteBackend): string =>
  backend === "pipewire" ? "pw-record" : backend === "pulse" ? "parec" : "arecord"

const deviceArgs = (
  backend: ConcreteBackend,
  device: string,
  echoCancel: boolean,
): ReadonlyArray<string> => {
  const target = device !== "" ? device : echoCancel ? "echo-cancel-source" : ""
  if (target === "") {
    return []
  }
  if (backend === "pipewire") {
    return ["--target", target]
  }
  if (backend === "pulse") {
    return [`--device=${target}`]
  }
  return ["-D", target]
}

export const captureArgs = (
  backend: ConcreteBackend,
  config: VoiceAudioConfig,
): ReadonlyArray<string> => {
  const rate = `--rate=${config.sampleRate}`
  const device = deviceArgs(backend, config.device, config.echoCancel)
  if (backend === "pipewire") {
    return ["--format=s16", rate, "--channels=1", "--raw", ...device, "-"]
  }
  if (backend === "pulse") {
    return ["--format=s16le", rate, "--channels=1", "--raw", ...device]
  }
  return [
    "-f",
    "S16_LE",
    "-r",
    String(config.sampleRate),
    "-c",
    "1",
    "-t",
    "raw",
    ...device,
  ]
}

const hasBinary = (
  name: string,
): Effect.Effect<boolean, never, CommandExecutor.CommandExecutor> =>
  Command.string(Command.make("which", name)).pipe(
    Effect.match({ onFailure: () => false, onSuccess: () => true }),
  )

const resolveBackend = (
  configured: VoiceAudioConfig["backend"],
): Effect.Effect<ConcreteBackend, AudioError, CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    if (configured !== "auto") {
      return configured
    }
    const available = yield* Effect.all(
      autoCandidates.map((backend) => hasBinary(binaryFor(backend))),
    )
    const ordered = autoCandidates.filter(
      (_candidate, index) => available[index] === true,
    )
    const chosen = Option.fromNullable(ordered.at(0))
    return yield* Option.match(chosen, {
      onNone: () =>
        Effect.fail(
          new AudioError({
            backend: "auto",
            message: "找不到可用的录音后端（pw-record / parec / arecord）",
            cause: "no-backend",
          }),
        ),
      onSome: (backend) => Effect.succeed(backend),
    })
  })

const make = (
  config: VoiceAudioConfig,
): Effect.Effect<AudioSourceShape, AudioError, CommandExecutor.CommandExecutor | Scope.Scope> =>
  Effect.gen(function* () {
    const backend = yield* resolveBackend(config.backend)
    const binary = binaryFor(backend)
    const args = captureArgs(backend, config)
    const process = yield* Command.start(Command.make(binary, ...args)).pipe(
      Effect.mapError(
        (cause) =>
          new AudioError({
            backend,
            message: `无法启动录音程序 ${binary}`,
            cause,
          }),
      ),
    )
    const stream = process.stdout.pipe(
      Stream.mapError(
        (cause) =>
          new AudioError({ backend, message: `${binary} 音频流中断`, cause }),
      ),
    )
    return AudioSource.of({ stream })
  })

export const layer = (
  config: VoiceAudioConfig,
): Layer.Layer<AudioSource, AudioError, CommandExecutor.CommandExecutor> =>
  Layer.scoped(AudioSource, make(config))
