# Vacilando startup bind fix (2026-07-30)

## Root cause

`createVacilandoServer()` called `refreshDisk({ act: false })` before `listen`.
`refreshDisk` invoked **`diskSignal()` synchronously** via `execFileSync(alloy-worktree-gc)` with a **30s timeout**. That blocked the Node event loop until the GC dry-run finished, so HTTP bind appeared to take ~30s.

Measured before fix: `create_ms ≈ 30031`.

## Correction

1. `diskSignalAsync()` — async `execFile` for GC dry-run.
2. `refreshDisk` awaits `diskSignalAsync` only after yielding (`await Promise.resolve()`).
3. Recover + warm + disk + compose deferred until **after** `server.listen` (`beginBackgroundWarm`).
4. `/api/health` now returns `{ accepting, hydrated, startup }` so readiness distinguishes “accepting traffic” from “board hydrated”.
5. Control-plane health module records slow_to_bind / screenshot_stalled / owned recovery.

## After

- `create_ms` ≈ 0–1ms
- `listen_ms` ≈ 6–10ms
- Health answers while `hydrated: false`
- Regression: `scripts/local-dev/tests/vacilando-startup-bind.test.mjs`
