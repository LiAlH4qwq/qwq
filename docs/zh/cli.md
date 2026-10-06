# `qwq-cli` 契约

`qwq-cli` 是面向机器的文本客户端，遵循与
[`tsnix`](https://github.com/LiAlH4qwq/tsnix) 相同的纪律：**stdout 只输出载荷**，
stderr 输出诊断，退出码稳定。

| 流 | 内容 |
| --- | --- |
| stdout | 仅结果（非 TTY 时默认 JSON） |
| stderr | 诊断：TTY 为文本，否则 JSON（可用 `--error-format`） |
| 退出码 `0` | 成功 |
| 退出码 `1` | 运行错误 |
| 退出码 `2` | 用法错误 |

`qwq-cli schema --pretty` 会打印完整契约的 JSON。

## 命令

```bash
qwq-cli ask [question...]      # 一次性提问；无参数或 "-" 时读 stdin
qwq-cli repl                   # 人类 REPL
qwq-cli repl --agent           # 机器 REPL（ENQ 就绪）
qwq-cli repl --protocol json   # 机器 REPL（ENQ + JSON 行）
qwq-cli list                   # 会话列表
qwq-cli get <id>               # 输出整个会话（含历史）
qwq-cli rename <id> <title>
qwq-cli delete <id>
qwq-cli schema
```

`--session <id>` 继续会话。`--format text|json|raw` 选择输出形态（`ask` 的 JSON
默认为 `{ "sessionId", "answer" }`，会话命令则输出会话对象或列表）。

## 权限

需复核的命令（见 [配置](configuration.md)）需要确认。非交互式客户端在未指定
`--permission auto` 时对权限询问一律**拒绝**，因此脚本默认安全。工具进度写入
stderr，可用 `-q` 静默。

## REPL 协议

- `interactive`（默认）：带 `:help`、`:new`、`:sessions`、`:session <id>`、
  `:quit` 的行编辑器。
- `enq`（`--agent`）：每次读取前写入并刷新一个 ENQ 字节（`0x05`）；每行输入是
  一个问题，每行输出是一个 JSON 响应。
- `json`：同样先 ENQ，但每行输入是 JSON 请求（`{"question": "…"}`），每行输出是
  JSON 响应 `{"ok": true, …}`。
