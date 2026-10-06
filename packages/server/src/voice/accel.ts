import { FileSystem } from "@effect/platform"
import { Effect, Option } from "effect"
import type { Accel, VoiceConfig } from "@qwq/shared/config/schema"

// The accelerator actually used for one-shot ASR/TTS. `auto` is resolved from
// the host; the always-on wake word stays on CPU regardless (a GPU/NPU bring-up
// costs more than it saves for a tiny streaming model).
export type EngineAccel = Exclude<Accel, "auto">

export type GpuVendor = "intel" | "nvidia" | "amd"

// PCI vendor ids as Linux writes them under /sys/class/drm/*/device/vendor.
export const parsePciVendor = (content: string): Option.Option<GpuVendor> => {
  switch (content.trim().toLowerCase()) {
    case "0x8086":
      return Option.some("intel")
    case "0x10de":
      return Option.some("nvidia")
    case "0x1002":
    case "0x1022":
      return Option.some("amd")
    default:
      return Option.none()
  }
}

// Pure resolution: explicit choices win; `auto` picks the vendor's native
// provider on Linux and falls back to CPU everywhere else.
export const resolveAccel = (
  accel: Accel,
  platform: string,
  vendor: Option.Option<GpuVendor>,
): EngineAccel => {
  if (accel !== "auto") {
    return accel
  }
  if (platform !== "linux") {
    return "cpu"
  }
  return Option.match(vendor, {
    onNone: () => "cpu",
    onSome: (value) =>
      value === "intel" ? "openvino" : value === "nvidia" ? "cuda" : "rocm",
  })
}

const vendorPaths: ReadonlyArray<string> = [
  "/sys/class/drm/card0/device/vendor",
  "/sys/class/drm/card1/device/vendor",
  "/sys/class/drm/card2/device/vendor",
]

const readVendor = (
  path: string,
): Effect.Effect<Option.Option<GpuVendor>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFileString(path).pipe(
      Effect.map(parsePciVendor),
      Effect.orElseSucceed(() => Option.none<GpuVendor>()),
    )
  })

// Read the edge: probe the DRM vendor files. Pure parsing is in `parsePciVendor`.
export const detectVendor = (
  platform: string,
): Effect.Effect<Option.Option<GpuVendor>, never, FileSystem.FileSystem> =>
  platform === "linux"
    ? Effect.all(vendorPaths.map(readVendor)).pipe(
        Effect.map((vendors) =>
          vendors.reduce<Option.Option<GpuVendor>>(
            (found, current) => (Option.isSome(found) ? found : current),
            Option.none(),
          ),
        ),
      )
    : Effect.succeed(Option.none())

export const resolveVoiceAccel = (
  voice: VoiceConfig,
): Effect.Effect<EngineAccel, never, FileSystem.FileSystem> =>
  detectVendor(process.platform).pipe(
    Effect.map((vendor) => resolveAccel(voice.accel, process.platform, vendor)),
  )
