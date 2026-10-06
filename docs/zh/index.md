# qwq

qwq 是一个本地优先的 AI 伴侣。单一 **服务端** 持有会话并响应多个前端：命令行助手
（带 Shell 集成，可建议命令，并在确认后执行）以及中文语音助手。未来还计划支持桌面
宠物等 GUI 前端。

- **服务端优先。** `qwq serve` 才是主程序；命令行与语音都是客户端。
- **Effect 原生。** 用 `Option` 而非 `undefined`，类型化错误，流式处理；没有命令式
  构造（`let`、循环、`try`/`catch`、`async`/`await`）。
- **双语文档。** 本站由 `docs/`（英文）与 `docs/zh/`（简体中文）构建。
- **Nix。** 基于 `flake-parts`，导出 `packages`、`overlays`、`nixosModules` 与
  `homeModules`。

接下来请阅读 [配置](configuration.md) 与 [使用](usage.md)。
