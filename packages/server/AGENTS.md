# packages/server/AGENTS.md

Instructions specific to `packages/server`. Read [`../../AGENTS.md`](../../AGENTS.md)
first: the functional rules, the hard AST rules and the Effect rules apply here.

`@qwq/server` is the agent program and the voice backend. It may import
`@qwq/shared` and nothing else from the workspace.

## Layout

- `src/entries/qwq.ts` – the `qwq` server binary.
- `src/agent/` – the agent loop (`ask.ts`: native tool calls with a text-block
  fallback), the tool suite and safety policy (`tools.ts`), modular prompt
  composition (`prompt.ts`; `prompt-presets.ts` holds the `default`/`kawaii`
  personas), command-block parsing (`command.ts`), model-written session titles
  (`title.ts`) and auto-compaction (`compact.ts`). The command capability is used
  by the shell integration; voice/chat by the other frontends.
- `src/llm/` – the Anthropic/OpenAI client (`client.ts`) with tool calling and
  OpenAI SSE streaming; provider-agnostic conversation types in `types.ts`.
- `src/memory/` – file-backed session persistence (`store.ts`): one JSON file per
  session under `sessions/`.
- `src/server/` – the main program: the multi-session store (`sessions.ts`), the
  `EventBus` (`events.ts`), the `PermissionBroker` (`permissions.ts`) and the
  WebSocket service (`service.ts`; the RPC contract and `QwqRpcClient` live in
  `@qwq/shared`).
- `src/voice/` – the voice backend: PCM helpers (`pcm.ts`), audio capture
  (`audio.ts`), the persistent streaming-keyword-worker bridge (`kws.ts`),
  offline ASR (`asr.ts`), text-to-speech (`tts.ts`, piper/command engines), the
  power/accelerator resolver (`profile.ts`, `accel.ts`) and the state machine
  (`session.ts`). The only Python in the project is
  `python/qwq_kws_worker.py`, a deliberately thin streaming keyword spotter
  behind a length-prefixed stdio protocol; all orchestration is TypeScript.

## The server is the main program

`qwq serve` owns conversation state; `ask` (CLI/shell integration) and `voice`
are **frontends** that talk to it over Effect RPC on a WebSocket. Put shared
logic in the server or in pure modules, not in the frontends.

## Sessions

All frontends share one multi-session store: `Ask` may omit `sessionId` and the
server creates or reuses a session, and `ListSessions` / `GetSession` /
`RenameSession` / `DeleteSession` expose it to every frontend. Voice/command
sessions reuse the previous one within `sessions.reuseMinutes`. Session titles
prefer a model-written 「frontend: topic」 (`title.enable`), and long transcripts
are auto-summarised (`sessions.compact`).
