# P0-7.6 — the frame gate, measured properly, and the one owner that remains

Deployed `a5eb2f29`, 24 cold samples kept of 26 (2 discarded to specimen drift, loudly), pinned
six-card / full-attendance specimen. Compared against `d3cad7ec` (n=26), the same specimen before the
progressive frame.

## A correction to the previous report

The previous run quoted `documentMs` as FIRST_AUTHORITATIVE_FRAME. Phase 6 forbids that
substitution, and rightly: the frame is the CLIENT commit of the configured geometry, not the
document. Measured properly:

| | before | after |
| --- | ---: | ---: |
| `domInteractive` | 2687 | 1936 |
| `focus_panel_chain_commit` | 2694 | 1943 |
| **FIRST_AUTHORITATIVE_FRAME** (WU-09 first commit) | **2818** | **1983** |

The proxy was close — the client interval between `domInteractive` and the chain commit is **5ms** —
but the number that counts is 1,983ms, not 1,938ms.

## The product gate

| metric | P50 | P75 | P90 | P95 |
| --- | ---: | ---: | ---: | ---: |
| **FIRST_AUTHORITATIVE_FRAME** | **1983** | 2180 | 2555 | 3476 |

Target `< 1,000ms`. **FAIL — 0 of 24 samples pass.** Gap = **983ms**. Improvement from 2,818ms is
835ms.

## The binding interval

The frame is bound **entirely by the server document**. The client contributes 47ms in total:

```
requestStart              149
responseStart             183   (ttfb 34)
responseEnd              1920   (transferMs 1702 = the server stream hold)
domInteractive           1936
focus_panel_chain_commit 1943   (+5ms)
FIRST_AUTHORITATIVE_FRAME 1983  (+40ms render)
```

The 1,702ms stream hold decomposes as:

| term | P50 | note |
| --- | ---: | --- |
| `route_identity_ms` | 156 | layout, before the page segment |
| `compose_total_ms` | 450 | of which `geometry_identity_ms` is 144 |
| **`card_producers_ms`** | **740** | **the measured binder** |
| RSC render / serialize | ~356 | residual |

`projectFocusPanelCardProducers` cost the route **nothing** before this change, because it ran
concurrently with composition and finished first. Composition now ends at 310ms, so it is no longer
hidden underneath and the route waits 740ms for it.

## Why no bounded repair is authorised

Phase 11 permits one repair without a further prompt only if the predicted saving is at least the gap
plus 50ms of headroom.

```
gap                 1983 − 1000 = 983ms
required saving     983 + 50    = 1033ms
largest single measured owner   = 740ms  (the producer join)
frame after removing it entirely ≈ 1243ms → still 243ms over
```

**740 < 1033.** No single semantics-preserving repair on the measured list reaches the threshold:
producers (740), the RSC residual (~356), the compose tail beyond geometry (306) and
`route_identity` (156) are independent terms, and only a combination clears 1,033ms.

So Phase 12 applies.

## Phase 12 — the one owner

**Owner:** the surface is client-rendered from a SINGLE seed that the page segment cannot emit until
its one `await composeProvisioningAnswerForRoute(...)` completes. Everything the route still does
after geometry is decided — the producer join, the compose tail, the RSC serialize — sits inside the
stream hold, so the frame cannot arrive before the whole answer does.

- **current P50:** 1,983ms
- **gap:** 983ms
- **binding interval:** `requestStart 149 → responseEnd 1920`; the client adds 47ms and is not the
  owner
- **required architectural change:** emit the seed in TWO phases — geometry at ~144ms, facts as they
  settle — so the producer join and the compose tail leave the streaming path. Removing both is worth
  ~1,046ms, which does clear the gate.

That change is blocked today by the seed kernel, not by the composer:
`seedProvisioning` refuses to clobber a still-fresh entry (`if (existing && isFresh(existing, now))
return;`) and `consumeFreshProvisioning` deletes on read with no subscription — so a second seed
cannot upgrade a surface that has already consumed the first. Two-phase emission requires that seam
to gain an additive, per-cell upgrade path. It is an architecture change, not a bounded repair, which
is precisely why Phase 11 does not cover it.

## Correctness — all gates pass

| gate | result |
| --- | --- |
| cards rendered / configured | 6 / 6, all 24 samples |
| unavailable cards | 0 |
| schema error | none |
| `placedCardCount` | 6 |
| configured card ORDER | 1 distinct ordering across 24 samples — **STABLE** |
| UNKNOWN != ZERO | `cohort_enriched_at_commit` 0/24, `document_children_at_commit` 1/24, no fabricated zero |
| WU-07 stale-known (KNOWN(A)→KNOWN(B)) | **0**, before and after |
| drawerBlocked | 0 |

Post-complete classification (Part 9):

| | before | after |
| --- | ---: | ---: |
| MONOTONIC_RESOLUTION P50 | 6 | 16 |
| AUTHORITATIVE_CORRECTION P50 | 2 | **2** |

Corrections did not move. The rise is entirely monotonic — UNKNOWN cells resolving, which is the
permitted behaviour. The dominant correction is the same WU-07 mode-control subtree teardown present
in BOTH builds, so it is pre-existing and this change is not its cause.

## Resolution metrics, preserved separately

| metric | before | after |
| --- | ---: | ---: |
| ALL_FIRST_ORDER_FACTS_RESOLVED | 2822 | 5717 |
| ALL_VISIBLE_AUTHORITATIVE_FINAL | 6266 | 5730 |

Every configured card now settles together at ~5,730ms, because they wait on one Settlement pass
rather than on the server. The frame arrives 835ms sooner and the facts 2,895ms later.

## P0-7.6 closure

**NOT CLOSED.** Both conditions fail:

- `FIRST_AUTHORITATIVE_FRAME P50 < 1,000ms` — FAIL at 1,983ms
- `POST_COMPLETE_AUTHORITATIVE_CORRECTION P50 = 0` — FAIL at 2, pre-existing, owned by WU-07
