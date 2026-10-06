# DONE — hardware acceleration & power switching

This segment is implemented. The section below is kept as the record of what was
asked for and how it landed; the remaining open item is Task 3 (hotkey wake), which
was an evaluation.

## Implemented

- **Task 1 — `voice.accel`.** Pure resolver in
  `packages/server/src/voice/accel.ts` (`resolveAccel`, `parsePciVendor`), with
  the sysfs read at the edge (`detectVendor`). On Linux `auto` maps Intel →
  `openvino`, NVIDIA → `cuda`, AMD → `rocm`, otherwise `cpu`. The resolved
  provider is applied to ASR (and `--provider`-capable TTS) only in the
  `performance` profile by `withPower`/`withTtsAccel`; the always-on wake word
  stays on CPU.
- **Task 2 — AC/battery.** Pure parser `parseOnline` + `resolvePower` and the
  `detectPower` edge reader in `packages/server/src/voice/profile.ts`; the voice
  entry forces `battery` on battery at startup. `services.qwq.voice.power` was
  added to the NixOS/Home Manager module. Runtime detection is used, so no
  `OnExternalPower` unit is required.
- **Task 4 — measurement.** `dev/measure.nu` reports per-process CPU time and RSS
  (`/proc/<pid>/stat`), RAPL package energy and battery discharge; baselines and
  the idle budget live in `docs/performance.md` / `docs/zh/performance.md`.
- Tests: `test/accel.test.ts`, `test/power.test.ts`, `test/voice-profile.test.ts`.

## Still open (evaluated, not implemented)

- **Task 3 — deeper idle reduction.** A `voice.wakeWord.engine: sherpa | hotkey`
  mode (no always-on KWS) and idle suspend + resume hotkey were not added; the
  battery profile plus the idle budget is the current answer.

## Acceptance criteria

- Battery idle budget defined in `docs/performance.md` (to be validated on the
  i5-12500H + Xe reference laptop with `dev/measure.nu`).
- `voice.accel` wired end to end and covered by a pure resolver test.
- `pnpm check` green; `pnpm build` green. `nix build .#qwq` could not be verified
  in this environment (no network to realise `fetchPnpmDeps`).
- Documentation bilingual and `docs/*/SUMMARY.md` in sync.

## Constraints (unchanged)

- Strict functional/Effect style: no `let`/loops/`try`/`async`, `Option` over
  `undefined`, no nullish coalescing, no object-member mutation.
- Authored scripts are TypeScript or Nushell; `.github/` is generated and must
  not be hand-edited.
- Version stays `0.2.0` (see [`PLAN.md`](./PLAN.md); the only hand-edited version
  is the root `package.json`).
