import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import {
  TtsConfig,
  type VoiceConfig,
} from "@qwq/shared/config/schema"
import { withPower, withTtsAccel } from "@qwq/server/voice/profile"

const base: VoiceConfig = {
  audio: { backend: "auto", device: "", sampleRate: 16000, echoCancel: false },
  wakeWord: {
    command: "qwq-kws",
    args: [],
    modelDir: "/m",
    keywordsFile: "/k",
    keywordsScore: 1.5,
    keywordsThreshold: 0.25,
    provider: "cuda",
    numThreads: 8,
  },
  asr: {
    binary: "sherpa-onnx-offline",
    modelDir: "/a",
    tokens: "",
    language: "zh",
    numThreads: 8,
    provider: "cuda",
  },
  silenceMs: 800,
  initialSilenceMs: 6000,
  silenceThreshold: 500,
  maxUtteranceMs: 10000,
  preRollMs: 1500,
  acknowledge: true,
  acknowledgeText: "",
  speakErrors: true,
  asrErrorText: "",
  llmErrorText: "",
  speakTools: true,
  toolStartText: "",
  toolResultText: "",
  toolDeniedText: "",
  permissionText: "",
  permissionGrantedText: "",
  permissionDeniedText: "",
  permissionTimeoutText: "",
  permissionAllowWords: [],
  permissionDenyWords: [],
  power: "battery",
  accel: "auto",
}

describe("voice power profile", () => {
  it("pins battery voice to a single CPU thread", () => {
    const out = withPower(base, "cuda")
    expect(out.wakeWord.numThreads).toBe(1)
    expect(out.wakeWord.provider).toBe("cpu")
    expect(out.asr.numThreads).toBe(2)
    expect(out.asr.provider).toBe("cpu")
  })

  it("applies the accelerator only for performance", () => {
    const performance = withPower({ ...base, power: "performance" }, "cuda")
    expect(performance.wakeWord.provider).toBe("cpu")
    expect(performance.asr.provider).toBe("cuda")

    const balanced = withPower({ ...base, power: "balanced" }, "cuda")
    expect(balanced.wakeWord.provider).toBe("cpu")
    expect(balanced.asr.provider).toBe("cpu")
  })

  it("keeps TTS on CPU unless performance uses a non-CPU accelerator", () => {
    const tts = Schema.decodeSync(TtsConfig)({})
    expect(withTtsAccel(tts, "battery", "cuda").provider).toBe("")
    expect(withTtsAccel(tts, "performance", "cpu").provider).toBe("")
    expect(withTtsAccel(tts, "performance", "cuda").provider).toBe("cuda")
  })
})
