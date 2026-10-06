# qwq

[English](./README.md) · **简体中文**

> 本地优先的 AI 伴侣：一个服务端，多种前端——命令行助手与中文语音助手。

[![CI](https://github.com/LiAlH4qwq/qwq/actions/workflows/ci.yml/badge.svg)](https://github.com/LiAlH4qwq/qwq/actions/workflows/ci.yml)
[![Website](https://github.com/LiAlH4qwq/qwq/actions/workflows/pages.yml/badge.svg)](https://github.com/LiAlH4qwq/qwq/actions/workflows/pages.yml)

qwq 是一个 **服务端优先** 的 AI 伴侣：`qwq serve` 持有会话并通过 Effect RPC
（WebSocket）响应多个前端；命令行/Shell 集成与中文语音助手都是它的前端。整个程序使用
TypeScript 与 [Effect](https://effect.website/) 编写，没有 `let`、循环、`try`/`catch`、
`async`/`await` 或 `any`，并由 `pnpm lint` 中的 AST 检查器强制执行。

## 安装

```bash
nix build github:LiAlH4qwq/qwq     # ./result/bin/qwq
```

NixOS 模块：

```nix
{
  inputs.qwq.url = "github:LiAlH4qwq/qwq";
  imports = [ inputs.qwq.nixosModules.default ];

  services.qwq = {
    enable = true;
    settings = {
      api = { type = "openai"; url = "https://api.siliconflow.cn/v1/chat/completions"; model = "deepseek-ai/DeepSeek-V3"; keyEnv = "QWQ_API_KEY"; };
      server = { host = "127.0.0.1"; port = 8787; };
    };
    environmentFile = "/run/secrets/qwq.env";
  };
}
```

Home Manager 亦可（`homeModules.default`），并可启用语音前端（`voice.enable = true`）。

## 使用

```bash
qwq serve --config config.yaml
qwq-command ask FishShell 请问怎么查看系统内核信息呀？
qwq-command integrate-shell fish > ~/.config/fish/conf.d/qwq.fish
qwq-voice --config config.yaml
```

在仓库中，`pnpm start <server|cli|tui|voice|command|gui>` 可从源码运行任意组件。

## 文档

完整文档见 **<https://LiAlH4qwq.github.io/qwq/zh/>**
（[English](https://LiAlH4qwq.github.io/qwq/en/)）：

- [架构](https://LiAlH4qwq.github.io/qwq/zh/architecture.html)
- [配置](https://LiAlH4qwq.github.io/qwq/zh/configuration.html)
- [使用](https://LiAlH4qwq.github.io/qwq/zh/usage.html)
- [语音助手](https://LiAlH4qwq.github.io/qwq/zh/voice.html)
- [Nix](https://LiAlH4qwq.github.io/qwq/zh/nix.html)
- [开发](https://LiAlH4qwq.github.io/qwq/zh/development.html)

## 许可证

qwq 自身代码为 MIT。语音所用的 `sherpa-onnx` 与模型文件不随包分发，请自行按其条款提供。
