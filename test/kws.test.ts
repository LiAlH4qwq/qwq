import { Option } from "effect"
import { describe, expect, it } from "vitest"
import type { WakeWordConfig } from "@qwq/shared/config/schema"
import { decodeKeywordLine, kwsArgs } from "@qwq/server/voice/kws"

const wakeWordConfig: WakeWordConfig = {
  command: "qwq-kws",
  args: [],
  modelDir: "/models/kws",
  keywordsFile: "/etc/qwq/keywords.txt",
  keywordsScore: 1.5,
  keywordsThreshold: 0.25,
  provider: "cpu",
  numThreads: 1,
}

describe("kws worker", () => {
  it("builds --key=value arguments with default model files", () => {
    const args = kwsArgs(wakeWordConfig, 16000)
    expect(args).toContain("--tokens=/models/kws/tokens.txt")
    expect(args).toContain("--encoder=/models/kws/encoder.onnx")
    expect(args).toContain("--decoder=/models/kws/decoder.onnx")
    expect(args).toContain("--joiner=/models/kws/joiner.onnx")
    expect(args).toContain("--keywords-file=/etc/qwq/keywords.txt")
    expect(args).toContain("--sample-rate=16000")
  })

  it("decodes keyword event lines and ignores anything else", () => {
    expect(decodeKeywordLine('{"keyword":"小爱同学"}')).toEqual(
      Option.some({ keyword: "小爱同学" }),
    )
    expect(decodeKeywordLine("sherpa-onnx: log line")).toEqual(Option.none())
  })
})
