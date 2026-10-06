# The `qwq-cli` contract

`qwq-cli` is the machine-facing text client. It follows the same discipline as
[`tsnix`](https://github.com/LiAlH4qwq/tsnix): **stdout is the payload and
nothing else**, stderr carries diagnostics, and the exit codes are stable.

| Stream | Contents |
| --- | --- |
| stdout | the result only (JSON by default when not a TTY) |
| stderr | diagnostics: text on a TTY, JSON otherwise (`--error-format`) |
| exit `0` | success |
| exit `1` | runtime error |
| exit `2` | usage error |

`qwq-cli schema --pretty` prints the whole contract as JSON.

## Commands

```bash
qwq-cli ask [question...]      # one-shot; reads stdin when empty or "-"
qwq-cli repl                   # human REPL
qwq-cli repl --agent           # machine REPL (ENQ readiness)
qwq-cli repl --protocol json   # machine REPL (ENQ + JSON lines)
qwq-cli list                   # sessions
qwq-cli get <id>               # a whole session (history)
qwq-cli rename <id> <title>
qwq-cli delete <id>
qwq-cli schema
```

`--session <id>` resumes a session. `--format text|json|raw` selects the output
shape (JSON defaults to `{ "sessionId", "answer" }` for `ask`, and the session
object or list for the session commands).

## Permissions

Reviewed commands (see [Configuration](configuration.md)) need approval. The
non-interactive client answers permission prompts by **denying** them unless
`--permission auto` is given, so a scripted run is safe by default. Tool
progress is written to stderr and silenced with `-q`.

## REPL protocols

- `interactive` (default): a line editor with `:help`, `:new`, `:sessions`,
  `:session <id>` and `:quit`.
- `enq` (`--agent`): before every read one ENQ byte (`0x05`) is written and
  flushed; each input line is a question and each answer is one JSON line.
- `json`: same ENQ readiness, but each input line is a JSON request
  (`{"question": "…"}`) and each answer is one JSON line `{"ok": true, …}`.
