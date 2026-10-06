import { Command } from "@effect/platform"
import type { CommandExecutor } from "@effect/platform"
import { FileSystem } from "@effect/platform"
import { tmpdir } from "node:os"
import { Context, Effect, Either, Layer, Option, Schema } from "effect"
import type { AsrConfig } from "@qwq/shared/config/schema"
import { AsrError } from "@qwq/shared/errors"
import { encodeWav } from "./pcm"

export interface TranscriberShape {
  readonly transcribe: (
    pcm: Uint8Array,
  ) => Effect.Effect<string, AsrError, FileSystem.FileSystem | CommandExecutor.CommandExecutor>
}

export class Transcriber extends Context.Tag("qwq/Transcriber")<
  Transcriber,
  TranscriberShape
>() {}

const pick = (value: string | undefined, fallback: string): string =>
  Option.getOrElse(Option.fromNullable(value), () => fallback)

export const transcribeArgs = (
  config: AsrConfig,
  wavPath: string,
): ReadonlyArray<string> => {
  const tokens =
    config.tokens === "" ? `${config.modelDir}/tokens.txt` : config.tokens
  return [
    `--tokens=${tokens}`,
    `--paraformer=${pick(config.modelFile, `${config.modelDir}/model.onnx`)}`,
    `--num-threads=${config.numThreads}`,
    `--provider=${config.provider}`,
    wavPath,
  ]
}

const AsrResultLine = Schema.Struct({
  text: Schema.String,
})

export const parseAsrOutput = (output: string): string =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .flatMap((line) => {
      const decoded = Schema.decodeUnknownEither(
        Schema.parseJson(AsrResultLine),
      )(line)
      return Either.isRight(decoded) ? [decoded.right.text] : []
    })
    .join(" ")
    .trim()

export const withTempWav = <A, E, E0>(
  pcm: Uint8Array,
  sampleRate: number,
  onWriteError: (cause: unknown) => E0,
  use: (
    path: string,
  ) => Effect.Effect<A, E, FileSystem.FileSystem | CommandExecutor.CommandExecutor>,
): Effect.Effect<A, E | E0, FileSystem.FileSystem | CommandExecutor.CommandExecutor> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = `${tmpdir()}/qwq-voice-${Date.now()}-${Math.floor(
      Math.random() * 1_000_000_000,
    )}.wav`
    yield* fs
      .writeFile(path, encodeWav(pcm, sampleRate))
      .pipe(Effect.mapError(onWriteError))
    return yield* use(path).pipe(
      Effect.ensuring(fs.remove(path).pipe(Effect.ignore)),
    )
  })

const makeTranscriber = (
  config: AsrConfig,
  sampleRate: number,
): TranscriberShape => {
  const transcribe = (pcm: Uint8Array) =>
    withTempWav(
      pcm,
      sampleRate,
      (cause) => new AsrError({ message: "写入音频失败", cause }),
      (path) =>
        Command.string(
          Command.make(config.binary, ...transcribeArgs(config, path)),
        ).pipe(
          Effect.mapError(
            (cause) => new AsrError({ message: "语音识别失败", cause }),
          ),
          Effect.map(parseAsrOutput),
        ),
    )
  return Transcriber.of({ transcribe })
}

export const layer = (
  config: AsrConfig,
  sampleRate: number,
): Layer.Layer<Transcriber> =>
  Layer.succeed(Transcriber, makeTranscriber(config, sampleRate))
