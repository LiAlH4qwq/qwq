import { Command } from "@effect/platform"
import type { CommandExecutor } from "@effect/platform"
import { FileSystem } from "@effect/platform"
import { tmpdir } from "node:os"
import { Context, Effect, Layer, Option, Stream } from "effect"
import type { TtsConfig } from "@qwq/shared/config/schema"
import { TtsError } from "@qwq/shared/errors"

export interface TtsShape {
  readonly speak: (
    text: string,
  ) => Effect.Effect<void, TtsError, FileSystem.FileSystem | CommandExecutor.CommandExecutor>
}

export class Tts extends Context.Tag("qwq/Tts")<Tts, TtsShape>() {}

const tempPath = (suffix: string): string =>
  `${tmpdir()}/qwq-tts-${Date.now()}-${Math.floor(
    Math.random() * 1_000_000_000,
  )}${suffix}`

const piperArgs = (config: TtsConfig, output: string): ReadonlyArray<string> => {
  const base = [
    "--model",
    config.model,
    "--output_file",
    output,
    "--length_scale",
    String(1 / config.speed),
  ]
  return config.provider === ""
    ? base
    : [...base, `--provider=${config.provider}`]
}

const synthesizePiper = (
  config: TtsConfig,
  text: string,
): Effect.Effect<
  string,
  TtsError,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const output = tempPath(".wav")
      const command = Command.make(
        config.binary,
        ...piperArgs(config, output),
      ).pipe(
        Command.stdin("pipe"),
        Command.stdout("inherit"),
        Command.stderr("inherit"),
      )
      const process = yield* Command.start(command).pipe(
        Effect.mapError(
          (cause) => new TtsError({ message: "无法启动 TTS 引擎", cause }),
        ),
      )
      yield* Stream.make(new TextEncoder().encode(text)).pipe(
        Stream.run(process.stdin),
        Effect.mapError(
          (cause) => new TtsError({ message: "写入 TTS 输入失败", cause }),
        ),
      )
      yield* process.exitCode.pipe(
        Effect.mapError(
          (cause) => new TtsError({ message: "TTS 引擎异常退出", cause }),
        ),
      )
      return output
    }),
  )

const splitCommand = (rendered: string): ReadonlyArray<string> =>
  rendered
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== "")

const synthesizeCommand = (
  config: TtsConfig,
  text: string,
): Effect.Effect<
  string,
  TtsError,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const input = tempPath(".txt")
    const output = tempPath(".wav")
    yield* fs
      .writeFileString(input, text)
      .pipe(Effect.mapError((cause) => new TtsError({ message: "写入文本失败", cause })))
    const rendered = config.command
      .replaceAll("{in}", input)
      .replaceAll("{out}", output)
    const parts = splitCommand(rendered)
    const program = Option.fromNullable(parts[0])
    yield* Option.match(program, {
      onNone: () =>
        Effect.fail(new TtsError({ message: "TTS 命令为空", cause: "empty" })),
      onSome: (binary) =>
        Command.exitCode(
          Command.make(binary, ...parts.slice(1)),
        ).pipe(
          Effect.mapError(
            (cause) => new TtsError({ message: "TTS 命令执行失败", cause }),
          ),
        ),
    })
    return output
  })

const play = (
  config: TtsConfig,
  path: string,
): Effect.Effect<
  void,
  TtsError,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor
> =>
  Command.exitCode(Command.make(config.player, path)).pipe(
    Effect.mapError(
      (cause) => new TtsError({ message: "播放语音失败", cause }),
    ),
    Effect.asVoid,
  )

const make = (config: TtsConfig): TtsShape => {
  const speak = (text: string) => {
    const trimmed = text.trim()
    if (!config.enable || config.engine === "none" || trimmed === "") {
      return Effect.void
    }
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const output =
        config.engine === "piper"
          ? yield* synthesizePiper(config, trimmed)
          : yield* synthesizeCommand(config, trimmed)
      yield* play(config, output).pipe(
        Effect.ensuring(fs.remove(output).pipe(Effect.ignore)),
      )
    })
  }
  return Tts.of({ speak })
}

export const layer = (config: TtsConfig): Layer.Layer<Tts> =>
  Layer.succeed(Tts, make(config))
