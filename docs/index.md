# qwq

qwq is a local-first AI companion. A single server owns conversations and
answers requests from multiple frontends: a command-line assistant (with shell
integration that can suggest — and, on confirmation, run — commands) and a
Chinese voice assistant. A future desktop-pet GUI is expected to be another
frontend.

- **Server first.** `qwq serve` is the program; CLI and voice are clients.
- **Effect-native.** `Option` over `undefined`, typed errors, streams; no
  imperative constructs (`let`, loops, `try`/`catch`, `async`/`await`).
- **Bilingual docs.** This site is built from `docs/` (English) and `docs/zh/`
  (简体中文).
- **Nix.** `flake-parts` flake with `packages`, `overlays`, `nixosModules` and
  `homeModules`.

Ready? Start with [Configuration](configuration.md) and [Usage](usage.md).
