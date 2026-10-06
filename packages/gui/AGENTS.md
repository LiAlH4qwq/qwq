# packages/gui/AGENTS.md

Instructions specific to `packages/gui`, the Electron desktop frontend. Read
[`../../AGENTS.md`](../../AGENTS.md) first.

- The GUI is a **frontend** to the server: the main process connects over Effect
  RPC (`QwqRpcClient`), subscribes to the event stream and forwards events to the
  renderer over IPC. The renderer is **React + [Radix UI
  Themes](https://www.radix-ui.com/themes)** and reuses the shared chat reducer
  and view model (`@qwq/shared/client/state`, `.../view`, `.../theme`).
- It is **no longer exempt** from the functional rules: `packages/gui` is
  covered by `scripts/check-ast.ts` (`.ts`/`.tsx`), ESLint and
  `pnpm typecheck:gui`. Keep the main process in `Effect`/`Option`/`Ref` and the
  renderer free of DOM mutations (use Radix props / refs; scroll with
  `scrollIntoView`).
- **Window lifecycle**: windows live in a `Ref<HashMap<WindowKind,
  BrowserWindow>>`. A `closed` listener removes the entry, `ensureWindow`
  recreates on demand, and every send/show checks `isDestroyed()`. This is what
  prevents the historical “Object has been destroyed” crash after closing and
  reopening the chat window. With a tray the app stays alive when all windows
  close; without one it quits.
- `src/options.ts` holds the pure CLI parsing (unit-tested in
  `test/gui-options.test.ts`); `--help`/`--version` are handled before
  `app.whenReady()`.
- It registers a **system tray** (open chat / show last reply / toggle
  auto-close / quit). Registration failures are logged, not fatal.
- The reply **popup** defaults to a 10s countdown with pause/resume and early
  close (Space/Esc); the theme comes from `--theme`/`QWQ_GUI_THEME`.
- `electron` is **not** an npm dependency: the runtime is provided by Nix
  (`pkgs.electron`) and the API is declared ambiently in
  `packages/gui/src/electron.d.ts`. The renderer obtains `ipcRenderer` through
  Electron's injected `window.require`. `pnpm build:gui` bundles
  `src/main.ts` (Node, CJS) and `src/renderer.tsx` (browser, IIFE) into
  `packages/gui/dist/` and copies Radix's stylesheet to `dist/themes.css`.
- The server URL, popup duration, theme and popup source come from
  `QWQ_SERVER`, `QWQ_GUI_POPUP_MS`, `QWQ_GUI_THEME` and `QWQ_GUI_POPUP` (or the
  flags), which the NixOS/Home Manager module sets from `services.qwq.settings`.
