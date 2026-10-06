# packages/shared/AGENTS.md

Instructions specific to `packages/shared`. Read [`../../AGENTS.md`](../../AGENTS.md)
first: the functional rules, the hard AST rules and the Effect rules apply here.

`@qwq/shared` is the only internal package a frontend may import. It must never
import `@qwq/server` (or any other workspace package).

## Layout

- `src/domain/` – pure domain types: `message.ts` (Schema), `session.ts` (session
  model, origins, title/compaction helpers), `markers.ts` (the `QWQ …` markers),
  `env.ts`.
- `src/config/` – configuration `Schema` (`schema.ts`) and loading/validation
  (`load.ts`).
- `src/errors.ts` – every failure, as a `Data.TaggedError`.
- `src/version.ts` – the single-source version, read from the root `package.json`.
- `src/paths.ts` – default config/memory paths (relative to the working directory).
- `src/parse.ts` – `ParseResult` → human-readable issues.
- `src/diagnostics.ts` – usage text and friendly error formatting
  (`formatDiagnostic`).
- `src/server/rpc.ts` – the Effect RPC contract (`QwqRpcs`, `AskInput`,
  `QwqEvent`).
- `src/server/client.ts` – `QwqRpcClient`, the RPC client service. It is a
  `Context.Tag` whose `layerSocket` owns the WebSocket for the lifetime of the
  layer; never build a client inside a function that returns a `Stream`
  (that was the `subscribeRemote` bug).
- `src/client/state.ts` – the chat timeline reducer, shared by TUI and GUI.
- `src/client/view.ts` – the UI-agnostic presentation model (transcript parts,
  tool glyph/tone, busy status, session subtitle, permission prompt), shared by
  the ink TUI and the Electron GUI.
- `src/client/theme.ts` – semantic tone → ink color / Radix color mappings.
- `src/client/atoms.ts` – the shared effect-atom atoms.
- `src/client/cli-util.ts` – argv/config helpers.

Frontends reach these modules through the `@qwq/shared/*` subpath exports
(`"./*": "./src/*.ts"`); tests may as well.
