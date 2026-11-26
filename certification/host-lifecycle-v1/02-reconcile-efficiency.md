# C — cheap/targeted reconciliation efficiency: before and after

Measured with the **live** `runs.json` (4.15 MB, copied from the running host into an isolated
profiling root), driving `reconcileGovernor({ depth: "cheap" })` directly and counting every
JSON.parse over 200 KB.

## Before

```
pass  0: 1043.6 ms | large JSON.parse calls=127  bytes=517.7 MB  parse_ms=493.2
pass  1: 1006.8 ms | large JSON.parse calls=127  bytes=517.7 MB  parse_ms=486.2
pass  2: 1016.6 ms | large JSON.parse calls=127  bytes=517.7 MB  parse_ms=488.5
pass 11: 1015.2 ms | large JSON.parse calls=127  bytes=517.7 MB  parse_ms=488.5

min=982.3  median=1016.6  p95=1043.6  max=1043.6 ms
```

Every one of the 127 parses is the **same** `runs.json`. `getExecutionRun` reads the entire store
to find one run, and is called once per run per helper, so a pass that touches forty runs parses
four megabytes forty times. At a 10-second cadence that is ~1 second of CPU per 10 seconds on one
core, plus the allocation and GC churn on top — the `fs ReadFileUtf8 → UTF-8 decode → JSON.parse →
allocation → GC` hot path the September 11 sampler landed on, and the residual full-core burst that
**survived** moving Engineering Health off the event loop in D.

## After

```
pass  0:  38.9 ms | large JSON.parse calls=6  (4.2, 2.2, 2.2, 2.2, 2.2, 2.2 MB)  parse_ms=16.7
pass 29:  21.1 ms | large JSON.parse calls=5  (2.2 × 5)                          parse_ms=11.1

WARM (passes 4-30, n=27): min=20.2  median=21.1  p95=21.8  max=25.5 ms
```

| | before | after |
|---|---|---|
| cheap reconcile p95 | 1043.6 ms | **21.8 ms** (warm) |
| large parses per pass | 127 | 5 |
| bytes parsed per pass | 517.7 MB | 11.2 MB |
| ms inside JSON.parse | 488 | 11 |

**Acceptance 3 (p95 < 25 ms): met**, at 21.8 ms warm p95.

## What was NOT done, and why

The five remaining parses are all `admissions.json` (2.2 MB each), and the same memo would take the
pass to roughly 10 ms. It was **not** applied, deliberately.

`execution-run.mjs` separates its read path (`readExecutionRunStore`, used by `getExecutionRun` and
friends) from its mutation path (`readStoreForMutation` → `readExecutionRunStoreGuarded`). That
separation is what makes memoizing the read path safe: a write is always computed from fresh bytes.

`execution-admission.mjs` has no such separation — `readAdmissionStore` serves both readers and the
seven `writeStore` call sites, which mutate records in place on the object they were handed. Sharing
a memoized object there would let a mutation corrupt the cache. Fixing it properly means separating
those paths first, which is a larger change than this acceptance criterion requires, and criterion 3
is already met with margin. **Deferred, with the reason recorded rather than the benefit taken
unsafely.**

## What was deliberately not traded away

- The cheap cadence is still 10s and the targeted cadence still 30s. The cost was removed, not
  hidden behind a longer interval — a control asserts both intervals.
- Every repair on the cheap path is still on it: agent-session runtime reconcile, impossible
  NEEDS_INPUT repair, stale-run and undelivered-run reconcile, admission queue, orientation retry,
  stuck-session promotion. A control asserts each by name.
- The store on disk is still the authority. Nothing here decides anything; it stops re-parsing bytes
  whose identity has not changed.
