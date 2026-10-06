import { FileSystem } from "@effect/platform"
import { Effect, Option } from "effect"
import type {
  PowerProfile,
  TtsConfig,
  VoiceConfig,
} from "@qwq/shared/config/schema"
import type { EngineAccel } from "./accel"

export type PowerSource = "ac" | "battery"

// A `/sys/class/power_supply/*/online` value: `1` means that supply is online
// (AC adapter present), `0` means present but offline. Anything else is not a
// usable reading.
export const parseOnline = (content: string): Option.Option<boolean> => {
  const value = content.trim()
  if (value === "1") {
    return Option.some(true)
  }
  if (value === "0") {
    return Option.some(false)
  }
  return Option.none()
}

// On battery, force the lowest-draw profile regardless of configuration; on AC
// (or when the source cannot be determined) honour the configured profile.
export const resolvePower = (
  configured: PowerProfile,
  source: Option.Option<PowerSource>,
): PowerProfile =>
  Option.match(source, {
    onNone: () => configured,
    onSome: (value) => (value === "battery" ? "battery" : configured),
  })

const supplyDir = "/sys/class/power_supply"

// Read the edge: any online AC supply wins; all-offline supplies mean battery;
// no readable `online` file at all means unknown (desktops).
export const detectPower: Effect.Effect<
  Option.Option<PowerSource>,
  never,
  FileSystem.FileSystem
> = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const entries = yield* fs
    .readDirectory(supplyDir)
    .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>))
  const readings = yield* Effect.all(
    entries.map((name) =>
      fs.readFileString(`${supplyDir}/${name}/online`).pipe(
        Effect.map(parseOnline),
        Effect.orElseSucceed(() => Option.none<boolean>()),
      ),
    ),
  )
  const known = readings.flatMap((reading) =>
    Option.match(reading, { onNone: () => [], onSome: (value) => [value] }),
  )
  if (known.length === 0) {
    return Option.none()
  }
  return Option.some(known.some((value) => value) ? "ac" : "battery")
})

// Apply the power profile and the resolved accelerator to a voice config.
//
// `battery` (the default) pins the always-on wake word to a single CPU thread
// and keeps ASR on CPU: bringing up a GPU/NPU costs more power than it saves for
// a tiny streaming model. `balanced` keeps the user's threads but stays on CPU.
// `performance` uses the resolved accelerator for one-shot ASR. The wake word is
// always CPU.
export const withPower = (
  voice: VoiceConfig,
  accel: EngineAccel,
): VoiceConfig => {
  const wakeWord = { ...voice.wakeWord, provider: "cpu" }
  if (voice.power === "battery") {
    return {
      ...voice,
      wakeWord: { ...wakeWord, numThreads: 1 },
      asr: {
        ...voice.asr,
        numThreads: Math.min(voice.asr.numThreads, 2),
        provider: "cpu",
      },
    }
  }
  if (voice.power === "balanced") {
    return {
      ...voice,
      wakeWord,
      asr: { ...voice.asr, provider: "cpu" },
    }
  }
  return {
    ...voice,
    wakeWord,
    asr: { ...voice.asr, provider: accel },
  }
}

// TTS follows the same policy: only `performance` brings up the accelerator.
export const withTtsAccel = (
  tts: TtsConfig,
  power: PowerProfile,
  accel: EngineAccel,
): TtsConfig =>
  power === "performance" && accel !== "cpu"
    ? { ...tts, provider: accel }
    : { ...tts, provider: "" }
