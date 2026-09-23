# P0-7.6 — the seed-consume regression: cause, the revert that did not land, and resolution

## What happened

Attacking the measured frame binder, cold-load attention hydration was moved from a `useEffect` to a
render-phase `useMemo`. The reasoning was sound and is recorded in the codebase already: effects do
not run until React has hydrated the whole tree, and on `5e312eb3` the OS shell painted at 619ms
while the Focus Panel chain did not start until 1,521ms.

It regressed. `provisioning.onAttentionMoved` runs synchronously up to its first await, and that
stretch reaches `consumeFreshProvisioningForRoute`. The seed is registered by a render-phase write in
the PAGE SEGMENT — a **descendant** of `SurfaceHostProvider`. React renders ancestors first, so the
consume ran before the registration, missed, and refetched over the network an answer the document
already carried. A `queueMicrotask` hop was tried and did not fix it: the pass it waits for is not
necessarily the pass that registers the seed.

## The revert that did not land

The first revert was committed, then `origin/staging` was merged — and by then staging held the
squash of the very PR being reverted. The merge resolved in favour of staging's copy and put the
regression straight back on top of the fix. It was pushed without re-verifying file content, so
`d198b6ca` shipped the regression under a commit titled "revert".

The damage was not only the extra deploy. The next measurement showed the defect persisting, which
read as *the diagnosis was wrong* rather than *the fix never shipped* — and that conclusion was
briefly written down. The lesson is narrow and worth keeping: **when a fix does not change the
symptom, first prove the fix actually shipped.**

## Measurement

| | `5e312eb3` | `5cc97186` | `d198b6ca` | `20647070` |
| --- | ---: | ---: | ---: | ---: |
| | baseline | regression | still regressed | **reverted** |
| live `provisioning-answer` fetch | 0/26 | 23/24 | 25/26 | **0/25** |
| `apiRequestCount` | 32 | 33 | 33 | **32** |
| FIRST_AUTHORITATIVE_FRAME P50 | 1557 | 1377 | 1353 | **1364** |
| FIRST_AUTHORITATIVE_FRAME P95 | 2405 | **7642** | 1892 | **2186** |
| ALL_FIRST_ORDER_FACTS_RESOLVED | 5063 | 4702 | 4598 | **4461** |

Each affected load paid roughly 2.2s for the refetch. Note the P50 *improved* under the regression —
the redundant fetch overlaps — so P50 alone would have passed it as a win. The tail and the request
count are what exposed it.

`seedReachedClient.present` was 26/26 on every build and the seed's own match diagnostic reported
`ok: true`, which is how the fault was localised to the CONSUME rather than the payload.

## Resolution

Deployed `20647070`, verified by content (`queueMicrotask` 0, render-phase hydration 0) and by
measurement (0/25 fetches, `apiRequestCount` back to 32). The current build is better than the
pre-regression baseline on every column above.

`coldLoadSeedConsumption.test.ts` pins both halves and records the measurement, including the part
that was got wrong.

## What it means for the frame

`FIRST_AUTHORITATIVE_FRAME` P50 **1,364ms** against a 1,000ms target — **FAIL**, headroom −364ms.

The episode is also evidence about the remaining owner. The ~900ms between shell paint and chain
start is real, but it is not reachable by reordering those two writes: any hydration early enough to
beat the effect is also early enough to beat the seed. Closing it needs the answer available ABOVE
`SurfaceHostProvider`, or the surface server-rendered — and the JS-disabled probe
(`zz-p076-ssr-probe.spec.ts`) shows 220,640 bytes of server HTML with zero surface markup, so that is
a migration rather than a change.
