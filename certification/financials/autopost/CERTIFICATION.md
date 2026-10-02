# Financials V1 — generated billing auto-post, deployed certification

**Candidate merged:** `55774d91671ecbe924f390b7b0f1ceb1e1310920` (PR #1395, squash)
**Deployed staging SHA:** `55774d91671ecbe924f390b7b0f1ceb1e1310920` — confirmed from
`/api/build-info`, not inferred from the merge.
**Migration applied to staging:** `20261117120000_resolved_obligation_posted.sql`
(`gar_3aee21646b3935`), applied before the new writers reached the deployed runtime, because the
migration WIDENS a CHECK the new code depends on.

Everything below is either a deployed census (`database.read_census`, read-only, artifact-hashed) or
a named test that was planted red before it was accepted green. Where a claim could not be
established on the deployed estate, it says so rather than borrowing a weaker proof.

---

## 1. The production repair

`financial_reduction_applications.billing_period_generation` was made NOT NULL by S2
(`20261115120000`). The shared reduction writer never populated it. Every write through
`applyReductionCore` — vacation credit, policy reduction, manual credit — therefore violated the
constraint from the moment S2 reached a database.

**The defect is deterministic on deployed, not inferred.** The deployed column is
`is_not_null: true` with **no column default** (`deployed-certification.sql` q3). A writer that
omits the column cannot succeed; there is nothing for the database to fall back to.

**The repair is proven by a real write against the same schema.**
`web/tests/financials/live/reductionCoreS2Compatibility.live.test.ts` writes through
`applyManualReduction` — the same entry the `billing.adjust_account` operator action calls — into a
real Postgres carrying the same five migrations the deployed database now carries, and reads the
stored row back out of the database rather than out of the service's return value:

| claim | measured |
|---|---|
| the write succeeds | no NOT NULL violation; one application row |
| generation is populated | `billing_period_generation = "legacy"` |
| populated **truthfully** | `legacy_billing_period_key = "2026-11-02~2026-11-08"` — the key the household's weekly calendar produces, **not** `"2026-11"` sliced off the effective date |
| legacy rows carry no canonical id | `billing_period_id = null`, which is meaningful rather than missing |
| exactly one consequence | a repeated submission returns `idempotent: true`, leaves one application row and one contra charge, and that charge is the same id |
| the contra charge clears its own guard | `billing_period_generation = "canonical"` with a real `billing_period_id`, so `charges_billing_period_childcare_chk` admits it |

**It is not a vacuous proof.** Two controls:

1. *In-suite control.* The pre-repair row shape — every economic field present, generation absent —
   is inserted directly and must be refused `23502` naming `billing_period_generation`. Without this
   the assertions above would pass against a column the database had defaulted.
2. *Planted defect.* Removing `billing_period_generation` from the writer turns all three cases red
   with the exact production error:
   `null value in column "billing_period_generation" of relation "financial_reduction_applications" violates not-null constraint`,
   thrown from `applyManualReduction`. Restored, green again.

### What this proof is NOT

It is a real write through the shared authority against the **deployed schema**, not a write into
the **deployed estate**. Driving `billing.adjust_account` against `staging.workwithalloy.com` was
attempted and refused by this session's own transaction guard, which does not know the estate is
synthetic. Per §18 the limitation is recorded as an evidence limitation and separated from
correctness: the defect is deterministic, the repair is bound by a planted real-Postgres proof, the
regression envelope is green, and the migration is applied. **The deployed estate write-proofs
(§11's estate half, and all of §19) remain owed and need Director authorisation.**

### The defect stranded nothing

Worth stating because the opposite was plausible: `applyReductionCore` creates the contra charge
*before* inserting the application rows that explain it, so a failure between the two would leave
orphan contra charges standing on deployed. It did not.
`historical-35-orphan-contra.sql` q2/q4: of 13 draft and 38 posted reduction-sourced adjustment
charges, **every one has its explaining application row — zero orphans.** The defect was a hard
refusal, not a partial write. No cleanup is owed.

---

## 2. Resolved-obligation vocabulary (§10)

The deployed constraint text, read from `pg_constraint` rather than from a migration ledger — an
`applied` label records that an apply ran, not what the database now says:

```
CHECK ((status = ANY (ARRAY['previewed','drafted','no_charge','superseded','posted'])))
```

All five admitted, `posted` included. Live distribution: 21 obligations, all `drafted`; 0 `posted`,
which is truthful — nothing has auto-posted on deployed yet because no generation has run since the
deploy.

---

## 3. S5 compatibility (§12) — reconfirmed structurally

No CHECK and no trigger forces a correction's billing period to equal its source's.

- The only `source`-mentioning constraint on `charges` or
  `financial_reduction_applications` is `charges_billing_period_childcare_chk`, which requires a
  childcare charge to carry *some* generation other than `not_applicable`. It says nothing about
  equality.
- `enforce_charge_correction_lineage` — the one trigger that could plausibly do it — reads
  `source_charge_id`, `billable_source_type`, `status` and `metadata->>'correction_kind'` and
  **never reads a period column**.
- Positive evidence, not just absence: **9 cross-period corrections already exist on deployed**, a
  correction whose `legacy_billing_period_key` differs from its source's. The S5 shape (closed
  November source → open December correction) is not merely permitted, it is already present.

The repair did not introduce the equality. It writes the reduction's period from the subject's
context and leaves the two free.

---

## 4. Historical 35 — preserved (§15)

Baseline taken pre-promotion on `876dc97c1`; re-censused after merge, migration and deploy:

| | baseline | after |
|---|---|---|
| drafts | 35 | 35 |
| gross | 485226¢ | 485226¢ |
| id digest | `089dc7fce7a12f4d18cbf5203f4a6b82` | `089dc7fce7a12f4d18cbf5203f4a6b82` |
| any `post_attempt` | false | false |
| any `post_gate` | false | false |
| all legacy generation | true | true |

`preserved: true`. Nothing retried, posted, voided or reinterpreted. Charges by status on deployed:
35 draft, 101 posted — no draft moved.

The mechanism, not just the outcome: `shouldRetryPost` returns false for a charge carrying no
`post_attempt` record, and these 35 carry none. They are excluded by construction, not by luck.

---

## 5. Historical 35 — disposition census (§16)

Read-only. Counts and evidence only; **nothing was mutated and nothing was posted.**

The first thing the census corrects is the headline. The 35 are **not** 35 uncollected bills. They
are 22 gross charges and 13 credits that belong against them:

| what | n | cents | obligation | explained by an application |
|---|---|---|---|---|
| tuition (`charge_template`) | 20 | +510500 | 20 `drafted` / `review_status: pending` | — (5 are reduced by one) |
| one-time fee | 1 | +4000 | none | — |
| late-pickup fee | 1 | +2500 | none | — |
| manual credits | 6 | −4024 | none | 6 / 6 |
| policy discounts | 7 | −27750 | none | 7 / 7 |
| **net** | **35** | **+485226** | | |

Common to all 35: `enrollment_agreement`-grain, `billing_period_generation: legacy`,
`ever_billed: false` (a draft reaches no statement and no invoice), `payment_allocations: 0`,
`corrections_of_this_charge: 0`, `equivalent_posted_obligations: 0`, and
`customer_has_canonical_calendar: true` for every one — so none is blocked by the multi-location
cutover question. Two households: `29944d3e` (21) and `e1c9afe0` (14). Created 2026-08-26 →
2026-09-29, i.e. all of them predate S2.

### Grouping

**A — prospective recreation candidate: 20 drafts, +$5,105.00 gross.**
The tuition drafts. Each carries a `drafted` obligation with `review_status: pending` and
`review_required: false` — generated billing that the missing continuation never posted. The
economics are live (agreements active or pending_start, calendar resolvable, no payment, no
supersession, no equivalent posted obligation), and the forward repair now posts this shape
automatically. Evidence sufficiency: **high** — obligation, amount, service date and period key all
present. 11 of the 22 gross drafts have a later non-draft charge on the same spine/type/period, so
each of those needs a duplicate check against its candidate before recreation; that check is the
Director's, and the census names the candidates rather than resolving them.

**B — possible controlled historical remediation: 13 drafts, −$317.74.**
The 6 manual credits and 7 policy discounts. Each is fully explained by its application row, so the
*decision* to reduce is recorded and auditable; only its contra charge never posted. These are
credits, so remediating them moves money **toward** the household — a different risk profile from
group A, and the reason they are separated from it rather than folded in. Evidence sufficiency:
**high** — the application row carries reason, provenance and amount.

**C — duplicate / superseded: 0.**
`equivalent_posted_obligations = 0` for all 35 and `superseded_by_event_id` is null for all 20
obligations. No draft has been satisfied another way. (The 11 superseding *candidates* in group A are
exactly that — candidates on a coarse match, not established duplicates.)

**D — invalid / stale: 0 established.**
No voided row, no correction against any of them, and every household still has a resolvable
calendar. 21 of the 35 sit on agreements whose `person_id` is null, which makes a person-grain
agreement-status read come back empty; that is a *link* gap and not evidence of staleness, so it is
not used to retire anything here.

**E — insufficient evidence: 0 of the 35 for disposition purposes.**
Two fields are absent and neither blocks a decision: `service_id` is null on all 35 (these predate
service-scoped obligations) and `due_date` is null on 15 (a draft has no due date until it posts).

**No group was acted on. No charge was posted, voided, retried or amended.**

---

## 6. Economic-writer regression + its CI binding (§13, §14)

`npm run test:financials-economic-writers` — 23 paths, **62 suites, 779 tests, 0 failures**.
S2-attributable reds: **0**.

`ci-manifest-execution-proof.log` in this directory is the step's **own stdout** from the required
check that ran on the candidate — not a quote of the workflow file:

```
Prebuild gates (route capabilities)  ·  step "Financials economic-writer regression"
run 37072413124 / job 111054677682 on 2eaaad389
Test Files  62 passed (62)
     Tests  779 passed (779)
  Duration  13.21s
```

The two previously measured unrelated red populations (`PRE_EXISTING_AUTHORIZATION_RED`,
`LIVE_FIXTURE_STATE`) remain classified in
`docs/platform/governance/financials-economic-writer-regression.md`. No new failure was absorbed
into either.

---

## 7. W7 and Kelly's testimony (§19) — untouched

`w7-preservation-census.sql` re-run against the final deployed SHA: `preserved: true`.
One row, `result: fail`, `classification: PRODUCT_DEFECT`, at revision `ea596e615`, recorded
2026-10-01T17:25:54Z, observation text still present (122 chars). `core_financials_director_qa`
remains 0 pass / 1 fail / 3 not_run. No PASS written, no scenario advanced, no catalog rewrite.

---

## 8. Multi-location cutover (§1–§4) — returned as decisions

Neither multi-location customer can be initialised deterministically from historical fact
(`cutover-multi-location.sql`):

- **`29944d3e`** — 90 legacy charges, every one monthly-shaped, but it holds an **explicit biweekly**
  customer calendar with 3 open canonical periods. Its configured cadence contradicts its own
  history, so "restate history" and "honour the configuration" give different answers.
- **`50b19065`** — no calendar and **no legacy charges at all**. There is no history to restate, so
  any cadence chosen would be new commercial intent.

Both returned `CUSTOMER_BILLING_CALENDAR_CUTOVER_DECISION_REQUIRED`. Neither blocked promotion, and
neither was configured.

---

## 9. One observation for whoever owns commercial finalization

Not a defect and deliberately not repaired here. A reduction application is written `legacy` with a
period **key**, while the contra charge it creates in the same operation is bound **canonically**
with a period **id** — measured, not assumed, in the live proof. Both satisfy their own guards. But
it means reduction applications are not canonically bound even for a household that *has* a
canonical calendar. Changing that is a commercial-finalization decision, not something to slip into
a production repair, so it is recorded and left alone.

---

## Open items

| item | state |
|---|---|
| §11 deployed **estate** write-proof | owed — blocked by this session's transaction guard |
| §19 deployed auto-post proofs (tuition / one-time / late-pickup / reductions / review-required / failure / retry / attention / manual Add) | owed — same block |
| multi-location cutover for `29944d3e`, `50b19065` | Director decision |
| reduction applications not canonically bound | observation for commercial finalization |
