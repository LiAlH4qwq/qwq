# Power and performance

qwq targets low-power laptops, where idle draw matters more than peak speed.
The `battery` profile is the default and is allowed to trade wake-word accuracy
and latency for a lower idle draw.

## What runs, and what it costs

| Program | Idle behaviour | Notes |
| --- | --- | --- |
| `qwq` (server) | event-driven, no polling | session files are read at startup with bounded concurrency |
| `qwq-command` | one-shot process | loads the config and exits |
| `qwq-cli` | one-shot / line-based | no Ink/React loaded |
| `qwq-tui` | renders on change | streaming deltas are coalesced at ~20fps |
| `qwq-voice` | captures audio + wake word | the dominant idle cost is the streaming KWS engine |
| `qwq-gui` | Electron | the heaviest process; keep it off on battery if unused |

## Voice power profiles

`voice.power` selects how the voice frontend is configured:

- `battery` (default): the wake-word engine is pinned to one CPU thread and
  CPU provider, ASR is capped at two CPU threads, and accelerators are not
  brought up.
- `balanced`: the user's thread counts, CPU provider.
- `performance`: the resolved accelerator (`voice.accel`) is used for one-shot
  ASR and TTS.

The always-on wake word is deliberately kept on CPU in every profile: for a tiny
streaming model, a GPU/NPU bring-up costs more power than it saves.

### AC/battery switching

`qwq-voice` reads `/sys/class/power_supply/*/online` at startup. On battery it
forces the `battery` profile regardless of `voice.power`; on AC it honours the
configured profile. When the source cannot be determined (desktops, containers)
the configured profile is used. The switch happens when the process starts; a
restart is needed to pick up a plug/unplug.

## Hardware acceleration (`voice.accel`)

`voice.accel` is `auto | cpu | openvino | cuda | rocm | npu`. On Linux, `auto`
probes `/sys/class/drm/*/device/vendor`:

| GPU vendor | Resolved provider |
| --- | --- |
| Intel | `openvino` |
| NVIDIA | `cuda` |
| AMD | `rocm` |
| none / other OS | `cpu` |

The resolved provider is applied to ASR (and, for `--provider`-capable TTS
binaries, TTS) **only** in the `performance` profile; `battery` and `balanced`
stay on CPU. Laptops with an Intel GPU benefit on `performance` via OpenVINO;
NVIDIA/AMD machines via CUDA/ROCm. The provider must be compiled into the
sherpa-onnx/onnxruntime build in use.

## Idle budget

Reference laptop: **i5-12500H + Intel Xe**. On battery, with only `qwq serve`
and `qwq-voice` running and no wake word fired:

| Metric | Budget |
| --- | --- |
| `qwq-voice` CPU (idle) | < 5 % of one core (~0.05 cores) |
| `qwq-voice` RSS | < 150 MiB |
| Combined package power | < 4 W over the idle desktop baseline |

Measure with `dev/measure.nu` (see below) and record the observed numbers here
when validating a change.

## Algorithmic fixes

- Audio capture no longer copies the whole utterance on every frame; frames are
  concatenated once when the utterance ends.
- Streaming deltas are stored in a persistent `Chunk` and flushed to the UI at
  ~20fps instead of re-rendering per token.
- Session directory loading uses bounded concurrency.

## Measuring

`dev/measure.nu` (Nushell; bash is banned) reports per-process CPU time and RSS
from `/proc/<pid>/stat`, Intel RAPL package energy (`energy_uj`) and battery
discharge (`power_now`):

```console
nu dev/measure.nu
nu dev/measure.nu --seconds 30 --interval 500 --program qwq-voice
```

Run it with the machine idle and then under a wake-word-triggered request; record
both figures in the table above.
