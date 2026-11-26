# Financials — Human QA readiness board

Deployed `43d699ac1fb8ca90ddee71c65f38225f5c82abb2` · staging · `nodeEnv: production` ·
database `ikaxilmwmrmbagoidedu`.

| row | verdict | evidence |
|---|---|---|
| CORE MONEY ORACLE | **PASS** | 116 rows both hosts; all six literals exact; drift 0 |
| FOCUS FINANCIALS | **PASS** | oracle reaches the Focus host's Details nav and renders 116 rows + all six KPIs |
| ACCOUNTS | **PASS** | list interactive P50 857 ms; rows, states and figures correct |
| HOST PARITY | **PASS** | row identity differences 0; KPI host differences 0 |
| RESPONSIBILITY | **PASS** | gear present; row action "Resolve who owes … under the arrangement in force" present |
| DISCOUNTS | **PASS** | gear present; "Sibling discount (QA specimen) · 10%" rendered on the account |
| PAYMENTS | **PASS** | Payment command, "Manage payments →", Payments lens (2) all present |
| ADD CHARGE | **PASS** | Add opens the entry command with amount, effective date and preview |
| ADJUSTMENT | **PASS** | full ADJUST CHARGE panel — against enrolment, against charge, type, amount, reason, effective date, Preview/Confirm/Cancel |
| PERIODIC BILLING | **PASS** | handler productized; the one `not_productized_v1` belongs to charge aging, deliberately |
| OPEN COLLECTIONS >200 | **PASS** | cap removed, deployed; 6 deterministic gates, 4 landed plants |
| PROGRESSIVE ACCOUNT LIST | **PASS** | KNOWN ZERO renders `$0.00 · No financial activity`; interactive 857 ms |
| PROGRESSIVE DETAILS FLOOR | **PASS** | cold usable floor 112 ms, warm 84 ms; no false Details |
| RESPONSIVE | **PASS** | horizontal overflow 0 at 1280 / 1440 / 1680 |
| SITE FILTER PERSISTENCE | **PASS** | North Campus survived Overview → Accounts → Overview |
| OVERVIEW | **PASS** | KPI landing populated; Bend Pine present; overflow 0 |
| LEDGER PRESENTATION | **PASS** | A: the 143 px is ledger furniture, not a void. B: not reproduced over 3 widths × 6 lenses × 116 rows |
| DESCRIPTION | **PASS** | proper ninth column with correct per-row values |
| TECHNICAL GATES | **PASS** | 171 files / 2,286 tests; typecheck; typecheck:tests; production build; 5 prebuild ratchets |

**Every row PASS.**

## The blocker that closed

`FINANCIALS_OPEN_COLLECTIONS_CHARGE_CAP_CORRECTNESS`. The selection began
`chargeIdsForReads.filter(Boolean).slice(0, 200)` — a URI-length guard from when attempts were
fetched with `.in("charge_id", ids)`. That request is gone; attempts arrive with the account fact
bundle, gathered set-based in SQL. What the slice still did was stop looking after the two-hundredth
charge, with **ledger row order deciding which 200 those were**.

The economics are unchanged — same five open states, same account scope, same newest-first ordering.
Removing the cap adds no charge that was not already eligible; it stops omitting ones that were.

**No deployed account's money moved.** Certhouse carries 116 ledger rows, so it never crossed the
boundary, and the oracle's six literals are unchanged to the cent.

## Two readings that were nearly reported as defects

Both were my instruments, not the product, and both were caught by looking at the actual frame:

- **A** — an arithmetic pass computed "106 px genuinely empty" from an element scan truncated to
  fourteen entries and then filtered to `DIV`, which dropped the period rows occupying the span.
- **B** — a detector reported 468 formatting anomalies by measuring `scrollWidth - clientWidth` per
  row; every row is `display: grid` in a container that scrolls horizontally by design.

## Carried, non-blocking

`SHARED_CONNECTION_LATENCY_PERFORMANCE_FOLLOWUP` (~500 ms fixed request overhead) ·
`SHARED_AUTH_CARD_CONSOLIDATION_FOLLOWUP` · `FINANCIALS_DEAD_ACCOUNT_DETAIL_CLEANUP` (not rendered;
cleanup after QA) · long-dwell second prewarm request (efficiency debt).

Human QA remains **ZERO / 44**, not started.
