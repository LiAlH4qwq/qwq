# AGENTS.md

Instructions for agents (and humans) working on **qwq**, a local-first AI
companion: an [Effect](https://effect.website/) server with a CLI and a Chinese
voice frontend, all written in TypeScript and built with Nix.

This file is the root of a small set of cross-referenced AGENTS files:

- [`packages/shared/AGENTS.md`](./packages/shared/AGENTS.md) – shared domain, config, RPC and client.
- [`packages/server/AGENTS.md`](./packages/server/AGENTS.md) – agent loop, LLM, memory, server and voice backend.
- [`packages/cli/AGENTS.md`](./packages/cli/AGENTS.md) – `qwq-cli`.
- [`packages/command/AGENTS.md`](./packages/command/AGENTS.md) – `qwq-command`.
- [`packages/tui/AGENTS.md`](./packages/tui/AGENTS.md) – `qwq-tui`.
- [`packages/voice/AGENTS.md`](./packages/voice/AGENTS.md) – `qwq-voice`.
- [`nix/AGENTS.md`](./nix/AGENTS.md) – the flake, modules and `.github`.
- [`docs/AGENTS.md`](./docs/AGENTS.md) – the bilingual documentation.
- [`packages/gui/AGENTS.md`](./packages/gui/AGENTS.md) – the Electron desktop frontend.

## Hardware acceleration & power (done)

The power/performance segment tracked in [`TODO.md`](./TODO.md) is implemented:
`voice.accel` resolves a provider (pure resolver in
`packages/server/src/voice/accel.ts`), `withPower` applies it only in the
`performance` profile, the AC/battery source is parsed from sysfs and forces the
`battery` profile on battery, and `dev/measure.nu` reports CPU/RAPL/battery.
Keep the wake word on CPU. See [`docs/performance.md`](./docs/performance.md).

## Monorepo layout

qwq is a pnpm workspace of **seven packages** under `packages/`:

- `packages/shared` – domain types, config schema/loader, errors, version, paths,
  parse/diagnostics, the RPC contract (`server/rpc.ts`), the shared chat
  state/atoms and the `QwqRpcClient` service. The only internal package every
  frontend may import.
- `packages/server` – agent loop, LLM client, memory store, server
  implementation and the voice backend/state machine.
- `packages/command` – `qwq-command` (shell integration).
- `packages/cli` – `qwq-cli`.
- `packages/tui` – `qwq-tui` (ink).
- `packages/voice` – `qwq-voice`.
- `packages/gui` – the Electron desktop frontend (React + Radix UI Themes,
  sharing the `@qwq/shared/client` view model with the TUI). It is **not**
  exempt: the AST/ESLint checker covers its `.ts`/`.tsx`, and it is typechecked
  with `pnpm typecheck:gui`.

Keep the dependency direction one-way: frontends → `shared`, `server` →
`shared`. `packages/voice` is the one exception: the voice state machine it
drives lives in `packages/server`. Never reach into a sibling package's `src/`
files; go through its `package.json` entry points (`workspace:*`).

## Commands

```bash
pnpm install
pnpm typecheck   # tsc --noEmit (all packages) + gui
pnpm lint        # eslint . && tsx scripts/check-ast.ts && tsx scripts/check-shell.ts
pnpm check:ast   # AST-level functional-rule enforcement only
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + shell + test
pnpm build       # rolldown bundle per package (packages/*/dist/*.js)
pnpm build:gui   # bundle the Electron GUI (+ dist/themes.css)
pnpm dev         # run the server from source (tsx packages/server/src/entries/qwq.ts serve)
pnpm start <c>   # run a component from source: server|cli|tui|voice|command|gui
nix build .#qwq  # the packaged server
nix flake check  # checks, incl. github-up-to-date
nix run .#write-github -- . --stage  # regenerate .github/
```

## Functional programming (strict)

qwq is strictly functional and Effect-based. Pure functions, immutable data,
total functions, typed errors, effect composition, and referential
transparency. `pnpm lint` enforces most of this at the AST level (see the hard
rules below); when in doubt, prefer the pure, declarative, effect-based
formulation.

### Monads over weak values

The error channel `E` must never be `unknown` or `any`. Model absence with
`Option`, alternatives with `Either`, and fallibility with `Effect` – do **not**
use `undefined`, optional chaining, nullish coalescing, or short-circuit
fallbacks. The AST checker forbids:

- the `undefined` literal (use `Option` / `Either`);
- optional chaining `x?.y` (use `Option`);
- nullish coalescing `x ?? y` (use `Option` / `Either`);
- short-circuit value fallbacks `x && y` / `x || y` when they produce a
  non-boolean value (use `Option` / `Either` / `Effect`).

`&&` and `||` remain valid as *pure boolean* operators, in a boolean context or
when both operands are booleans – exactly as in Haskell. What is forbidden is
reusing a boolean expression as a value in a way that relies on JavaScript's
strict-evaluation semantics (the classic `cond && value` / `value || default`
idiom).

## Hard rules (enforced by `pnpm lint`)

`scripts/check-ast.ts` parses the AST of `.ts` and `.tsx` files under
`packages/` (including `packages/gui`), `test/` and `scripts/` with the
TypeScript compiler API and fails on any of:

- `var`, `let`, `using`, `await using` declarations (use `const`)
- `while`, `do`, `for`, `for-in`, `for-of`, labels, `break`, `continue`
- `try` / `catch`, and `throw`
- `async` / `await`, and `Promise.then` / `Promise.finally`
- `++` / `--`, `delete`, non-null assertions (`!`)
- `Array.prototype.forEach` and mutating array methods
  (`push`…`copyWithin`)
- `Object.assign` / `defineProperty` / `setPrototypeOf`, `Reflect.*` mutations
- assignment to object or array members (`x.y = …`, `x[i] = …`)
- the `any` keyword and `as unknown as` double assertions
- the `undefined` literal, optional chaining, nullish coalescing, and
  non-boolean short-circuit fallbacks (see **Monads over weak values**)

ESLint mirrors these with `no-restricted-syntax` and
`eslint-plugin-functional`.

Sessions are stored as plain JSON (one file per session), so there is no
vendored codec; keep the domain pure and convert at the file boundary.

## Shells and scripts (hard rule)

**bash is banned.** Do not add `*.sh`, `*.bash` or `*.bats` files and do not use
a bash/POSIX shebang. Authored logic is **TypeScript** (the app) or **Nushell**
(dev/orchestration scripts and generated systemd/config tooling); never shell.
`pnpm lint` runs `scripts/check-shell.ts`, which walks the tree and fails on any
shell file or bash/shebang outside the allowlist (empty here).

This bans *authored repository scripts*, not the product's runtime behaviour: the
`bash` **tool** (`packages/server/src/agent/tools.ts`) deliberately runs
user-requested commands through a configured shell as a feature.

## Effect rules

- Convert non-Effect monads to `Effect` at the boundary, then continue in
  `Effect` ("convert-then-op").
- Never build pipelines with `async` / `await` / `Promise.then`.
- Do not emulate `try`/`catch` with a broad `Effect.catchAll`; name the tags you
  recover from with `Effect.catchTag` / `catchTags` / `match`.
- Model every failure with a specific `Data.TaggedError`.
- Format `Schema` parse failures with `ParseResult.ArrayFormatter`.
- Use `Stream` + `PubSub` for multi-client state; sessions are held in a
  `SynchronizedRef`.

### Testability (hard rule)

Effect `Layer` exists so behaviour is testable by *providing layers*, not by
writing mocks. A helper that builds and hides a scoped `Layer` inside its own
body is defective: its resource lifetime is wrong and it can only be exercised
by standing up the real transport. (This was the `subscribeRemote` bug: the
WebSocket scope closed before the event stream was ever pulled.) Inject
dependencies through `Context.Tag` + `Layer` and let the caller or a test supply
them.

- **No hand-written domain mocks.** Never stub an app service with
  `Something.of({ ... })`. Provide the framework test layers instead:
  `@effect/rpc`'s `RpcTest.makeClient` for the RPC boundary, `@effect/vitest`'s
  `TestContext` / `TestClock`, in-memory platform stubs, or the real `Layer`
  backed by an in-memory implementation.
- Scoped resources (sockets, workers, file handles) live in the `Layer` that
  owns the service – never inside a function that returns a `Stream` or `Effect`.
- If a function is hard to test without a mock, rewrite it until its dependencies
  are explicit in `R`/the context. Do not add the mock.

## Git workflow

Work on a branch; land on `main` as one commit.

- Never commit feature work directly to `main`. Create a branch, commit there,
  and run `pnpm check` before landing.
- When the work is ready, **squash** the whole branch into a single commit on
  `main` instead of fast-forwarding the branch's WIP history:

  ```bash
  git switch main
  git pull --ff-only              # keep main current
  git merge --squash <branch>     # stage the branch as one change
  git commit                      # one commit describing the whole change
  git branch -D <branch>          # optional: drop the squashed branch
  ```

- `main` stays linear: one logical change per commit, no matter how many WIP
  commits the branch needed.
- Do not force-push `main` and do not rewrite shared history.

## Versioning

The **only** hand-edited version is `"version"` in the root `package.json`.
Everything else derives from it: `packages/shared/src/version.ts` and the Nix
derivation (`nix/package.nix`). qwq is pre-1.0 (`0.y.z`).

**Do not bump the version on an unmerged branch.** While the work lives on a
branch other than the main branch, leave `"version"` exactly as it is on main;
the bump is applied when the work is merged. A change therefore carries no new
version until it lands on main, and the bump is derived from main's version plus
the highest-impact change it introduces.

- `patch` (`0.y.Z+1`): fixes, docs, internal refactors – no observable change.
- `minor` (`0.Y+1.0`): a new feature **or** any observable/breaking change to a
  public surface (CLI flags, config schema, JSON-RPC methods, HTTP/socket
  surface).
- `1.0.0`: only when those public surfaces are declared stable.

No pre-release suffixes.

## Documentation (hard rule)

The README stays short and bilingual (`README.md` ⇄ `README.CN.md`); long-form
documentation lives in `docs/` (English) and `docs/zh/` (简体中文), built as an
mdBook site by [`nix/website.nix`](./nix/website.nix) and deployed to GitHub
Pages by the generated `pages` workflow. When you add a page, add it to **both**
`SUMMARY.md` files and translate it.

`.github/` is generated from Nix and must never be hand-edited; see
[`nix/AGENTS.md`](./nix/AGENTS.md).
