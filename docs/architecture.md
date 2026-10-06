# Architecture

qwq is split into a **server** (the main program) and **frontends**.

## Server

`qwq serve` loads `config.yaml` and serves an [Effect
RPC](https://effect.website/) API over a WebSocket on `server.host` /
`server.port`. The API is intentionally small:

- `Ping` → `{ version }`.
- `Ask({ sessionId?, origin, shell, question, envVars })` → `{ sessionId, answer }`.
- `ListSessions`, `GetSession`, `RenameSession`, `DeleteSession`.
- `Subscribe` — a stream of `Message` / `Delta` / `Tool` / `SessionUpserted` /
  `SessionDeleted` events for **all** sessions.

Sessions live in a `SynchronizedRef<HashMap<…>>` and are persisted one JSON file
per session under `sessions/` (configurable). Omit `sessionId` and the server
creates one (or, for voice/command, reuses the previous one within
`reuseMinutes`). Frontends send the user's environment variables and shell with
each request, so the server never reads a client's environment itself.

## Frontends

- **Machine CLI** (`qwq-cli`) is a tsnix-style client: `ask`, `repl` (human and
  ENQ/JSON agent protocols), session management and `schema`. stdout is the
  payload, stderr is diagnostics.
- **TUI** (`qwq-tui`) renders the transcript with tool calls inline, loads the
  session history and answers permission prompts.
- **CLI / shell integration** (`qwq-command ask`, `qwq-command integrate-shell`) parses the
  assistant's answer locally (`check-cmd-exist`, `extract-text`,
  `extract-cmd`) and lets the *shell* run suggested commands after confirmation.
- **Voice** (`qwq-voice`) captures audio, runs a local wake-word model and a
  larger speech recognizer, then sends the text through the same `Ask` RPC. It
  announces tool calls before/after they run and answers permission prompts by
  voice.
- **GUI** (`packages/gui`, Electron) subscribes to the server's global event
  stream and renders the same UI-agnostic view model as the TUI
  (`@qwq/shared/client/view`) through Radix UI Themes. It pops up the reply
  window only for active voice sessions by default (`gui.popup`).

Because all state and logic live in the server, adding a GUI (desktop pet) only
means writing another RPC client.

## Prompts

System prompts are composed from modules: a shared `common` part plus a
capability module — `command` for the CLI/shell integration, `voice` for the
voice assistant. A persona preset (`default`, `kawaii`) provides the wording,
and each module can be overridden in `prompts`. The command suggester and the
voice assistant therefore never share a prompt.

## Agent and tools

Every frontend sends its question through the same **agent loop** on the server.
When `tools` are enabled the assistant can call `bash`, `read`, `write`, `edit`,
`list`, `glob`, `grep` and `webfetch`; models with native tool calling use it,
others fall back to the text command block. Tool activity and streamed reply
deltas are published on `Subscribe`, so the GUI can display them and the voice
frontend can announce them; the `result` `Tool` event carries a `status`
(`ok`/`denied`/`error`) so frontends can say *why* a call ended. Commands that
need review publish a `Permission` event and wait for `RespondPermission`
(denying on timeout); the voice frontend speaks the request and interprets a
spoken allow/deny. Dangerous commands are rejected by a configurable blacklist.
The CLI/shell integration still asks for confirmation before running the final
command.

## Functional core

Pure data and pure functions dominate: configuration `Schema`, session
summaries/compaction helpers, prompt building, answer parsing, and PCM helpers.
Effects are only used at the boundaries (files, network, processes). See
[Development](development.md) for the enforced rules.
