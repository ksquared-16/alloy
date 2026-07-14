# AI app health and verification load (Phase 3)

Companion to `alloy-ai-health` for interpreting AI + browser pressure during parallel agent work.

## What `alloy-ai-health` reports

Read-only diagnostics:

- Memory, swap, load
- Cursor / Claude / ChatGPT process samples
- Node / tsc / vitest / next / Playwright **test runner** counts (argument-aware)
- **Toolkit-owned browser** count and per-slot stale/running state
- Application Support / cache sizes (observational — not causal)
- Managed agent summary (includes env/auth/browser columns from Phase 3)

## Smoke-test observations (operator Mac)

| Location | Approx. size |
|----------|----------------|
| Cursor Application Support | ~18 GB |
| Claude Application Support | ~7.7 GB |
| ChatGPT Application Support | ~4.4 MB |

Interpretation:

- Large Cursor/Claude support stores and many helper processes **may** contribute to local pressure
- Long ChatGPT conversations can lag **independently** of ChatGPT cache size
- This command does **not** claim causation

## Phase 3 browser additions

`alloy-ai-health` now includes:

```
toolkit browsers  <count>
```

Plus a per-slot section for non-stopped browser states (running/stale) with profile paths.

Stale toolkit browser metadata is **reported only** — use `alloy-agent-browser-stop <slot>` to stop owned processes.

## Three verification tiers

| Tier | Command | CPU model |
|------|---------|-----------|
| Interactive login | `alloy-agent-login` | One headed browser per slot; human auth |
| Focused verify | `alloy-agent-verify` | One headless worker; evidence on failure |
| Heavy suite | `alloy-validate … playwright` | Global lock; one machine-wide |

Do not run full Playwright outside `alloy-validate` except via `alloy-agent-verify … focused-spec` (which delegates to the lock).

## Protected data

`alloy-ai-health` never:

- Deletes Application Support or caches
- Prints credential or storage-state values
- Kills browsers or AI apps automatically

See `VERIFICATION-SECURITY.md` for the full security model.
