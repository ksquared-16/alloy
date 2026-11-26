# Read-ahead deployed, measured, and INSUFFICIENT on its own

Deployed `6738065d553584ecdbcd84e3df9136cc711226a9` (PR #1285), staging, `nodeEnv: production`.
F44 unchanged and green: exactly one Details branch, no hydrating Details card.

## The mounted sample does not meet the target

Same harness, same tenant, before and after:

| | BEFORE `92bfd2217` | AFTER `6738065d5` | target |
|---|---|---|---|
| cold selected row | 160 ms | 63 ms | |
| **cold usable Details** | 1,205 ms | **1,030 ms** | **<500 ms — NOT MET** |
| warm usable Details | 1,216 ms | 1,379 ms | <250 ms — NOT MET |

Cold improved ~175 ms. Warm did not improve; the two warm sets select different accounts with
different ledger sizes, so that difference is within the noise of what the harness varies and I am
not claiming a regression from it either.

## Why — and the finding that actually matters

The mounted specimens click with **no dwell**: Playwright dispatches pointer-enter and pointer-down
in one gesture, so the read-ahead has nothing to be ahead of. That is a real operator case (a
decided or keyboard-driven click), but it is not the only one, so head start was measured directly
against dwell — timestamping requests as they are **issued**, against one origin:

| dwell | head start | post-click usable | card requests |
|---|---|---|---|
| 0 ms | 3 ms | 878–911 ms | 1 |
| **400 ms** | **402 ms** | **420–550 ms** | 1 |
| 900 ms | 903 ms | 932–1,153 ms | **2** |

Three things follow, and the third is the important one.

**The mechanism works.** Head start tracks dwell exactly — 402 ms at 400 ms, 903 ms at 900 ms. A
hover issues one card read for the hovered account and does not change the selection.

**In its working window it meets the target.** At 400 ms of dwell the post-click wait is 420–550 ms,
at or about the <500 ms line. Every millisecond of intent is a millisecond the operator does not
spend after deciding.

**And it has a cliff.** At 900 ms of dwell the wait gets WORSE and the account is read TWICE. The
coalescer is deliberately not a cache — its slot is cleared the instant the operation settles — so
once a prewarm finishes before the click, its answer is discarded and the card starts a fresh read.
Dwell shorter than the read helps; dwell longer than the read costs an extra request and buys
nothing.

Closing that cliff means retaining a completed result, which is a cache of financial truth between
operations — the line this repair deliberately did not cross, and not something to cross by
reflex on a money surface.

## Cost of the prediction

One unconsumed prewarm in the deliberate waste specimen: **1 request, 4,076 bytes** for that
account. A larger account measured **218,680 bytes** in an earlier pass, so the cost is real and
scales with the account rather than being nominal. Only accounts under pointer/focus intent are
read, never the cohort.

## What is genuinely better and should be kept

The **default account** is now fast: usable Details at **31–208 ms**, because its read starts with
the list rather than when the Details component later asks. That half of the repair does what it
was meant to and costs nothing speculative.

## Carried, unchanged

Of the ~900–1,100 ms read, roughly **500 ms is the carried connection term**
(`SHARED_CONNECTION_LATENCY_PERFORMANCE_FOLLOWUP`). A read-ahead can only move *when* that cost is
paid, never remove it — which bounds what any amount of dwell can achieve.

## Therefore: reopen F44

Per the one-attempt rule, no second prefetch mechanism was invented. The deployed evidence for the
product decision is now:

- read-ahead alone does **not** reach <500 ms cold on an ordinary no-dwell click (1,030 ms);
- it **does** reach it when the operator dwells ~400 ms before clicking;
- it is counterproductive beyond the read's own duration;
- the strict no-partial-Details guard therefore remains visibly expensive for a decided operator.

**F44 — NO VISIBLE PARTIAL DETAILS — is reopened for reconsideration on this evidence.** Option 1
(the pending floor, built and gated, preserved in stash `d3ed9396`) may now be reconsidered: it
makes the wait irrelevant rather than shorter, and its ledger region states columns and no rows, so
there is nothing to rewrite when the real ledger commits.
