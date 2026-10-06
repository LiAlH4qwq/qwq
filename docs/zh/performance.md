# 功耗与性能

qwq 面向低功耗笔记本，空闲功耗比峰值速度更重要。默认档位是 `battery`，
允许用唤醒准确率与延迟换取更低的空闲功耗。

## 各程序的成本

| 程序 | 空闲行为 | 说明 |
| --- | --- | --- |
| `qwq`（服务端） | 事件驱动，无轮询 | 启动时以有界并发读取会话文件 |
| `qwq-command` | 一次性进程 | 读取配置后退出 |
| `qwq-cli` | 一次性 / 逐行 | 不加载 Ink/React |
| `qwq-tui` | 有变化才渲染 | 流式增量按约 20fps 合并 |
| `qwq-voice` | 持续采集音频 + 唤醒词 | 空闲开销主要来自常驻 KWS 引擎 |
| `qwq-gui` | Electron | 最重的进程；不用时在电池下建议关闭 |

## 语音功耗档

`voice.power` 决定语音前端的配置：

- `battery`（默认）：唤醒词引擎固定单线程 CPU 后端，ASR 限制为两个 CPU 线程，
  不启用加速器。
- `balanced`：使用用户设置的线程数，CPU 后端。
- `performance`：一次性 ASR/TTS 使用解析后的加速器（`voice.accel`）。

常驻唤醒词在所有档位都刻意留在 CPU：对极小的流式模型而言，拉起 GPU/NPU 的功耗
高于其节省。

### 交流/电池切换

`qwq-voice` 启动时读取 `/sys/class/power_supply/*/online`。使用电池时无论
`voice.power` 配置为何都会强制 `battery` 档；接电时使用配置的档位。无法判定电源
来源时（台式机、容器）使用配置档位。切换发生在进程启动时；插拔后需重启才会生效。

## 硬件加速（`voice.accel`）

`voice.accel` 取值为 `auto | cpu | openvino | cuda | rocm | npu`。在 Linux 上，
`auto` 会探测 `/sys/class/drm/*/device/vendor`：

| 显卡厂商 | 解析出的后端 |
| --- | --- |
| Intel | `openvino` |
| NVIDIA | `cuda` |
| AMD | `rocm` |
| 无 / 其他系统 | `cpu` |

解析出的后端**仅在 `performance` 档**应用到 ASR（以及支持 `--provider` 的 TTS
程序）；`battery` 与 `balanced` 保持 CPU。带 Intel 核显的笔记本可在性能档受益于
OpenVINO，NVIDIA/AMD 机器分别受益于 CUDA/ROCm。该后端必须已编译进所用的
sherpa-onnx/onnxruntime 构建。

## 空闲预算

参考笔记本：**i5-12500H + Intel Xe**。使用电池、仅运行 `qwq serve` 与 `qwq-voice`
且未触发唤醒词时：

| 指标 | 预算 |
| --- | --- |
| `qwq-voice` CPU（空闲） | 单核 < 5%（约 0.05 核） |
| `qwq-voice` 常驻内存 | < 150 MiB |
| 整机封装功耗 | 相比空闲桌面基线 < 4 W |

用 `dev/measure.nu`（见下）测量，并在验证改动时把实测值记录到上表。

## 算法层修复

- 音频采集不再每帧复制整段语音；仅在语句结束时拼接一次。
- 流式增量存入持久化 `Chunk`，并以约 20fps 刷新界面，而非每个 token 重渲染。
- 会话目录加载使用有界并发。

## 测量

`dev/measure.nu`（Nushell；仓库禁用 bash）会报告来自 `/proc/<pid>/stat` 的
每进程 CPU 时间与 RSS、Intel RAPL 封装能耗（`energy_uj`）以及电池放电
（`power_now`）：

```console
nu dev/measure.nu
nu dev/measure.nu --seconds 30 --interval 500 --program qwq-voice
```

先后在空闲状态和唤醒词触发的请求下运行，并把两次数据记录到上表。
