# FINANCIALS_PROGRESSIVE_ACCOUNT_DETAILS_FLOOR_DEPLOYED_CERTIFIED

Deployed `6fe3683570de` · staging · `nodeEnv: production` · database `ikaxilmwmrmbagoidedu`.

## The target

| | before `6738065d5` | after `6fe368357` | target |
|---|---|---|---|
| **cold click → usable Details floor** | 1,030 ms | **112 ms** | <500 ms ✓ (preferred <150 ✓) |
| **warm** | 1,379 ms | **84 ms** | <250 ms ✓ (preferred <150 ✓) |
| cold selected row | 63 ms | 111 ms | |

Cold usable floor per opening: 111, 118, 112, 147, 49 ms. Warm: 76, 47, 140, 84 ms.

**Settlement is not hidden.** First financial meaning still arrives at 1,046 ms cold / 1,356 ms
warm, and the ledger with it — that is the deep read (~900–1,100 ms, of which ~500 ms is carried
platform overhead). What changed is that the operator now has the correct selected-account surface
while it resolves, instead of an empty pane.

## F44 retired, not deleted

The absolute — *no visible partial Details* — is replaced by **NO FALSE DETAILS**. Its file now
carries the successor gate and preserves the original rationale verbatim, so the defect it was
created for cannot be forgotten: placeholder ledger rows rewriting into real ones, experienced as
two Details.

That defect is prevented by a narrower rule. The pending floor states the ledger's real **columns**
and **zero rows**, so there is nothing to rewrite and the real ledger commits exactly once. The
objection was never the shape — it was the rows.

## Mounted proof of the contract

From the A → B → C specimen, three distinct accounts addressed by canonical id:

- **A settled**: floor names A, 116 rows, real figures.
- **+140 ms after selecting B**: floor names **B**, `pending=true`, `truth=not_yet_known`,
  **0 rows**, `reading=true`, **no money at all**. A's 116 rows and A's six figures are already gone.
- **Through C's selection**, at 132/392/743/1437/2643/4204/6509 ms: selected identity and the
  floor's account agreed at every frame, and no ledger belonging to another account ever appeared.

## Geometry — no jump

| width | pending | settled | overflow |
|---|---|---|---|
| 1280 | 717 px, lenses present | 717 px | 0 |
| 1440 | 838 px, lenses present | 838 px | 0 |
| 1680 | 1066 px, lenses present | 1066 px | 0 |

Identical outer geometry in both states at all three widths. No second box when truth lands, no
modalization of the floor.

## Four states, one doctrine

`KNOWN` / `KNOWN ZERO` / `NOT YET KNOWN` / `UNAVAILABLE` — the same four the account rows already
deploy, gated so the list and the floor cannot drift into different uncertainty semantics. A read
that answers with nothing usable renders `unavailable` and stops saying it is reading, **without**
claiming the account is empty: an absence of rows is the absence of an answer.

Observed: `truth=not_yet_known` while reading, then the settled surface with `$0.00` for an account
that genuinely has none — KNOWN ZERO, which is an answer.

## Read-ahead kept, and it composes

Prewarm still runs — default selection and pointer/keyboard intent — and still coalesces with the
card's own read. It no longer decides whether Details may exist; it shortens how long the reserved
state is on screen. Unconsumed prewarm in the deliberate waste specimen: **1 request, 4,076 bytes**.

## Correctness

116 ledger rows on both hosts. CURRENT BALANCE $2,023.87 · DUE $1,912.00 · PAST DUE $1,525.00 ·
RESPONSIBILITY $2,098.87 · PAID $75.00 · AVAILABLE PREPAID $125.00. Row identity differences 0.
KPI host differences 0. Drift 0.

## Carried

`SHARED_CONNECTION_LATENCY_PERFORMANCE_FOLLOWUP` (~500 ms fixed overhead),
`SHARED_AUTH_CARD_CONSOLIDATION_FOLLOWUP`, `FINANCIALS_OPEN_COLLECTIONS_CHARGE_CAP_CORRECTNESS` —
all untouched. Long-dwell second request carried as a read-ahead efficiency follow-up; the floor
makes it a non-blocker rather than a usability defect.

Human QA remains **ZERO / 44**, not started.
