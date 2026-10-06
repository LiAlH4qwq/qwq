# Configuration

qwq reads `config.yaml` from its working directory (or `--config <path>`). Copy
`config.example.yaml` to get started. If you use the NixOS/Home Manager module,
the file is generated from `services.qwq.settings`.

```yaml
debug: false

api:
    type: openai            # openai | anthropic
    url: https://api.siliconflow.cn/v1/chat/completions
    model: deepseek-ai/DeepSeek-V3
    key: YOUR_API_TOKEN     # or keyEnv: QWQ_API_KEY
    # keyEnv: QWQ_API_KEY

sessions:
    dir: ""                 # default: ./sessions
    reuseMinutes: 1         # voice/command reuse window (0 = always new)
    title:
        enable: true        # model-written 「frontend: topic」 titles (opt-out)
        maxChars: 20
    compact:
        enable: true        # auto-summarise older turns when over budget
        maxChars: 48000
        keepRecent: 16

envAccess:
    envVars: [SHELL, USER, XDG_SESSION_TYPE, XDG_SESSION_DESKTOP]

server:
    host: 127.0.0.1
    port: 8787
```

## `api`

| Field    | Description |
| -------- | ----------- |
| `type`   | `openai` or `anthropic`; selects the response parser. |
| `url`    | Chat-completions (OpenAI) or messages (Anthropic) endpoint. |
| `model`  | Model name. |
| `key`    | API token (or use `keyEnv`). |
| `keyEnv` | Name of an environment variable holding the token. Exactly one of `key`/`keyEnv` is required. |
| `stream` | Stream the reply token-by-token (default `true`; opt out with `false`). |

## `sessions`

Every frontend shares one multi-session store on the server: any frontend can
list and continue any session, including sessions started by voice. Sessions are
stored as one JSON file per session under `dir` (default `./sessions`).

- `reuseMinutes` — voice and command completions reuse the previous session of
  the same kind when started again within this window (`0` disables reuse, so
  every wake/call starts a new session).
- `title.enable` — generate a model-written `frontend: topic` title from the
  first message (`opt-out`). If it fails, the first message is used as the
  topic, then `frontend: time`.
- `compact` — when the working transcript exceeds `maxChars`, older messages are
  replaced by a model-written summary, always keeping the most recent
  `keepRecent` messages. Disable with `enable: false` (the full transcript is
  still what gets stored).

## `envAccess`

The environment variables the assistant may see (for example to recommend
commands for the right shell).

## `server`

Where `qwq serve` listens. Frontends read this to find the server.

## `prompts`

The system prompt is **modular**: `common`, `command`, `voice`, `chat` and
`agent`. `command` is used by the CLI/shell-integration (the command suggester);
`voice` by the voice assistant; `chat` by the GUI; and `agent` (tool/execution
instructions) is appended when tools are enabled. The two never share a prompt.
Both start from a persona preset.

```yaml
prompts:
    preset: kawaii        # default | kawaii
    modules:              # optional overrides, merged over the preset
        common: "…"
        command: "…"
        voice: "…"
        chat: "…"
        agent: "…"
```

## `tools`

The assistant can **execute commands and tools** on its own. Models that
support native tool calling use it; otherwise the assistant falls back to the
text command-block protocol. Every frontend (CLI, voice, GUI) runs the same
agent loop.

```yaml
tools:
    enable: true
    mode: auto            # auto | off (off = only suggest, never execute)
    native: auto          # auto | on | off
    shell: ""             # default: bash
    workingDir: ""        # default: the server's working directory
    timeoutMs: 30000
    maxSteps: 8
    maxOutputBytes: 20000
    blacklist: []         # extra dangerous-command patterns
    permission:
        mode: ask         # ask | auto | deny
        allow: []         # patterns that skip the review prompt, e.g. ["^ls\\b"]
        timeoutMs: 60000  # deny when no frontend answers in time
```

Tools: `bash`, `read`, `write`, `edit`, `list`, `glob`, `grep`, `webfetch`.
A built-in blacklist always rejects obviously dangerous commands; add your own
with `blacklist`. Commands that are risky but not blacklisted need approval:
with `mode: ask` the frontend is asked (TUI, GUI or voice), `mode: auto` allows them, and
`mode: deny` rejects them. The non-interactive `qwq-cli` denies by default.
## `tts`

Configurable text-to-speech, played by the voice frontend:

```yaml
tts:
    enable: true
    engine: piper         # none | piper | command
    binary: piper
    model: /var/lib/qwq/tts/zh_CN-huayan-medium.onnx
    speed: 1.0
    player: pw-play
    provider: ""          # onnxruntime provider for --provider-capable TTS binaries
    # command: "edge-tts --file {in} --write-media {out}"
```

`engine: none` disables it. `piper` runs the binary with the model; `command`
runs an arbitrary command template where `{in}` is a text file and `{out}` a WAV
file, then `player` plays the result. `provider` is only passed to binaries that
accept `--provider` (e.g. sherpa-onnx offline TTS); leave it empty for piper. In
the `performance` voice profile it is filled from `voice.accel`.

## `gui`

The Electron desktop frontend (`qwq-gui`):

```yaml
gui:
    enable: true
    tray: true            # register a system tray
    popupDurationMs: 10000
    theme: light          # light | dark
    popup: voice          # voice | all | none (which sessions pop up the window)
```

## `voice`

Optional; see [Voice assistant](voice.md).
