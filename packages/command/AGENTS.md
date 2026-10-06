# packages/command/AGENTS.md

Instructions specific to `packages/command` (`qwq-command`). Read
[`../../AGENTS.md`](../../AGENTS.md) first.

- `src/entries/command.ts` – the shell-integration client (`ask`,
  `integrate-shell`, command/text extraction).
- It is a **frontend**: it imports only `@qwq/shared/*` and talks to the server
  through `QwqRpcClient`.
