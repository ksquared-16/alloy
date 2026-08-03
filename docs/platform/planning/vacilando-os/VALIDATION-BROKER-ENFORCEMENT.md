# Validation broker enforcement (Vacilando)

**Status:** Active (2026-07-29). Learned from Access & Roles Phase 1: a Claude implement worker ran `npx tsc` under a broad Bash allowlist, bypassed the host lease, spiked load, and burned tokens without finishing.

## Rule

Vacilando **owns** heavy validation for implement workers. Workers must not be able to start raw `tsc` / `next build` on the host.

## Enforcement layers

1. **Claude `--allowedTools`** (`providers.mjs` ← `CLAUDE_IMPLEMENT_ALLOWED_TOOLS`): `vac` / `vac-run` / `alloy-*` / `npm run *` / focused `npx vitest|playwright` only. No `Bash(npx *)`, `Bash(npm *)`, or `Bash(node *)`.
2. **Worker PATH** on mission spawn includes `~/bin/alloy-dev` so `vac` resolves.
3. **Policy + package prompt** (`worker-operating-policy.md`, implement compiler): forbid raw compiler; instruct `vac run`.
4. **Conductor watchdog** (every 15s): terminate processes matching unbrokered heavy patterns **unless** `ALLOY_VALIDATE_EXECUTING=1` (set by `alloy-validate`). Audit: `validation.broker.enforce`.

## Worktree package.json vs Vercel / CI

`web/package.json` keeps **direct** `next build` / `tsc` / `vitest` scripts so Vercel and GitHub Actions can run them without the local Alloy lock broker (`vac-run` uses `/dev/fd` locks and host leases that do not exist on Vercel).

Local Vacilando **implement workers** must still use `vac run <kind>` / `vac-run` (allowedTools + policy). The **watchdog** remains the backstop against raw unbrokered `tsc` / `next build` on the operator machine.

## Operator

Restart Vacilando.app after pulling this change so the running server loads the new allowlist + watchdog.
