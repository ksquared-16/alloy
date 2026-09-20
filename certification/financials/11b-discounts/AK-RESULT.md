# A–K — all eleven PASS on the repaired deployed build

Deployed build **`e29c223a8014e8dfccc5a013179fefcd793b9368`** (PR #1113 merge) ·
`https://staging.workwithalloy.com` · branch `staging` · `nodeEnv production` ·
deployment `dpl_AiNurCNXYJ3aUdYXd5fKwGs8fRkX` · Supabase `ikaxilmwmrmbagoidedu`
(census target `alloy_deployed_primary`, fingerprint `b15dad2c6d030ed4`).

**Nothing is carried from the previous run.** Every gate was re-asked, because the repair could
have invalidated one that passed.

| Gate | Result | Evidence |
|---|---|---|
| **A** migration applied | **PASS** | read from the database, not the apply label: `migration_in_ledger → 20260924120000` |
| **B** deployed table exists | **PASS** | `table_exists → commercial_policy_exceptions` |
| **C** constraints / index / trigger / FKs | **PASS** | `reason` NOT NULL + `CHECK ((length(btrim(reason)) > 0))`; `ux_commercial_policy_exceptions_live … WHERE (superseded_at IS NULL)`; trigger `(O)`; `policy_id confdeltype=r`, relationship `confdeltype=c`; `org_id` NOT NULL |
| **D** deployed runtime reads the table | **PASS** | forecast route 200 with the `exceptions` key; B removes the schema-absent ambiguity |
| **E** forecast BEFORE | **PASS** | both assignments eligible: `−$14,500` on `cf044308`, `−$1,850` on `79f8011d`, policy `5df9fc6c` |
| **F** mounted authoring, **write half** | **PASS** | Add offered · draft opened · Confirm **disabled** without a reason · preview states applicability and invents no figure · Confirm **wrote** · canonical read-back found the row · **no raw database error**. Then **end → re-author the same policy/relationship/start succeeded**, ended row still readable — the exact act that failed before |
| **G** forecast AFTER | **PASS** | `excluded_by_exception`; UI "Excluded for this assignment" with the author's reason. Never `no_policy_configured` |
| **H** actual draft reduction exclusion | **PASS** | an eligible DRAFT was generated for 2026-10 (`generated: 1`), then `billing.apply_discounts` ran: **`notEligible: 1`, `applied: 0`, `refused: 0`**, and **zero** new `financial_reduction_applications`. Gross unchanged at 145000, net equals gross |
| **I** one policy identity | **PASS** | `5df9fc6c` in configuration, in the forecast outcome, on the exception row, and on **7 real ledger reductions** carrying `basis: percentage`, `basisAmountCents` 18500/145000, `capped: false` — amounts `−1850` / `−14500` matching the forecast exactly. The excluded relationship has **none** |
| **J** posted-history safety | **PASS** | 51 reductions (38 posted) compared across **20** provenance fields — amount, currency, category, kind, reason, period, `commercialPolicyId`, `policyKind`, basis, basisValue, basisAmountCents, capped, sourceChargeId, **chargeStatus**, chargeId, agreement, member, createdAt, both reversal pointers. **Zero drift**, nothing disappeared |
| **K** supersession + restoration | **PASS** | supersession preserves both rows and deletes nothing; ended rows stay readable; **restoration proved against a period the ended window does not cover** — the forecast returns `expected` again |

## §12 — the distinction the repair introduced, mounted

A window of `2026-09-01 → 2026-09-19`, read on the deployed build:

```
appliesNow: true      "did this govern the period being evaluated?"   YES
isLiveNow:  false     "is this live and endable today?"               NO
```

The forecast still truthfully reports the period as governed, and the surface renders
**"ended 2026-09-19 … Ended"** with **zero** End controls. Before the repair the card read the
forecast's answer and offered to end something already ended.

## §6 — the named refusal

Deterministically bound and proved by planted defect: `liveSlotTaken` recognises Postgres **23505**
plus the constraint's own identity — never its prose — and returns `exception_already_exists`
before any `db_error` fallthrough, with copy telling the operator to reload, then end the one on
record or choose a different start date.

**It could not be provoked at runtime, and that is the repair working.** Two same-start authorings
in sequence both returned `ok` — the second SUPERSEDED the first rather than colliding, which is
precisely what supersede-before-insert was for. `rawPostgresLeaked: false` at runtime; the index
still guards the genuine race.

## §13 — the effective-dating matrix, on deployed behaviour

| condition | result |
|---|---|
| before `effective_start` | no exclusion |
| on `effective_start` | exclusion |
| inside the window | exclusion |
| on `effective_end` | exclusion (inclusive, per shipped doctrine) |
| after `effective_end` | no exclusion |
| historical period inside an ended window | still reports as governed |
| ended, current management state | not live, not endable |
| superseded row | neither applicable nor live |
