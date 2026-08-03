# Validation broker certification — host-wide lease

**Date:** 2026-07-29  
**Worktree:** `wt6-vacilando-os-product-def`  
**Suite:** `scripts/local-dev/tests/test-validation-broker.sh`

## Problem proven

Concurrent workers could run `npm run typecheck` / `build` / full Vitest in parallel because package scripts bypassed `alloy-validate`. Host load spiked; measurements became untrustworthy.

## Fix

- Evolved `alloy-validate` into a host-wide **validation lease broker** (enriched lease, FIFO queue, heartbeat, status/cancel).
- Added `vac` / `vac-run` aliases for local workers. Vercel/CI keep direct `next build` / `tsc` / `vitest` in `web/package.json` (broker locks are host-local only).
- Result reuse: identical kind by commit+fingerprint; successful `build` satisfies later `typecheck`.

## Automated cert results (2026-07-29)

```
PASS: waiter sees lease/queue
PASS: both typechecks ran sequentially
PASS: lease released after both
PASS: stale dead-PID lease reclaimed
PASS: lock clean after reclaim
PASS: status shows queue/lease
PASS: FIFO: queue head is wt1-broker-a
PASS: typecheck reused build result
PASS: reused typecheck exit 0
PASS: compiler not re-launched
PASS: cancel removes waiter
```

Command:

```bash
cd scripts/local-dev && bash tests/test-validation-broker.sh
```

## Operator checks

```bash
vac status                 # active lease + FIFO queue
vac run typecheck          # brokered
cd web && npm run typecheck  # same broker path
vac cancel <request_id>    # drop waiter / signal holder
```

## Browser / multi-worker smoke (manual)

With two managed slots, start `npm run typecheck` in each worktree: exactly one holds `vac status` lease; the other shows queue position until the first finishes. Abandoned holder (kill -9) is reclaimed by the next waiter via dead-PID / heartbeat stale logic.

## Out of scope (unchanged)

Focused `npx vitest run path/to/file.test.ts`, dev servers, and browser sessions remain concurrent outside the heavy_validate lease.
