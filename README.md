# qwq

**English** · [简体中文](./README.CN.md)

> A local-first AI companion: one server, many frontends — a command-line
> assistant and a Chinese voice assistant.

[![CI](https://github.com/LiAlH4qwq/qwq/actions/workflows/ci.yml/badge.svg)](https://github.com/LiAlH4qwq/qwq/actions/workflows/ci.yml)
[![Website](https://github.com/LiAlH4qwq/qwq/actions/workflows/pages.yml/badge.svg)](https://github.com/LiAlH4qwq/qwq/actions/workflows/pages.yml)

qwq is a **server-first** AI companion: `qwq serve` owns conversations and
answers multiple frontends over Effect RPC (WebSocket). The CLI/shell
integration and the Chinese voice assistant are both frontends. The whole
program is TypeScript on [Effect](https://effect.website/) with no `let`,
loops, `try`/`catch`, `async`/`await` or `any`, enforced by an AST checker in
`pnpm lint`.

## Install

```bash
nix build github:LiAlH4qwq/qwq     # ./result/bin/qwq
```

NixOS module:

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

There is a Home Manager module too (`homeModules.default`), which can also run
the voice frontend (`voice.enable = true`).

## Usage

```bash
qwq serve --config config.yaml
qwq-command ask FishShell 请问怎么查看系统内核信息呀？
qwq-command integrate-shell fish > ~/.config/fish/conf.d/qwq.fish
qwq-voice --config config.yaml
```

From a checkout, `pnpm start <server|cli|tui|voice|command|gui>` runs any
component from source.

## Documentation

Full documentation is at **<https://LiAlH4qwq.github.io/qwq/en/>**
([简体中文](https://LiAlH4qwq.github.io/qwq/zh/)):

- [Architecture](https://LiAlH4qwq.github.io/qwq/en/architecture.html)
- [Configuration](https://LiAlH4qwq.github.io/qwq/en/configuration.html)
- [Usage](https://LiAlH4qwq.github.io/qwq/en/usage.html)
- [Voice assistant](https://LiAlH4qwq.github.io/qwq/en/voice.html)
- [Nix](https://LiAlH4qwq.github.io/qwq/en/nix.html)
- [Development](https://LiAlH4qwq.github.io/qwq/en/development.html)

## License

qwq's own code is MIT. The `sherpa-onnx` runtime and models are not bundled;
provide them separately under their own terms.
