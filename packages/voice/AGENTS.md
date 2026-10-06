# packages/voice/AGENTS.md

Instructions specific to `packages/voice` (`qwq-voice`). Read
[`../../AGENTS.md`](../../AGENTS.md) first.

- `src/entries/voice.ts` – the Chinese voice frontend (wake word → ASR → request
  → TTS). It resolves the spoken tool/permission phrases from `voice.*` config
  (falling back to `presetVoicePhrases`) and passes them to the state machine.
- It is the **one exception** to the frontends → `shared` rule: it also imports
  `@qwq/server/*` for the voice backend (`voice/session.ts`, the audio/ASR/KWS/TTS
  layers and `withPower`), because that state machine is owned by the server
  package. Everything else comes from `@qwq/shared/*`.
- The RPC client is provided once at the entry point and served to the backend
  through `QwqRpcClient`; the wake word always stays on CPU.
- The backend (`@qwq/server/voice/session`) announces tool calls before/after
  they run, and on a `Permission` event speaks the request and interprets the
  spoken answer (`parsePermissionAnswer`), denying on timeout. Denied tools are
  reported through the `Tool` event's `status` field.
