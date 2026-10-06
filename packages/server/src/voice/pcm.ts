const textEncoder = new TextEncoder()

const sampleBytes = 2

export const samplesOf = (pcm: Uint8Array): Int16Array => {
  const count = Math.floor(pcm.length / sampleBytes)
  const copy = pcm.slice(0, count * sampleBytes)
  return new Int16Array(copy.buffer, copy.byteOffset, count)
}

export const concatChunks = (
  chunks: ReadonlyArray<Uint8Array>,
): Uint8Array => {
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0)
  const output = new Uint8Array(total)
  chunks.reduce((offset, chunk) => {
    output.set(chunk, offset)
    return offset + chunk.length
  }, 0)
  return output
}

export const appendBounded = (
  previous: Uint8Array,
  chunk: Uint8Array,
  maxBytes: number,
): Uint8Array => {
  if (maxBytes <= 0) {
    return new Uint8Array(0)
  }
  const combined = concatChunks([previous, chunk])
  return combined.length <= maxBytes
    ? combined
    : combined.slice(combined.length - maxBytes)
}

export const rms = (pcm: Uint8Array): number => {
  const samples = samplesOf(pcm)
  if (samples.length === 0) {
    return 0
  }
  const sum = samples.reduce((acc, sample) => acc + sample * sample, 0)
  return Math.sqrt(sum / samples.length)
}

export const isSilent = (pcm: Uint8Array, threshold: number): boolean =>
  rms(pcm) < threshold

export const encodeWav = (
  pcm: Uint8Array,
  sampleRate: number,
  channels = 1,
  bitsPerSample = 16,
): Uint8Array => {
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = channels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const header = new Uint8Array(44)
  const view = new DataView(header.buffer)
  header.set(textEncoder.encode("RIFF"), 0)
  view.setUint32(4, 36 + pcm.length, true)
  header.set(textEncoder.encode("WAVE"), 8)
  header.set(textEncoder.encode("fmt "), 12)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  header.set(textEncoder.encode("data"), 36)
  view.setUint32(40, pcm.length, true)
  return concatChunks([header, pcm])
}
