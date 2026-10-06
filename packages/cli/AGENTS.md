# packages/cli/AGENTS.md

Instructions specific to `packages/cli` (`qwq-cli`). Read
[`../../AGENTS.md`](../../AGENTS.md) first.

- `src/entries/cli.ts` – the machine-facing non-interactive client plus the REPL.
- `src/client/cli-schema.ts` – the `qwq-cli schema` contract.
- It is a **frontend**: it imports only `@qwq/shared/*` and talks to the server
  through `QwqRpcClient`. The client layer is provided once at the program edge;
  command effects take `QwqRpcClient` from context (`yield* QwqRpcClient`).
