# Vacilando control-plane health (V2)

Represents the Vacilando HTTP process itself (not a worker slot).

## States

| Status | Meaning |
|--------|---------|
| `starting` | Process up, not yet accepting |
| `slow_to_bind` | Listen took ≥5s (historical failure mode) |
| `accepting` | `/api/health` answers; board may still be cold |
| `hydrated` | Board projection ready |
| `unresponsive` | Health probe failed |
| `screenshot_stalled` | Playwright/screenshot validation timed out |
| `recovering` | Owned restart in progress |
| `recovered` | Restart verified accepting |
| `recovery_failed` / `failed` | Recovery or bind failed |

## Owned recovery

`recoverOwnedVacilandoProcess` only terminates a pid recorded in
`~/.local/state/alloy-dev/vacilando/control-plane-owner.json` for the target port.
It refuses generic process killing (`no_owned_process`, `port_mismatch`).

## Endpoints

- `GET /api/health` — `{ accepting, hydrated, startup, control_plane }`
- `GET /api/control-plane/health` — full control-plane record + timings

## Incident link

The 2026-07-30 `:3021` freeze/slow-bind case was caused by sync `diskSignal` before
listen — see `STARTUP-BIND-FIX.md`. Control-plane events for that class of failure
are recorded on the Access & Identity cert mission timeline.

## Auth exposure (backlog)

Loopback-only mode may remain unauthenticated. Non-loopback bind / tunnel /
shared-host / remote exposure must fail closed unless API auth is configured —
see [`BACKLOG.md`](BACKLOG.md) **CP-AUTH-NON-LOOPBACK**.
