# Validation broker enforcement (Vacilando)

**Status:** Active (2026-07-29). Learned from Access & Roles Phase 1: a Claude implement worker ran `npx tsc` under a broad Bash allowlist, bypassed the host lease, spiked load, and burned tokens without finishing.

## Rule

Vacilando **owns** heavy validation for implement workers. Workers must not be able to start raw `tsc` / `next build` on the host.

## Enforcement layers

1. **Claude `--allowedTools`** (`providers.mjs` ← `CLAUDE_IMPLEMENT_ALLOWED_TOOLS`): `vac` / `vac-run` / `alloy-*` / `npm run *` / focused `npx vitest|playwright` only. No `Bash(npx *)`, `Bash(npm *)`, or `Bash(node *)`.
2. **Worker PATH** on mission spawn includes `~/bin/alloy-dev` so `vac` resolves.
3. **Policy + package prompt** (`worker-operating-policy.md`, implement compiler): forbid raw compiler; instruct `vac run`.
4. **Conductor watchdog** (every 15s): terminate processes matching unbrokered heavy patterns **unless** `ALLOY_VALIDATE_EXECUTING=1` (set by `alloy-validate`). Audit: `validation.broker.enforce`.

## Worktree package.json

Canonical `web/package.json` routes `typecheck` / `typecheck:tests` / `build` / `test` through `vac-run`. Older worktrees that still call `node …/tsc` directly remain dangerous under `npm run typecheck` — the **watchdog** is the backstop until those trees pick up the brokered scripts.

## Operator

Restart Vacilando.app after pulling this change so the running server loads the new allowlist + watchdog.
