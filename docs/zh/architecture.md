# 架构

qwq 分为 **服务端**（主程序）与 **前端**。

## 服务端

`qwq serve` 加载 `config.yaml`，在 `server.host` / `server.port` 上通过
WebSocket 提供 [Effect RPC](https://effect.website/) 接口：

- `Ping` → `{ version }`。
- `Ask({ sessionId?, origin, shell, question, envVars })` → `{ sessionId, answer }`。
- `ListSessions`、`GetSession`、`RenameSession`、`DeleteSession`。
- `Subscribe` —— **所有** 会话的 `Message` / `Delta` / `Tool` / `SessionUpserted` /
  `SessionDeleted` 事件流。

会话保存在一个 `SynchronizedRef<HashMap<…>>` 中，并以每会话一个 JSON 文件持久化到
`sessions/`（可配置）。省略 `sessionId` 时由服务端创建（对语音 / 命令补全则在
`reuseMinutes` 内复用上一个会话）。前端在每次请求中携带用户的环境变量与 Shell，因此服务端
无需读取客户端环境。

## 前端

- **机器 CLI**（`qwq-cli`）为 tsnix 风格客户端：`ask`、`repl`（人类与 ENQ/JSON 机器协议）、
  会话管理与 `schema`。stdout 只输出载荷，stderr 输出诊断。
- **终端界面**（`qwq-tui`）将工具调用与文本内联展示，加载会话历史并响应权限询问。
- **命令行 / Shell 集成**（`qwq-command ask`、`qwq-command integrate-shell`）在本地解析回答
  （`check-cmd-exist`、`extract-text`、`extract-cmd`），由 *Shell* 在用户确认后执行
  建议的命令。
- **语音**（`qwq-voice`）采集音频，运行本地唤醒词模型与更大的语音识别模型，再把文本
  通过同一个 `Ask` RPC 发送。它在工具调用前后播报，并以语音完成授权 / 取消。
- **图形界面**（`packages/gui`，Electron）订阅服务端的全局事件流，用 Radix UI Themes 渲染
  与终端界面相同的 UI 无关视图模型（`@qwq/shared/client/view`）。默认仅对活跃的语音会话
  弹出回复窗口（`gui.popup`）。

由于所有状态与逻辑都在服务端，新增 GUI（桌宠）只需再写一个 RPC 客户端。

## 提示词

系统提示词由模块组合而成：共享的 `common` 部分加上能力模块——`command` 用于命令行 /
Shell 集成，`voice` 用于语音助手。人格预设（`default`、`kawaii`）提供措辞，且每个模块都
可在 `prompts` 中覆盖。因此指令建议器与语音助手从不共用同一份提示词。

## 智能体与工具

所有前端的问题都经由服务端同一条 **智能体循环**。启用 `tools` 后，助手可以调用
`bash`、`read`、`write`、`edit`、`list`、`glob`、`grep`、`webfetch`；支持原生工具调用的
模型会使用工具调用，否则回退到文本命令块。工具活动与流式回复增量会通过 `Subscribe`
发布，GUI 可据此展示、语音前端可据此提示；`result` 阶段的 `Tool` 事件带有 `status`
（`ok`/`denied`/`error`），前端可据此说明调用为何结束。「需复核」的命令会发出
`Permission` 事件，由前端确认（`RespondPermission`），超时按拒绝处理；语音前端会朗读请求
并识别口头的允许 / 拒绝。危险命令先由可配置黑名单硬拒绝。命令行 / Shell 集成仍会在执行
最终命令前请求确认。

## 函数式内核

纯数据与纯函数占主导：配置 `Schema`、会话摘要 / 压缩辅助函数、提示词构造、回答解析、PCM
辅助函数。Effect 仅在边界使用（文件、网络、进程）。强制规则见 [开发](development.md)。
