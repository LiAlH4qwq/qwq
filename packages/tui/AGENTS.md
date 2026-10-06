# packages/tui/AGENTS.md

Instructions specific to `packages/tui` (`qwq-tui`). Read
[`../../AGENTS.md`](../../AGENTS.md) first.

- `src/entries/tui.ts` – the entry point: loads config, provides
  `QwqRpcClient.layerSocket`, drives the reducer and the ink app.
- `src/client/tui.tsx` – the ink/React full-screen interface. It renders the
  **shared view model** (`@qwq/shared/client/view`, `.../theme`) so it stays in
  step with the GUI: the transcript, tool glyphs/tone, busy status, session
  subtitle and permission prompt all come from `@qwq/shared`.
- It is a **frontend**: it imports only `@qwq/shared/*`. The shared chat
  reducer/atoms/view model live in `@qwq/shared/client/*` and are reused by the
  GUI.
