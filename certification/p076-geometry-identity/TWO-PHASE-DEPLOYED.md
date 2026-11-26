# P0-7.6 — two-phase seed emission, deployed and measured

Three deployed builds, same pinned six-card / full-attendance specimen, zero specimen drift in the
counted samples.

| | `a5eb2f29` progressive composer | `f7aaa0b0` two-phase | `5e312eb3` + payload dedupe |
| --- | ---: | ---: | ---: |
| n | 24 | 26 | 26 |
| `geometry_identity_ms` | 144 | 136 | 141 |
| `compose_total_ms` | 450 | 422 | 407 |
| `page_total_ms` | 1408 | 930 | **890** |
| `decodedBodySize` | 210,115 | 312,235 | 221,450 |
| `focus_panel_chain_commit` | 1943 | 1462 | 1521 |
| **FIRST_AUTHORITATIVE_FRAME** | **1983** | **1493** | **1557** |

## What the transport change bought

`page_total_ms` fell 1,408 → 890ms and the Focus Panel now commits at 1,521ms, **before**
`domInteractive` (1,844ms). The frame is genuinely leaving the server ahead of the settlement: that
was the principal architecture gate and it passes.

FIRST_AUTHORITATIVE_FRAME improved 1,983 → 1,557ms, a 426ms gain.

## The product gate still fails

| metric | P50 | P75 | P90 | P95 |
| --- | ---: | ---: | ---: | ---: |
| **FIRST_AUTHORITATIVE_FRAME** | **1557** | 1691 | 2146 | 2405 |

Target `< 1,000ms`. **0 of 26** samples pass. Headroom **−557ms**.

## A repair that was right and bought nothing

The two-phase split introduced a regression: `toRscPlainJson(answer)` was called at both prop sites,
and React's flight serializer dedupes by REFERENCE, so the whole answer was written into the payload
twice — `decodedBodySize` 210,115 → 312,235, about 102KB of duplicate parsed on the frame's own
critical path.

Fixing it restored the payload (221,450, near baseline) and **did not improve the frame**: 1,493 →
1,557ms, inside the sample-to-sample spread. So the duplicate was a genuine defect worth removing,
and it was never the binder. Recorded as a negative result rather than claimed as a saving.

## The one remaining owner

```
requestStart                    142
+ ttfb                           34
+ route_identity_ms             164
+ compose_total_ms              407
= frame chunk earliest          750ms
  focus_panel_chain_commit     1521ms
  ** CLIENT interval            771ms  <- the binder
```

The server now has the frame in hand at 750ms and the browser does not commit it until 1,521ms.

**Owner: the Focus Panel is client-rendered from a seed.** The page segment renders no UI at all —
it emits a seed, and `WorkUnitSlugRouteHost` mounts the surface in the browser. So the frame's HTML
does not exist server-side, and nothing can commit until the client bundle has downloaded, parsed,
executed and hydrated. That is the 771ms, and no amount of making the answer arrive sooner moves it.

- **current P50:** 1,557ms
- **gap:** 557ms
- **binding interval:** frame chunk available 750ms → chain commit 1,521ms
- **required architectural change:** server-render the Focus Panel geometry as HTML inside the RSC
  stream, so the frame is committed by the server and the seed carries only what later interactivity
  needs. Nothing smaller reaches 557ms: Part 16 requires a predicted saving of gap + 50 = 607ms, and
  every remaining server term (route_identity 164, compose 407 of which geometry is 141) is already
  smaller than that on its own.

## Correctness — every gate passes

| gate | result |
| --- | --- |
| cards rendered / configured | 6 / 6, all 26 samples |
| unavailable cards | 0 |
| schema error | none |
| `placedCardCount` | 6 |
| configured card ORDER | 1 distinct ordering across 26 — **STABLE** |
| action safety (`drawerBlocked`) | 0 |
| WU-07 stale-known (KNOWN(A)→KNOWN(B)) | **0** |
| navigation isolation / idempotence / cleanup | 21 kernel plants |

| | `a5eb2f29` | `5e312eb3` |
| --- | ---: | ---: |
| MONOTONIC_RESOLUTION P50 | 16 | 20 |
| AUTHORITATIVE_CORRECTION P50 | 2 | **2** |

Corrections are unchanged, and the dominant one is still the same WU-07 mode-control subtree
teardown that predates all of this work.

## Resolution metrics, preserved separately

| metric | `a5eb2f29` | `5e312eb3` |
| --- | ---: | ---: |
| ALL_FIRST_ORDER_FACTS_RESOLVED | 5717 | 5063 |
| ALL_VISIBLE_AUTHORITATIVE_FINAL | 5730 | 5134 |

Both improved alongside the frame, so the transport change did not buy frame latency by pushing the
facts further out.

## P0-7.6 closure

**NOT CLOSED.**

- `FIRST_AUTHORITATIVE_FRAME P50 < 1,000ms` — FAIL at 1,557ms
- `POST_COMPLETE_AUTHORITATIVE_CORRECTION P50 = 0` — FAIL at 2 (pre-existing, WU-07)

Part 17 (WU-07) is gated on the frame passing, so it was not opened in this run.
