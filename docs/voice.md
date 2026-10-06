# Voice assistant

The voice frontend is Chinese-first (English is planned) and fully local up to
the point where the recognized text is sent to the server.

## Pipeline

1. **Capture** – audio is read from PipeWire (`pw-record`), PulseAudio
   (`parec`) or ALSA (`arecord`), selected by `voice.audio.backend`
   (`auto` probes in that order). 16 kHz mono signed 16-bit PCM.
2. **Wake word** – a small local model listens **as a persistent streaming
   decoder**. TypeScript cannot bind sherpa-onnx without a native addon, so a
   deliberately thin Python worker (`qwq-kws`) owns just that one thing: it
   reads length-prefixed PCM on stdin and prints `{"keyword": "..."}` JSON on
   stdout. The worker stays resident, so the wake-word model is loaded once and
   idle CPU stays in the single digits. A rolling pre-roll buffer keeps the
   recent past so the wake word itself is not lost.
3. **Recognition** – once the wake word fires, recording continues until a
   trailing-silence timeout (energy VAD) or a maximum length, then the **whole**
   utterance (wake word included) is transcribed by a larger model
   (`sherpa-onnx-offline`, e.g. a Paraformer model).
4. **Ask** – the transcript is sent to the server with the same `Ask` RPC the
   CLI uses, and the answer is printed.

All orchestration (capture, VAD, ASR, server calls, TTS) lives in the
Effect/TypeScript frontend; the Python layer never sees configuration beyond its
argv and never performs business logic.

## Replies

The voice assistant uses the **`voice` prompt module** (see
[Configuration](configuration.md#prompts)); it never reuses the command
suggester's `command` prompt. When [tools](configuration.md#tools) are enabled
it runs the same agent loop as the other frontends, calling `bash` and file
tools as needed. It announces each tool call before it runs (`toolStartText`) and
after it finishes (`toolResultText`), speaking `toolDeniedText` when the call was
denied.

When a tool needs **approval** the assistant speaks `permissionText` and then
listens (without a wake word) for an allow/deny answer such as “允许” or
“拒绝”. Recognised answers are matched as substrings of `permissionAllowWords` /
`permissionDenyWords` (deny wins ties); after one unrecognised answer it
re-prompts once, and it denies when `tools.permission.timeoutMs` elapses. It then
speaks `permissionGrantedText` / `permissionDeniedText`, or
`permissionTimeoutText` on a timeout. Set `speakTools: false` to silence the
tool announcements, or set any phrase to an empty string to fall back to the
preset wording (the default preset speaks Chinese; `kawaii` softens it). After
the wake word it acknowledges with a configurable phrase (default preset: "我在"),
and on failure it speaks a *distinct* message for a recognition error versus an
endpoint error. After the model answers, the spoken text (any command block is
stripped) is synthesized with the configured `tts` engine and played. While
speaking, the microphone is gated so the assistant does not hear itself; for
stronger isolation, enable PipeWire's echo cancellation
(`voice.audio.echoCancel = true` or point `voice.audio.device` at your
`echo-cancel-source`).

## Configuration

```yaml
voice:
    audio:
        backend: auto       # auto | pipewire | pulse | alsa
        device: ""
        sampleRate: 16000
        echoCancel: false   # use PipeWire's echo-cancel-source (needs module-echo-cancel)
    wakeWord:
        command: qwq-kws                     # or `python3` + args: [qwq_kws_worker.py]
        args: []
        modelDir: /var/lib/qwq/models/kws
        # encoder/decoder/joiner default to ${modelDir}/{encoder,decoder,joiner}.onnx
        keywordsFile: /etc/qwq/keywords.txt
        keywordsScore: 1.5
        keywordsThreshold: 0.25
        provider: cpu
        numThreads: 1
    asr:
        binary: sherpa-onnx-offline
        modelDir: /var/lib/qwq/models/asr
        # modelFile defaults to ${modelDir}/model.onnx
        tokens: ""
        language: zh
        numThreads: 2
        provider: cpu    # onnxruntime backend (cpu | cuda | openvino | …)
    silenceMs: 800
    initialSilenceMs: 6000   # wait after the wake word before giving up
    silenceThreshold: 500
    maxUtteranceMs: 10000
    preRollMs: 1500
    acknowledge: true       # speak a short reply right after the wake word (opt-out)
    acknowledgeText: ""     # empty = preset default ("我在" / kawaii equivalent)
    speakErrors: true       # speak on ASR / endpoint failures (opt-out)
    asrErrorText: ""        # empty = preset default
    llmErrorText: ""        # empty = preset default
    speakTools: true        # announce tool calls before/after they run
    toolStartText: ""       # "{name}" -> tool name; empty = preset default
    toolResultText: ""
    toolDeniedText: ""      # spoken when a tool call is denied
    permissionText: ""      # spoken before listening for an approval answer
    permissionGrantedText: ""
    permissionDeniedText: ""
    permissionTimeoutText: ""
    permissionAllowWords: []  # spoken words that accept (substring match)
    permissionDenyWords: []   # spoken words that reject; deny wins ties
    power: battery          # battery | balanced | performance
    accel: auto             # auto | cpu | openvino | cuda | rocm | npu
```

`power` defaults to `battery`, which pins the always-on wake word to a single
CPU thread and keeps ASR on CPU — wake-word accuracy and latency give way to a
lower idle draw. When running on battery the frontend forces `battery` regardless
of this setting, and on AC it honours the configured profile. `accel` resolves
`auto` from the GPU vendor on Linux (Intel → `openvino`, NVIDIA → `cuda`,
AMD → `rocm`, otherwise `cpu`); the resolved provider is applied to ASR/TTS only
in the `performance` profile. See [Power and performance](performance.md).

Each wake word starts a **new session** (or reuses the previous voice session if
it is still inside `sessions.reuseMinutes`). Voice sessions are marked in the GUI
and stop counting as voice sessions once that window passes, so they become
ordinary sessions you can continue from any frontend.

The `sherpa-onnx` binaries, the Python environment for `qwq-kws` and the model
files are not bundled by the TypeScript package; the Nix package/module provides
them, or point the paths at your own copies.
