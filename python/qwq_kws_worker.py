#!/usr/bin/env python3
"""qwq streaming keyword-spotter worker.

A deliberately thin bridge: it owns the one thing TypeScript cannot do without a
native addon -- a persistent sherpa-onnx *streaming* keyword spotter. It speaks a
minimal binary framing on stdin and newline-delimited JSON on stdout:

    stdin : [uint32 little-endian length][int16 little-endian PCM] repeated
    stdout: {"keyword": "..."} once per detection
    stderr: diagnostics

Everything else (capture, energy VAD / endpointing, offline ASR, server calls,
TTS) lives in the Effect/TypeScript voice frontend. This worker never sees
configuration beyond its argv and never performs any business logic.
"""

import argparse
import json
import struct
import sys

import numpy as np
import sherpa_onnx


def parse_args():
    parser = argparse.ArgumentParser(prog="qwq-kws")
    parser.add_argument("--tokens", required=True)
    parser.add_argument("--encoder", required=True)
    parser.add_argument("--decoder", required=True)
    parser.add_argument("--joiner", required=True)
    parser.add_argument("--keywords-file", required=True)
    parser.add_argument("--keywords-score", type=float, default=1.5)
    parser.add_argument("--keywords-threshold", type=float, default=0.25)
    parser.add_argument("--provider", default="cpu")
    parser.add_argument("--num-threads", type=int, default=1)
    parser.add_argument("--sample-rate", type=int, default=16000)
    return parser.parse_args()


def main():
    args = parse_args()
    spotter = sherpa_onnx.KeywordSpotter(
        tokens=args.tokens,
        encoder=args.encoder,
        decoder=args.decoder,
        joiner=args.joiner,
        num_threads=args.num_threads,
        keywords_file=args.keywords_file,
        keywords_score=args.keywords_score,
        keywords_threshold=args.keywords_threshold,
        provider=args.provider,
    )
    stream = spotter.create_stream()
    source = sys.stdin.buffer

    while True:
        header = source.read(4)
        if len(header) < 4:
            break
        (size,) = struct.unpack("<I", header)
        payload = source.read(size)
        if len(payload) < size:
            break

        samples = np.frombuffer(payload, dtype=np.dtype("<i2")).astype(
            np.float32
        ) / 32768.0
        stream.accept_waveform(args.sample_rate, samples)
        while spotter.is_ready(stream):
            spotter.decode_stream(stream)
        keyword = spotter.get_result(stream)
        if keyword:
            print(json.dumps({"keyword": keyword}), flush=True)
            stream = spotter.create_stream()


if __name__ == "__main__":
    main()
