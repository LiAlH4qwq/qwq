# 语音助手

语音前端以中文为主（计划支持英文），直到识别文本发送给服务端之前都完全本地运行。

## 流程

1. **采集** —— 从 PipeWire（`pw-record`）、PulseAudio（`parec`）或 ALSA
   （`arecord`）读取音频，由 `voice.audio.backend` 选择（`auto` 按此顺序探测）。
   16 kHz 单声道 16 位有符号 PCM。
2. **唤醒词** —— 本地小模型以**常驻流式解码**方式监听。TypeScript 无法在没有原生绑定的
   情况下调用 sherpa-onnx，因此由一个刻意做薄的 Python worker（`qwq-kws`）只负责这一件
   事：从 stdin 读取长度前缀的 PCM，在 stdout 输出 `{"keyword": "..."}` JSON。worker
   常驻，模型只加载一次，空闲 CPU 维持在个位数。滚动的前置缓冲会保留最近的一小段音频，
   以免丢失唤醒词本身。
3. **识别** —— 唤醒词命中后继续录音，直到尾部静音超时（能量 VAD）或达到最大时长，再由
   更大的模型（`sherpa-onnx-offline`，例如 Paraformer）转写 **整段** 音频（包含唤醒词）。
4. **提问** —— 转写文本通过与命令行相同的 `Ask` RPC 发送给服务端，并打印回答。

所有编排（采集、VAD、ASR、服务端调用、TTS）都在 Effect/TypeScript 前端；Python 层除了
argv 之外看不到任何配置，也不承担任何业务逻辑。

## 回复

语音助手使用 **`voice` 提示词模块**（见 [配置](configuration.md#prompts)），不会复用命令
建议器的 `command` 提示词。启用 [工具](configuration.md#tools) 时，它与其它前端走同一条
智能体循环，按需调用 `bash` 和文件工具。它会在工具运行前朗读 `toolStartText`、运行后朗读
`toolResultText`，被拒绝时朗读 `toolDeniedText`。

当工具需要**授权**时，助手会朗读 `permissionText`，然后在无需唤醒词的情况下监听“允许 /
拒绝”等答复：识别文本按子串匹配 `permissionAllowWords` / `permissionDenyWords`（拒绝词
优先）；一次未识别会再提示一次，`tools.permission.timeoutMs` 超时后按拒绝处理。随后朗读
`permissionGrantedText` / `permissionDeniedText`，超时则朗读 `permissionTimeoutText`。
设 `speakTools: false` 可关闭工具播报；任一文本设为空串则回退到预设措辞（default 为中文，
`kawaii` 更软萌）。唤醒后会先回应一句可配置的话（默认预设为「我在」），失败时**分别**对
语音识别错误与大模型端点错误朗读不同的提示。模型回答后，其中的口播文本（命令块会被剥离）
会用配置的 `tts` 引擎合成
并播放。播放期间会暂停麦克风采集，避免助手听到自己；如需更强的隔离，可启用 PipeWire 的
回声消除（`voice.audio.echoCancel = true`，或把 `voice.audio.device` 指向你的
`echo-cancel-source`）。

## 配置

```yaml
voice:
    audio:
        backend: auto       # auto | pipewire | pulse | alsa
        device: ""
        sampleRate: 16000
        echoCancel: false   # 使用 PipeWire 的 echo-cancel-source（需 module-echo-cancel）
    wakeWord:
        command: qwq-kws                     # 或用 `python3` + args: [qwq_kws_worker.py]
        args: []
        modelDir: /var/lib/qwq/models/kws
        # encoder/decoder/joiner 默认为 ${modelDir}/{encoder,decoder,joiner}.onnx
        keywordsFile: /etc/qwq/keywords.txt
        keywordsScore: 1.5
        keywordsThreshold: 0.25
        provider: cpu
        numThreads: 1
    asr:
        binary: sherpa-onnx-offline
        modelDir: /var/lib/qwq/models/asr
        # modelFile 默认为 ${modelDir}/model.onnx
        tokens: ""
        language: zh
        numThreads: 2
        provider: cpu    # onnxruntime 后端（cpu | cuda | openvino | …）
    silenceMs: 800
    initialSilenceMs: 6000   # wait after the wake word before giving up
    silenceThreshold: 500
    maxUtteranceMs: 10000
    preRollMs: 1500
    acknowledge: true       # 唤醒后马上回应一句（opt-out）
    acknowledgeText: ""     # 空 = 预设默认（default「我在」/ kawaii 对应词）
    speakErrors: true       # 失败时语音提示（opt-out）
    asrErrorText: ""        # 空 = 预设默认
    llmErrorText: ""        # 空 = 预设默认
    speakTools: true        # 工具调用前后播报
    toolStartText: ""       # "{name}" 替换为工具名；空 = 预设默认
    toolResultText: ""
    toolDeniedText: ""      # 工具被拒绝时朗读
    permissionText: ""      # 朗读后监听授权答复
    permissionGrantedText: ""
    permissionDeniedText: ""
    permissionTimeoutText: ""
    permissionAllowWords: []  # 表示允许的词（子串匹配）
    permissionDenyWords: []   # 表示拒绝的词；与允许词冲突时拒绝优先
    power: battery          # battery | balanced | performance
    accel: auto             # auto | cpu | openvino | cuda | rocm | npu
```

`power` 默认 `battery`：常驻唤醒词固定单线程 CPU，ASR 也留在 CPU——以唤醒准确率与延迟
换取更低空闲功耗。使用电池时无论此设置为何都会强制 `battery` 档，接电时使用配置档位。
`accel` 在 Linux 上会按显卡厂商把 `auto` 解析为具体后端（Intel → `openvino`、
NVIDIA → `cuda`、AMD → `rocm`，其余为 `cpu`）；解析结果仅在 `performance` 档应用到
ASR/TTS。见 [功耗与性能](performance.md)。

每次唤醒都会开启 **新会话**（若上一个语音会话仍在 `sessions.reuseMinutes` 窗口内，则复用
它）。语音会话会在图形界面中标记；超出该窗口后便成为普通会话，可从任意前端继续。

`sherpa-onnx` 二进制、`qwq-kws` 的 Python 环境与模型文件不随 TypeScript 包分发；由 Nix
包/模块提供，或把路径指向你自己的副本。
