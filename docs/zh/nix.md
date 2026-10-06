# Nix

qwq 是运行在 `nixpkgs/nixos-unstable` 上的
[flake-parts](https://flake.parts/) flake。它刻意不使用 `self`：自身输出通过
flake-parts 的 `config` 访问，仓库根目录通过 `root` 模块参数访问
（`_module.args.root = ./.`）。

## 输出

| 输出 | 含义 |
| ---- | ---- |
| `packages.qwq`、`packages.default` | 服务端（`qwq`），也是所有 Node 产物共享的同一次构建。 |
| `packages.qwq-cli` / `qwq-tui` / `qwq-voice` / `qwq-command` | 各含一个二进制，均派生自同一次 pnpm/rolldown 构建。 |
| `packages.qwq-kws` | 极薄的 Python 流式唤醒词 worker。 |
| `packages.qwq-gui` | Electron 桌面前端。 |
| `overlays.qwq`、`overlays.default` | 把以上全部加入 `pkgs`。 |
| `nixosModules.qwq`、`nixosModules.default` | NixOS 的 `services.qwq`。 |
| `homeModules.qwq`、`homeModules.default` | Home Manager 的 `services.qwq`。 |

## `services.qwq`

两个模块共用同一套选项（`nix/options.nix`）：

```nix
services.qwq = {
  enable = true;
  package = pkgs.qwq;          # 服务端二进制
  settings = { /* config.yaml */ };
  configFile = null;           # 用已有 YAML 代替 `settings`
  environmentFile = null;      # 用于 api.keyEnv 密钥

  server.enable = true;        # systemd 服务

  voice = {
    enable = true;             # systemd 用户服务（图形会话）
    package = pkgs.qwq-voice;
    kwsPackage = pkgs.qwq-kws; # Python 唤醒词 worker
    settings = { wakeWord.modelDir = "…"; asr.modelDir = "…"; };
    power = null;              # battery | balanced | performance
  };

  gui = {
    enable = true;             # 用户服务 + PATH + desktop 文件
    package = pkgs.qwq-gui;
  };

  cli.enable = true;           # 把 `qwq-cli` 加入 PATH
  tui.enable = true;           # 把 `qwq-tui` 加入 PATH
};
```

- **NixOS**：服务端是系统服务（`systemd.services.qwq`）；语音与 GUI 是挂到
  `graphical-session.target` 的用户服务。`cli`、`tui`、`gui` 进入
  `environment.systemPackages`，`gui` 还会安装 desktop 文件。
- **Home Manager**：全部为 `systemd.user.services.*` 用户服务，程序与 desktop 文件进入
  `home.packages`。

## 示例

```nix
# NixOS
{
  inputs.qwq.url = "github:LiAlH4qwq/qwq";
  imports = [ inputs.qwq.nixosModules.default ];

  services.qwq = {
    enable = true;
    settings = {
      api = { type = "openai"; url = "…"; model = "…"; keyEnv = "QWQ_API_KEY"; };
      server = { host = "127.0.0.1"; port = 8787; };
    };
    environmentFile = "/run/secrets/qwq.env";
    cli.enable = true;
    tui.enable = true;
  };
}
```

```nix
# Home Manager
{
  imports = [ inputs.qwq.homeModules.default ];
  services.qwq = {
    enable = true;
    voice.enable = true;
    settings = { api = { type = "openai"; url = "…"; model = "…"; keyEnv = "QWQ_API_KEY"; }; };
    voice.settings = {
      wakeWord = { modelDir = "…"; keywordsFile = "…"; };
      asr = { modelDir = "…"; };
    };
  };
}
```

## 构建

```bash
nix build .#qwq       # ./result/bin/qwq
nix build .#qwq-gui   # ./result/bin/qwq-gui
nix build .#website   # ./result/{index.html,en/,zh/}
nix flake check
```

pnpm 依赖哈希位于 `nix/package.nix`（以及 `nix/gui.nix`）；当 `pnpm-lock.yaml` 或 pnpm
主版本变化时请刷新。
