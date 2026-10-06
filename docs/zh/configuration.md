# 配置

qwq 从工作目录读取 `config.yaml`（或使用 `--config <path>`）。可复制
`config.example.yaml` 起步。若使用 NixOS / Home Manager 模块，该文件由
`services.qwq.settings` 生成。

```yaml
debug: false

api:
    type: openai            # openai | anthropic
    url: https://api.siliconflow.cn/v1/chat/completions
    model: deepseek-ai/DeepSeek-V3
    key: YOUR_API_TOKEN     # 或 keyEnv: QWQ_API_KEY
    # keyEnv: QWQ_API_KEY

sessions:
    dir: ""                 # 默认 ./sessions
    reuseMinutes: 1         # 语音/命令复用窗口（0 = 每次新建）
    title:
        enable: true        # 模型生成「前端：主题」标题（可关闭）
        maxChars: 20
    compact:
        enable: true        # 超出预算时自动摘要较早对话
        maxChars: 48000
        keepRecent: 16

envAccess:
    envVars: [SHELL, USER, XDG_SESSION_TYPE, XDG_SESSION_DESKTOP]

server:
    host: 127.0.0.1
    port: 8787
```

## `api`

| 字段     | 说明 |
| -------- | ---- |
| `type`   | `openai` 或 `anthropic`，决定应答解析方式。 |
| `url`    | Chat-completions（OpenAI）或 messages（Anthropic）端点。 |
| `model`  | 模型名。 |
| `key`    | API 令牌（或改用 `keyEnv`）。 |
| `keyEnv` | 保存令牌的环境变量名。`key` 与 `keyEnv` 必须且只能提供一个。 |
| `stream` | 逐字流式返回回复（默认 `true`，设为 `false` 关闭）。 |

## `sessions`

所有前端共享服务端上的同一套多会话存储：任何前端都能列出并继续任意会话（包括语音发起的
会话）。每个会话以单个 JSON 文件保存在 `dir`（默认 `./sessions`）下。

- `reuseMinutes`：语音与命令补全在该时间窗内再次使用时复用上一个同类会话（`0` 表示不复用，
  即每次唤醒 / 调用都新建会话）。
- `title.enable`：根据首条消息用模型生成「前端：主题」标题（可关闭）。失败时依次回退为首条
  消息主题、「前端：时间」。
- `compact`：当工作对话超过 `maxChars` 时，用模型摘要替换较早消息，并始终保留最近
  `keepRecent` 条。设 `enable: false` 可关闭（存储的仍是完整对话）。

## `envAccess`

允许助手读取的环境变量（例如据此推荐对应 Shell 的命令）。

## `server`

`qwq serve` 的监听地址；前端据此连接服务端。

## `prompts`

系统提示词是**模块化**的：`common`、`command`、`voice`、`chat`、`agent`。
`command` 供命令行 / Shell 集成（指令建议器）使用；`voice` 供语音助手使用；`chat` 供
图形界面使用；启用工具时会追加 `agent` 模块（工具/执行说明）。它们互不复用提示词，均基于
一个预设人格。

```yaml
prompts:
    preset: kawaii        # default | kawaii
    modules:              # 可选覆盖，合并到预设之上
        common: "……"
        command: "……"
        voice: "……"
        chat: "……"
        agent: "……"
```

## `tools`

助手可以**自行执行命令与工具**。支持原生工具调用的模型会使用工具调用，否则回退到文本
命令块协议。所有前端（命令行、语音、GUI）都走同一条智能体循环。

```yaml
tools:
    enable: true
    mode: auto            # auto | off（off = 只建议、不执行）
    native: auto          # auto | on | off
    shell: ""             # 默认 bash
    workingDir: ""        # 默认服务端工作目录
    timeoutMs: 30000
    maxSteps: 8
    maxOutputBytes: 20000
    blacklist: []         # 追加危险命令黑名单
    permission:
        mode: ask         # ask | auto | deny
        allow: []         # 命中即跳过确认的正则，例如 ["^ls\\b"]
        timeoutMs: 60000  # 无前端应答时的超时，超时按拒绝
```

工具：`bash`、`read`、`write`、`edit`、`list`、`glob`、`grep`、`webfetch`。内置黑名单
始终会拒绝明显危险的命令，可用 `blacklist` 追加自己的正则。危险但未列入黑名单的命令需要
确认：`mode: ask` 询问前端（TUI/GUI），`mode: auto` 自动允许，`mode: deny` 直接拒绝；
非交互式 `qwq-cli` 默认拒绝。
## `tts`

可配置的语音合成，由语音前端播放：

```yaml
tts:
    enable: true
    engine: piper         # none | piper | command
    binary: piper
    model: /var/lib/qwq/tts/zh_CN-huayan-medium.onnx
    speed: 1.0
    player: pw-play
    provider: ""          # 支持 --provider 的 TTS 程序的 onnxruntime 后端
    # command: "edge-tts --file {in} --write-media {out}"
```

`engine: none` 关闭合成。`piper` 用二进制加模型合成；`command` 运行任意命令模板，其中
`{in}` 是文本文件、`{out}` 是 WAV 文件，随后由 `player` 播放。`provider` 只会传给
接受 `--provider` 的程序（如 sherpa-onnx 离线 TTS）；piper 请留空。在
`performance` 语音档位下，它会由 `voice.accel` 自动填充。

## `gui`

Electron 桌面前端（`qwq-gui`）：

```yaml
gui:
    enable: true
    tray: true            # 注册系统托盘
    popupDurationMs: 10000
    theme: light          # light | dark
    popup: voice          # voice | all | none（哪些会话弹窗）
```

## `voice`

可选；见 [语音助手](voice.md)。
