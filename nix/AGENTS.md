# nix/AGENTS.md

Instructions specific to `nix/`, `dev/` and `flake.nix`. Read
[`../AGENTS.md`](../AGENTS.md) first.

## The flake

- `flake.nix` uses **flake-parts** on `nixpkgs/nixos-unstable`. It deliberately
  does **not** use `self`: own outputs are reached through the flake-parts
  `config` argument, and the repository root through the `root` module argument
  (`_module.args.root = ./.`).
- One `pnpm` + `rolldown` build (`nix/package.nix`) produces every Node bundle;
  `packages.qwq` is the server and `packages.qwq-cli` / `qwq-tui` / `qwq-voice` /
  `qwq-command` are per-binary derivations that symlink one wrapper out of it
  (defined inline in `flake.nix`), so the pnpm store is fetched once.
  `packages.qwq-kws` is the thin Python keyword worker (`nix/python.nix`) and
  `packages.qwq-gui` the Electron frontend (`nix/gui.nix`). `overlays.qwq` (and
  `default`) add all of them to `pkgs`; the NixOS and Home Manager modules are
  exported as `nixosModules` / `homeModules`.
- `nix/package.nix` and `nix/gui.nix` share the same pnpm store, so they carry
  the same `fetchPnpmDeps` hash. The store format changes between pnpm majors:
  refresh by setting the hash to `lib.fakeHash`, running `nix build .#qwq` on a
  networked host, and copying the `got:` hash (do the same for `nix/gui.nix`).
- The development tooling (workflow generation, git hooks, the website) lives in
  the `dev` partition (`dev/flake.nix`), so it never reaches a consumer's lock
  file.

## The modules

- `nix/options.nix` defines the shared `services.qwq` options:
  `server.enable` (system service), `voice` and `gui` (graphical-session user
  units), and `cli` / `tui` (programs added to PATH). `gui.enable` also installs
  a desktop entry.
- `nix/settings.nix` derives the rendered config path, the server URL and the
  GUI environment from `services.qwq`; both modules use it.
- `nix/module.nix` (NixOS) uses `systemd.services.qwq` for the server and
  `systemd.user.services.qwq-voice` / `qwq-gui` for the frontends, plus
  `environment.systemPackages`. `nix/home-module.nix` is the Home Manager
  equivalent (`systemd.user.services.*` + `home.packages`).

## `.github` is generated

- `nix/github.nix` declares the workflows with `github-actions-nix` and renders
  `dependabot.yml` with `yq`. `nix/hooks.nix` runs `write-github`, `actionlint`
  and `nixfmt` as git hooks.
- A **Nushell** app copies the generated files into `.github/`:
  `nix run .#write-github -- . --stage` regenerates and stages them;
  `nix run .#check-github -- .` and `nix flake check` fail when they are stale.
- Never edit `.github/**` by hand.
