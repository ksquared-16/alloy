# The measured pole — deployed `268fc0770`, cold n=5 / warm n=8

The promotion existed to replace a performance guess with evidence. It did, and the evidence
rejects the hypothesis the slice was carrying.

## Headline

| | COLD n=5 | WARM n=8 |
|---|---|---|
| click → interactive list | **1,514 ms** | 136 ms |
| target | <1,000 ms | <500 ms |
| verdict | **NOT MET** | met **by the client cache, not by the cohorts** |

All 8 warm openings became interactive *before* their data arrived — the list rendered the cohort
already in memory and refetched behind it. Both routes were still issued and still cost the server
~680 ms each. The warm figure measures the cache.

## Where cold time goes

| segment | P50 | owner |
|---|---|---|
| click → first request starts | 135 ms | client mount |
| data wait — `max(subjects, position)`, never the sum | 1,325 ms | server + network |
| last response → interactive | 54 ms | client render |

Per route: subjects 1,222 ms wire / **680 ms server**; position 1,321 ms wire / **685 ms server**.
So ~540 ms per request is connection latency, identical on a 4.2 KB and a 52.9 KB body, and not
Financials-owned.

## THE POLE: sequential round-trip depth, over a twelve-household cohort

The instrument put the cohort size in the label. `households_1p_n12` — **one page, twelve
households**. `pl_placements_n7` — seven placements.

| subjects | offset | gap | | position | offset | gap |
|---|---|---|---|---|---|---|
| households_1p_n12 | 122 | **+122** | | charges | 154 | **+154** |
| members | 243 | **+121** | | agreements | 328 | **+174** |
| pl_placements_n7 | 360 | **+117** | | collectible | 586 | **+257** |
| pl_instances | 482 | **+121** | | customers | 685 | **+99** |
| pl_programs | 582 | **+100** | | | | |
| pl_rooms | 679 | **+97** | | | | |
| **6 waves** | | **679 ms** | | **4 waves** | | **685 ms** |

Mean **113 ms** per round trip on subjects, **171 ms** on position — for twelve households. The
cost does not follow the rows; it follows the *number of sequential round trips*. Row assembly,
`assemble`, is 0.2 ms. `perm` is 0.3 ms, so the shared auth repair holds exactly as certified.

## The placement hypothesis: MATERIAL WITHIN ITS BRANCH, but NOT ON THE CRITICAL PATH

The chain runs `members → pl_placements → pl_instances → pl_programs → pl_rooms`, 436 ms of its
own, and it outlasts its concurrent sibling (the site walk, done at 372 ms) by **307 ms — 55% of
the concurrent region**. Within subjects it is DOMINANT.

**And repairing it alone would move click → interactive by zero.** Subjects is not the gate.
Removing the entire chain takes subjects from 679 ms to ~372 ms, and the list would then wait on
position at 685 ms — unchanged. The two branches are balanced at ~680 ms, and the list waits on
the slower one.

This is exactly the outcome the instruction asked for: treat it as a hypothesis, and let the
evidence classify it. **Classification: MATERIAL CONTRIBUTOR to its own branch, NOT MATERIAL to
the critical path.** It is not the next repair.

## Ranked Financials-owned contributors to click → interactive

1. **Sequential round-trip depth on BOTH branches** — 6 waves and 4 waves at ~113–171 ms each.
   This is the pole. Nothing else is close, and it is the only term that explains both branches.
2. **`collectible` on position — 257 ms**, the largest single server span anywhere. A shared
   authority (`resolveCollectiblePositionsForCharges`), itself more than one round trip.
3. **The placement chain — 307 ms of overhang** on the branch that is not the gate.
4. **`customers` on position — 99 ms.** The duplicate the §8 matrix predicted: subjects already
   reads a superset of these twelve names, and `joinAccounts` prefers the subject's copy.

## Selected repair

**Collapse the cohort acquisition depth — one server-side acquisition per branch instead of six
and four.** It is the only repair the evidence supports, because it is the only one that addresses
what the measurement actually found, and §12 prefers extending the canonical server-side
acquisition that already exists for the Details card.

What the arithmetic says it buys, using the measured 540 ms connection term and 113–171 ms per
trip:

| state | subjects | position | gate | cold click → interactive |
|---|---|---|---|---|
| today | 679 | 685 | 685 | **1,514 ms** |
| defer placements only | 372 | 685 | 685 | ~1,514 ms — **no change** |
| drop position's `customers` only | 679 | 586 | 679 | ~1,400 ms |
| **one acquisition per branch** | ~150 | ~420 (`collectible` remains) | 420 | **~1,120 ms** |
| **+ position no longer blocks** (§10/§11) | ~150 | — | 150 | **~870 ms — target met** |

The last row is why the three-state contract in `blocking-vs-progressive.md` matters: it is on the
path to the target, not a nicety. And `accountState` falls through to **"Settled"** on absent
money, so a naive deferral would label an outstanding household settled.

## Correctness held throughout

116 ledger rows on every one of the 26 openings across both samples, on both builds.
