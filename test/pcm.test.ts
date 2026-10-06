import { describe, expect, it } from "vitest"
import { appendBounded, concatChunks, encodeWav, isSilent, rms } from "@qwq/server/voice/pcm"

const pcmOf = (samples: ReadonlyArray<number>): Uint8Array =>
  new Uint8Array(Int16Array.from(samples).buffer)

describe("pcm helpers", () => {
  it("computes the root mean square", () => {
    expect(rms(pcmOf([1000, -1000]))).toBeCloseTo(1000, 5)
    expect(rms(new Uint8Array(0))).toBe(0)
  })

  it("detects silence by an rms threshold", () => {
    expect(isSilent(pcmOf([0, 0]), 1)).toBe(true)
    expect(isSilent(pcmOf([1000, -1000]), 1)).toBe(false)
  })

  it("concatenates chunks", () => {
    const result = concatChunks([
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
    ])
    expect(Array.from(result)).toEqual([1, 2, 3])
  })

  it("keeps only the trailing bytes when bounded", () => {
    const result = appendBounded(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), 4)
    expect(Array.from(result)).toEqual([2, 3, 4, 5])
  })

  it("encodes a canonical wav header", () => {
    const wav = encodeWav(new Uint8Array([0, 0, 1, 0]), 16000)
    const header = new TextDecoder()
    expect(header.decode(wav.slice(0, 4))).toBe("RIFF")
    expect(header.decode(wav.slice(8, 12))).toBe("WAVE")
    expect(header.decode(wav.slice(12, 16))).toBe("fmt ")
    expect(header.decode(wav.slice(36, 40))).toBe("data")
    const view = new DataView(wav.buffer)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(40, true)).toBe(4)
  })
})
