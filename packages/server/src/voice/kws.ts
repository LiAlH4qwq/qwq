import { Command } from "@effect/platform"
import type { CommandExecutor } from "@effect/platform"
import {
  Context,
  Effect,
  Either,
  Layer,
  Option,
  Queue,
  Schema,
  Stream,
  type Scope,
} from "effect"
import type { WakeWordConfig } from "@qwq/shared/config/schema"
import { KwsError } from "@qwq/shared/errors"
import { concatChunks } from "./pcm"

export interface KeywordEvent {
  readonly keyword: string
}

export interface KwsShape {
  readonly write: (frame: Uint8Array) => Effect.Effect<void, KwsError>
  readonly events: Stream.Stream<KeywordEvent, KwsError>
  readonly close: Effect.Effect<void>
}

export class Kws extends Context.Tag("qwq/Kws")<Kws, KwsShape>() {}

const KeywordLine = Schema.Struct({ keyword: Schema.String })

export const decodeKeywordLine = (
  line: string,
): Option.Option<KeywordEvent> => {
  const decoded = Schema.decodeUnknownEither(Schema.parseJson(KeywordLine))(
    line,
  )
  return Either.isRight(decoded)
    ? Option.some({ keyword: decoded.right.keyword })
    : Option.none()
}

const pick = (value: string | undefined, fallback: string): string =>
  Option.getOrElse(Option.fromNullable(value), () => fallback)

export const kwsArgs = (
  config: WakeWordConfig,
  sampleRate: number,
): ReadonlyArray<string> => [
  `--tokens=${config.modelDir}/tokens.txt`,
  `--encoder=${pick(config.encoder, `${config.modelDir}/encoder.onnx`)}`,
  `--decoder=${pick(config.decoder, `${config.modelDir}/decoder.onnx`)}`,
  `--joiner=${pick(config.joiner, `${config.modelDir}/joiner.onnx`)}`,
  `--keywords-file=${config.keywordsFile}`,
  `--keywords-score=${config.keywordsScore}`,
  `--keywords-threshold=${config.keywordsThreshold}`,
  `--provider=${config.provider}`,
  `--num-threads=${config.numThreads}`,
  `--sample-rate=${sampleRate}`,
]

const frameOf = (chunk: Uint8Array): Uint8Array => {
  const header = new Uint8Array(4)
  new DataView(header.buffer).setUint32(0, chunk.length, true)
  return concatChunks([header, chunk])
}

const make = (
  config: WakeWordConfig,
  sampleRate: number,
): Effect.Effect<KwsShape, KwsError, CommandExecutor.CommandExecutor | Scope.Scope> =>
  Effect.gen(function* () {
    const command = Command.make(
      config.command,
      ...config.args,
      ...kwsArgs(config, sampleRate),
    ).pipe(Command.stdin("pipe"), Command.stdout("pipe"))
    const process = yield* Command.start(command).pipe(
      Effect.mapError(
        (cause) =>
          new KwsError({ message: "无法启动唤醒词引擎", cause }),
      ),
    )
    const queue = yield* Queue.unbounded<Uint8Array>()
    yield* Stream.fromQueue(queue).pipe(
      Stream.run(process.stdin),
      Effect.mapError(
        (cause) =>
          new KwsError({ message: "写入唤醒词引擎失败", cause }),
      ),
      Effect.forkScoped,
    )
    // Close stdin and let the worker exit cleanly instead of tearing the pipe
    // down while writes are still in flight (which would raise EPIPE).
    const close = Effect.gen(function* () {
      yield* Queue.shutdown(queue)
      yield* process.exitCode.pipe(Effect.ignore)
    })
    yield* Effect.addFinalizer(() => close.pipe(Effect.ignore))
    const events = process.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.map((line) => line.trim()),
      Stream.filter((line) => line !== ""),
      Stream.map(decodeKeywordLine),
      Stream.filter(Option.isSome),
      Stream.map((option) => option.value),
      Stream.mapError(
        (cause) =>
          new KwsError({ message: "读取唤醒词事件失败", cause }),
      ),
    )
    const write = (frame: Uint8Array) =>
      Queue.offer(queue, frameOf(frame)).pipe(Effect.asVoid)
    return Kws.of({ write, events, close })
  })

export const layer = (
  config: WakeWordConfig,
  sampleRate: number,
): Layer.Layer<Kws, KwsError, CommandExecutor.CommandExecutor> =>
  Layer.scoped(Kws, make(config, sampleRate))
