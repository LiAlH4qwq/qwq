# 使用

`qwq` 是服务器；每个前端都是独立程序，通过 RPC 与它通信。

## 运行服务端

```bash
qwq serve --config config.yaml
```

## 非交互式命令行（`qwq-cli`）

`qwq-cli` 面向机器：**stdout 只输出载荷**，stderr 输出诊断，退出码为
`0` 成功 / `1` 错误 / `2` 用法错误。它不会加载终端 UI 依赖。

```bash
qwq-cli ask "怎么查看内核版本？"          # 一次性提问
echo "解释这段报错" | qwq-cli ask -        # 从 stdin 读取问题
qwq-cli list --format json                # 会话列表（JSON）
qwq-cli get <id>                          # 输出整个会话（含历史）
qwq-cli rename <id> "新标题"
qwq-cli delete <id>
qwq-cli schema --pretty                   # 机器可读契约
```

`--session <id>` 继续指定会话；当 stdout 不是 TTY 时 `--format` 默认为 json，
输出含 `sessionId` 与 `answer` 的 JSON 对象；`--permission auto` 自动允许需复核的
命令，否则 CLI 自动拒绝权限询问（机器安全）。工具进度写入 stderr，`-q` 可静默。

`qwq-cli repl` 是人类 REPL（`:help`、`:new`、`:sessions`、`:session <id>`、`:quit`）。
机器用法：`qwq-cli repl --agent` 使用 ENQ 就绪协议并逐行输出 JSON 响应；
`qwq-cli repl --protocol json` 读取按行分隔的 JSON 请求（`{"question": "…"}`）。

## 终端界面（`qwq-tui`）

```bash
qwq-tui --config config.yaml          # 全屏 TUI（ink/React）
qwq-tui --session <id>
```

TUI 将工具调用与文本内联展示（运行中/已完成），启动时加载会话历史，提供会话选择器
（`Ctrl+S`），并在危险命令需要确认时弹出 [y/N] 提示。所有前端共享同一批会话，
包括语音发起的会话。

## 一次性 / Shell 集成

```bash
qwq-command ask FishShell 请问怎么查看系统内核信息呀？
qwq-command integrate-shell fish > ~/.config/fish/conf.d/qwq.fish
```

命令客户端会读取配置以获取服务端地址与可访问的环境变量，通过 RPC 发送问题并打印回答。
生成的 Shell 函数默认名为 `qwq`；当助手给出命令建议时，函数会在执行前请求确认（
`check-cmd-exist`、`extract-text`、`extract-cmd` 在本地完成）。

## 语音

```bash
qwq-voice --config config.yaml
```

见 [语音助手](voice.md)。

## 桌面图形界面

`qwq-gui` 是 Electron 前端。它注册系统托盘，在聊天窗口旁显示会话列表，并为助手回复弹出
桌面通知窗口（带倒计时、暂停/关闭）。默认仅对 **语音** 会话弹窗；可用 `gui.popup` 改为
`all` 或 `none`。默认亮色主题。`qwq-gui --help` 列出其参数
（`--server`、`--popup-ms`、`--popup`、`--theme`、`--no-tray`、`--hidden`）。

## 程序

- `qwq serve` —— 服务端。
- `qwq-command ask|integrate-shell|extract-*|check-cmd-exist` —— Shell 集成。
- `qwq-cli ask|repl|list|get|rename|delete|schema` —— 面向机器的文本客户端。
- `qwq-tui` —— 全屏终端界面。
- `qwq-voice` —— 语音前端。
- `qwq-gui` —— 桌面前端。
