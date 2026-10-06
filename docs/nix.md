# Nix

qwq is a [flake-parts](https://flake.parts/) flake on
`nixpkgs/nixos-unstable`. It deliberately does not use `self`: own outputs are
reached through flake-parts' `config`, and the repository root through the
`root` module argument (`_module.args.root = ./.`).

## Outputs

| Output | Meaning |
| ------ | ------- |
| `packages.qwq`, `packages.default` | The server (`qwq`), and the shared build every Node bundle comes from. |
| `packages.qwq-cli` / `qwq-tui` / `qwq-voice` / `qwq-command` | One binary each, derived from the same pnpm/rolldown build. |
| `packages.qwq-kws` | The thin Python streaming keyword-spotter worker. |
| `packages.qwq-gui` | The Electron desktop frontend. |
| `overlays.qwq`, `overlays.default` | Adds all of the above to `pkgs`. |
| `nixosModules.qwq`, `nixosModules.default` | `services.qwq` for NixOS. |
| `homeModules.qwq`, `homeModules.default` | `services.qwq` for Home Manager. |

## `services.qwq`

Both modules share the same options (`nix/options.nix`):

```nix
services.qwq = {
  enable = true;
  package = pkgs.qwq;          # server binary
  settings = { /* config.yaml */ };
  configFile = null;           # use an existing YAML instead of `settings`
  environmentFile = null;      # for api.keyEnv secrets

  server.enable = true;        # systemd service

  voice = {
    enable = true;             # systemd user service (graphical session)
    package = pkgs.qwq-voice;
    kwsPackage = pkgs.qwq-kws; # the Python wake-word worker
    settings = { wakeWord.modelDir = "…"; asr.modelDir = "…"; };
    power = null;              # battery | balanced | performance
  };

  gui = {
    enable = true;             # user service + PATH + desktop entry
    package = pkgs.qwq-gui;
  };

  cli.enable = true;           # add `qwq-cli` to PATH
  tui.enable = true;           # add `qwq-tui` to PATH
};
```

- On **NixOS**, the server is a system service (`systemd.services.qwq`); voice
  and GUI are user services attached to `graphical-session.target`. `cli`, `tui`
  and `gui` land in `environment.systemPackages`, and `gui` also installs a
  desktop entry.
- On **Home Manager**, everything is a user service
  (`systemd.user.services.*`), and the programs/desktop entry go to
  `home.packages`.

## Examples

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

## Building

```bash
nix build .#qwq       # ./result/bin/qwq
nix build .#qwq-gui   # ./result/bin/qwq-gui
nix build .#website   # ./result/{index.html,en/,zh/}
nix flake check
```

The pnpm dependency hash lives in `nix/package.nix` (and `nix/gui.nix`); refresh
it when `pnpm-lock.yaml` or the pnpm major changes.
