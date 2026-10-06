# Usage

`qwq` is a server; every frontend is a separate program that talks to it over
RPC.

## Run the server

```bash
qwq serve --config config.yaml
```

## Non-interactive CLI (`qwq-cli`)

`qwq-cli` is machine-friendly: **stdout is the payload and nothing else**,
stderr carries diagnostics, and the exit codes are `0` success / `1` error /
`2` usage. It never loads the terminal UI dependencies.

```bash
qwq-cli ask "怎么查看内核版本？"          # one-shot answer
echo "解释这段报错" | qwq-cli ask -        # read the question from stdin
qwq-cli list --format json                # sessions as JSON
qwq-cli get <id>                          # a whole session (history)
qwq-cli rename <id> "新标题"
qwq-cli delete <id>
qwq-cli schema --pretty                   # the machine-readable contract
```

`--session <id>` continues an existing session; `--format json` (the default
when stdout is not a TTY) emits a JSON object with `sessionId` and `answer`;
`--permission auto` allows reviewed commands automatically, otherwise the CLI
answers permission prompts by denying them (machine-safe). Tool progress is
written to stderr; `-q` silences it.

`qwq-cli repl` is a human REPL (`:help`, `:new`, `:sessions`, `:session <id>`,
`:quit`). For agents, `qwq-cli repl --agent` speaks an ENQ-readiness protocol
and prints one JSON response per line; `qwq-cli repl --protocol json` reads
newline-delimited JSON requests (`{"question": "…"}`) instead.

## Terminal UI (`qwq-tui`)

```bash
qwq-tui --config config.yaml          # full-screen TUI (ink/React)
qwq-tui --session <id>
```

The TUI renders a transcript with tool calls inline (running/done), loads the
session history on start, offers a session picker (`Ctrl+S`), and prompts for
[y/N] confirmation when a risky command needs approval. Every frontend sees the
same sessions, including those started by voice.

## One-shot / shell integration

```bash
qwq-command ask FishShell 请问怎么查看系统内核信息呀？
qwq-command integrate-shell fish > ~/.config/fish/conf.d/qwq.fish
```

The command client loads the configuration for the server address and the
allowed environment variables, sends the question over RPC, and prints the
answer. The generated shell function is named `qwq` by default; when the
assistant suggests commands, it asks for confirmation before running them
(`check-cmd-exist`, `extract-text`, `extract-cmd` run locally).

## Voice

```bash
qwq-voice --config config.yaml
```

See [Voice assistant](voice.md).

## Desktop GUI

`qwq-gui` is an Electron frontend. It registers a system tray, shows a session
list beside the chat window, and pops up a desktop notification window (with
countdown, pause/close) for assistant replies. By default it only pops up for
**voice** sessions; set `gui.popup` to `all` or `none` to change this. The
window defaults to a light theme. `qwq-gui --help` lists its options
(`--server`, `--popup-ms`, `--popup`, `--theme`, `--no-tray`, `--hidden`).

## Programs

- `qwq serve` – the server.
- `qwq-command ask|integrate-shell|extract-*|check-cmd-exist` – shell integration.
- `qwq-cli ask|repl|list|get|rename|delete|schema` – machine-facing text client.
- `qwq-tui` – full-screen terminal UI.
- `qwq-voice` – voice frontend.
- `qwq-gui` – desktop frontend.
