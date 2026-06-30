# Operational Consumption × Commercial Operating System — Integration Doctrine

**Status:** Proposed core integration doctrine — **build-state verified against `origin/staging @ 9a2887287` (2026-06-30)**
**Date:** 2026-06-30 (verification pass same day)
**Bridges:** Operational Truth / Operational Consumption ‖ [Commercial Operating Model](commercial-operating-model.md)
**Mandate:** Define the *contract* between what happened operationally and what is owed commercially. Do not redesign either system. This is the final architecture bridge before implementation resumes.

> **Governing question:** *Given everything that happened operationally today, what commercial obligations should now exist?*
> The entire doctrine is the machine that answers that question — deterministically, reviewably, and without ever posting on its own.

---

## ✅ Build-state verified (read first)

An earlier draft of this doctrine carried a caveat that it was authored in a stale worktree and could not confirm the pipeline machinery. **That caveat is now resolved.** The worktree was synced to `origin/staging @ 9a2887287` and a read-only code+migration audit confirmed: **the pipeline is real and largely built — not a sketch.** This doctrine's stage names map directly onto shipped code (see §3a and the matrix in §11).

**Headline:** Fact → Candidate → Event → Obligation → Draft Charge is **built and integrated** across childcare enrollment, schedule, and attendance facts, including **multi-obligation fan-out per event** and a **per-obligation draft charge** write. The resolver is a pure function over a **data-driven rule registry** (`consumption_event_types`), exactly as doctrine intends. **Posting / Finalize is *partially* built** (a draft→posted status-flip primitive exists; the authoritative ledger/GL write for enrollment charges and the review→approve gate do not). The remaining frontier is the review→approve bridge + generalized Posting, **multi-*payer* split (confirmed absent)**, the BOS layer beyond the review gate, and operator-facing commercial config (the Tuition Grid). See §11 for the verified matrix and the real next batch.

> Note: there is prior OC doctrine on staging — `docs/sprints/06_2026/operational_consumption_v1..v4.md` and `docs/platform/operational-truth-flow-doctrine.md`. This integration doctrine is consistent with them and the shipped slices; it is the *bridge* layer, not a competing design.

---

## 1. Operational Consumption review (what Operations already knows)

Operational Consumption is the system of record for **what actually happened**. Its facts are commercially *neutral* — they describe reality, not money.

| Operational fact | Substrate (verified on staging) | Status |
|---|---|---|
| Lifecycle events (enrollment/opportunity status, job actions, schedule created, payment succeeded/failed, charge posted, GL posted) | `workflow_events` via `emitEvent()` | **Built** |
| Schedules / assignments / tours | `schedules`, `assignments`, `tour_bookings` | **Built** |
| Enrollment commitment | `child_enrollment_agreements`, `child_placements` | **Built** |
| Recurring schedule pattern | `schedule_patterns`, `schedule_assignments` → `interpretSchedule()` | **Built** |
| Attendance (check-in/out, late pickup, absence, room transfer, no-show, drop-in) | `child_attendance_events` (append-only) → `interpretAttendance()` | **Built** |
| Expected vs Actual (committed schedule vs attended) | `interpretSchedule()` (Expected) × `interpretAttendance()` (Actual) | **Built** |

**The invariant to preserve:** A **Fact** is a record of operational truth. It is emitted once, immutably, via `emitEvent` into `workflow_events`. It carries `event_type`, `entity_type`, `entity_id`, `payload`, `occurred_at`. **Facts do not know about money.** Everything commercial is *derived* from them downstream. (Per the Operational Facts verdict: facts already exist as `workflow_events` + `emitEvent` — **converge, do not rebuild**.)

---

## 2. Commercial Operating System review (what Commerce needs)

The Commercial Operating Model defines what is sold, bought, and funded. From it, this integration needs exactly four inputs to resolve any fact:

1. **The Enrollment context** — which commitment this child holds (Program + Schedule + Session + Enrollment Type), i.e. the **Expected**.
2. **Pricing** — the Pricing Matrix (for commitments) and catalog prices (for Fees/Add-Ons).
3. **Funding** — Source / Payer / Allocation, to split an amount across payers.
4. **Policies** — the rules to apply (proration, vacation, deposit, late fee, …).

And it produces exactly one output type the operational side must feed: an **Obligation** (amount owed, per payer, for a reason, on a date) → which becomes a **Charge** (`charges.status='draft'`).

**The contract is therefore narrow:** Operations supplies *Facts + Enrollment context*; Commerce supplies *Pricing + Funding + Policies*; the integration layer turns the first into Obligations using the second.

---

## 3. The integration pipeline (canonical)

The prompt proposed *Fact → Consumption Rule → Commercial Resolution → Obligation → Draft Charge → Posting*. The existing system uses the nouns *Fact → Candidate → Event → Obligation → draft Charge*. **These are the same pipeline** — the prompt named the *transitions* (verbs), the existing system named the *states* (nouns). Unified:

```
 FACT ──[Consumption Rule]──▶ CANDIDATE ──[Commercial Resolution]──▶ EVENT ──▶ OBLIGATION ──▶ DRAFT CHARGE ──[Finalize]──▶ POSTED
 (workflow_events)            (prospective,              (priced, attributed,   (per payer)    (charges.status   (human-only)  (ledger,
  immutable truth              not yet priced)            billable)                             ='draft')                      silent)
```

### The stages, defined

| Stage | Kind | Definition | Owner |
|---|---|---|---|
| **Fact** | state | An immutable operational truth (`workflow_events`). Commercially neutral. | Operations |
| **Consumption Rule** | transition | Reads the Fact against the **Enrollment context (Expected vs Actual)**; decides *whether* it is commercially relevant and *what it consumes*. Emits zero or more Candidates. | Integration |
| **Candidate** | state | A prospective obligation — "late pickup of 15 min on Enrollment X." Not yet priced. **Reversible / ignorable.** | Integration |
| **Commercial Resolution** | transition | Applies **Pricing + Funding + Policies** to a Candidate. Produces Event(s) and their Obligation(s). | Commerce |
| **Event** | state | A confirmed, priced, attributed billable occurrence. | Commerce |
| **Obligation** | state | Amount owed, **per payer**, for a reason, on a date. **The convergence point of all commerce.** | Commerce |
| **Draft Charge** | state | The Obligation made reviewable (`charges`, status `draft`). | Billing |
| **Finalize** | transition | **Human-only.** Draft → Posted; ledger entry; invoice. | Operator |
| **Posted** | state | Recognized in the ledger/GL. **Silent** — operator sees "Invoice sent." | Accounting |

### 3a. The stages mapped to shipped code (verified on staging)

The doctrine's stages are not aspirational — each maps to a concrete artifact on `origin/staging`:

| Stage / transition | Shipped artifact | Path |
|---|---|---|
| **Fact** | `workflow_events` + `emitEvent()` | `web/lib/emitEvent.ts` |
| **Consumption Rule** + interpreters | `resolveConsumption()`, `interpretAttendance()`, `interpretSchedule()` | `web/lib/operationalConsumption/` |
| **Candidate** | `ConsumptionCandidate` (runtime-only type, by design) | `web/lib/operationalConsumption/consumptionTypes.ts` |
| **Event** + rule registry | `consumption_events` + `consumption_event_types` (12 seeded keys, e.g. `attendance.late_pickup`, `schedule.recurring_tuition`) | `supabase/migrations/20260706120050_operational_consumption_foundation.sql` |
| **Commercial Resolution** | `resolveChargeFromTemplate()` (templates) + `resolveFinancialPolicy()` (policies) | `web/lib/financials/chargeLifecycle/`, `web/lib/financials/policies/` |
| **Obligation** | `resolved_obligations` (11 obligation kinds, `responsibility_key`, `draft_charge_id`) | same foundation migration |
| **Draft Charge** | `charges` (`draft`/`posted`/…), `charge_line_items`; generators `upsertPrimaryDraftServiceCharge`, `childcareChargeService` | `web/lib/pricing/`, `web/lib/financials/` |
| **Finalize / Posted** | **partially built** — status-flip `postChildcareCharge()` exists (no ledger/GL); legacy JE writer `postCashEvent.ts` (payments/payouts); `billableSource.ts` generalizes substrate — see §11 | `web/lib/financials/childcareChargeService.ts`, `web/lib/admin/postCashEvent.ts` |

This is the literal payoff of "bind, don't branch": the **rule registry is a configuration table** (`consumption_event_types`), so a new fact type is a seed row binding `event_key → charge_template_key`, not a new pipeline.

### Two laws of the pipeline
1. **The pipeline never posts autonomously.** Its terminus is always a **Draft Charge** awaiting a human **Finalize**. No fact, rule, or BOS suggestion ever reaches `posted` without a person. This is the same invariant as the Commercial doctrine's "the operator's last verb is Finalize."
2. **Expected drives the recurring bill; Actual drives the variance bill.** A committed Enrollment generates its periodic tuition Obligation from the **Expected** schedule *regardless of attendance* (you pay for the seat). **Actual** facts only ever produce *additional* metered Obligations (overage, à-la-carte) or, via policy, *credits*. Under-attendance never silently reduces a commitment — only an explicit policy (vacation/credit) can.

---

## 4. Operational Fact → Commercial outcome mapping

Every Fact resolves to exactly one outcome. The outcome vocabulary:

- **None** — commercially irrelevant; no Candidate.
- **Draft Obligation** — a Candidate that resolves into a Draft Charge on the next billing run (most metered usage).
- **Immediate Charge** — a Draft Charge created now, out of cycle (still draft; "immediate" = doesn't wait for the periodic run).
- **Future Charge** — an Obligation dated to a future point (a later cycle / event date).
- **Policy Review** — routes to a policy evaluation (and often a human/BOS review) before any obligation exists.

> Note: even "Immediate Charge" lands in `draft`. *Nothing* bypasses Finalize (Law 1).

| Operational Fact | Consumption Rule reads… | Outcome | Why |
|---|---|---|---|
| **Enrollment approved** | new commitment | **Immediate Charge** (Registration, Deposit) **+ begin periodic** tuition schedule | Registration/deposit are enrollment-triggered; tuition is the recurring commitment |
| **Check-in / Check-out** (normal) | Actual = Expected | **None** | Baseline attendance; the seat is already billed via Expected |
| **Meal consumed** | à-la-carte usage | **Draft Obligation** (per-meal Add-On) | Pure-actual metered consumption |
| **Late pickup** | Actual pickup vs Expected, threshold | **Draft Obligation** (Late Pickup Fee) *if over threshold* | Variance beyond commitment; threshold is a policy in the rule |
| **Extra time / extra day** | Actual > Expected | **Draft Obligation** (metered) | Overage beyond the committed pattern |
| **Drop-in day used** | drop-in Enrollment Type | **Draft Obligation** (per-day) | Consumption-priced commitment |
| **Punch-pass unit consumed** | prepaid balance | **None** + **balance decrement**; at zero → **Policy Review / BOS renew suggestion** | Already paid; no new obligation until depleted |
| **Field trip scheduled** | future calendar event | **Future Charge** (dated to trip) | Obligation exists but is dated forward |
| **Schedule changed** | Expected changes mid-cycle | **Policy Review** (Proration) → credit and/or new matrix cell | Commitment changed; proration must evaluate |
| **Room transfer — same Program** | Program unchanged | **None** | Room is operational; price follows Program, not Room |
| **Room transfer — crosses Program** | Program (price) changes | **Policy Review** (Proration + re-resolve matrix) | A room change matters commercially *only* when it's also a Program change |
| **Excused absence / vacation** | within allowance? | **Policy Review** (Vacation Credit) | May yield a credit Obligation or nothing |
| **No-show — committed seat** | commitment still owed | **None** | Absence doesn't reduce a commitment |
| **No-show — drop-in reservation** | reserved capacity lost | **Draft Obligation** (No-show Fee) *if policy* | Reserved transaction was consumed |
| **Withdrawal** | end of commitment | **Policy Review** (Withdrawal notice + Refund + Deposit) → final Charge and/or Refund | Multi-policy; needs evaluation before money moves |
| **Payment succeeded/failed** | financial fact (not operational) | handled in **Money** domain | Not a consumption fact — see §6 |

**Challenge applied:** The room-transfer split is the sharpest expression of the doctrine's commercial/operational ownership separation — a room move is commercially *silent* unless it crosses a Program boundary. And the late-pickup vs late-payment distinction (§6) keeps two "late" concepts in two different domains.

---

## 5. Policy consumption — *where* each policy is consumed (not configured)

A policy is **configured** at a definition scope (Org → Location → Program → Enrollment) but **consumed** at a specific pipeline point, by a specific evaluator, against specific facts. This is the runtime half of the Commercial doctrine's "definition-scope × application-point."

| Policy | Consumed at (pipeline point) | Evaluated by | Trigger fact |
|---|---|---|---|
| **Billing cadence** | The **periodic billing run** | Billing scheduler | The cycle clock + Enrollment commitment |
| **Proration** | **Commercial Resolution** | Resolver | Mid-cycle change facts (enrollment start, schedule change, withdrawal, cross-program transfer) |
| **Vacation / absence credit** | **Consumption Rule → Policy Review** | Resolver + operator | Absence facts vs allowance |
| **Deposit** | **Commercial Resolution** at enrollment; re-evaluated at withdrawal | Resolver | Enrollment approved; Withdrawal |
| **Refund** | **Policy Review** at withdrawal | Operator + resolver | Withdrawal, against payments made |
| **Late fee (payment)** | **Money / Collections** domain | Collections | Charge-aging fact (`due_date` passed, unpaid) — *financial*, not operational |
| **Late pickup fee** | **Consumption Rule** | Resolver | Attendance check-out vs expected — *operational* |
| **Discounts** | **Commercial Resolution** | Resolver | Present on the Enrollment; applied each resolution |
| **Adjustment approval** | **Finalize / review gate** | Operator (governance) | A draft Charge flagged for approval |
| **Posting review** | **Finalize** | Operator (governance) | Draft Charges presented for review |

**Doctrine:** Policies are consumed at **five points** — Consumption Rule, Commercial Resolution, the Billing run, the Finalize gate, and the Money domain. Two policies that look alike (late *pickup* vs late *payment*) are consumed in *different domains against different fact types*. Keeping them apart is the test of getting policy consumption right.

---

## 6. Scheduling consumption — what Commercial consumes from Scheduling

Commercial does **not** consume minute-by-minute scheduling. It consumes only the **commitment** and **changes to it**.

| Scheduling concept | Commercial consumes it as… |
|---|---|
| **Expected Schedule** (committed pattern) | The **basis of the recurring obligation** — selects the matrix cell, sets the periodic tuition amount |
| **Attendance Pattern** | The matrix row → the price |
| **Temporary Schedule** | A **proration / adjustment** for the temporary window (Policy Review) |
| **Schedule Change** | **Proration** + re-resolve the matrix cell |
| **Drop-In** | A per-occurrence **Draft Obligation** |
| **Pack (punch)** | A **balance decrement**, not a new obligation, until depleted |
| **Unlimited** | A **flat** commitment — schedule changes don't change price |

**Doctrine:** *Commercial consumes the Expected schedule as the recurring basis, and consumes changes to it as proration triggers.* Nothing finer is needed.

---

## 7. Attendance consumption — what Commercial consumes from Attendance

| Attendance fact | Commercial impact | Policy impact | Charge impact |
|---|---|---|---|
| **Check-in** | None (baseline) | — | — |
| **Check-out** | None directly | Feeds late-pickup threshold | — (unless late) |
| **Extra time / late pickup** | Variance over commitment | Late Pickup Fee policy + threshold | Draft Obligation if over threshold |
| **Meals** | À-la-carte usage | Meal Add-On config | Draft Obligation (per-meal) |
| **Usage / consumables** | À-la-carte usage | Add-On config | Draft Obligation (metered) |
| **Excused absence** | Possible credit | Vacation/credit policy | Credit Obligation or None (Policy Review) |
| **No-show** | Commitment unchanged (committed) / capacity lost (drop-in) | No-show policy | None (committed) / Draft Obligation (drop-in) |
| **Room transfer** | None, unless crosses Program | Proration (only if cross-program) | None / re-resolve (cross-program) |

**Doctrine:** Attendance is overwhelmingly **commercially silent** — its job is to *confirm the Expected baseline* and to *surface variance*. Only variance (overage, à-la-carte, threshold breaches) and policy-bearing absences produce obligations.

---

## 8. Charge Templates — when they fire

A Charge Template = *what it charges* + a **trigger binding** that subscribes it to a source. The trigger binding is the integration seam.

| Trigger binding | Fires on… | Example |
|---|---|---|
| **Manual** | Operator action | Ad-hoc charge |
| **Enrollment Event** | A lifecycle Fact | Registration on `enrollment approved`; Deposit |
| **Schedule (periodic)** | The billing-run clock | Recurring tuition; monthly meal plan |
| **Consumption / Attendance** | A metered Fact | Late pickup, per-meal, drop-in |
| **Calendar / Future** | A scheduled future date | Field trip |

**Doctrine:** Charge Templates fire from **all** sources — they *declare* their trigger, and the binding attaches them to a Fact type, the billing clock, or manual entry. This is precisely how "every future Scheduling/Attendance/Billing feature plugs in without inventing concepts": a new feature emits a Fact; a Charge Template (or Consumption Rule) binds to that Fact type. No new pipeline — just a new binding.

---

## 9. BOS participation

BOS participates **everywhere up to the Draft Charge**, and **nowhere past it**.

| BOS role | Where | Example |
|---|---|---|
| **Suggestions** | Configuration + Candidate stage | Pre-fill matrix from benchmarks; suggest renewing a depleted punch pass |
| **Anomalies** | Draft Charge review | Flag a tuition charge 3× normal; flag a missing periodic charge; flag an enrollment with no funding |
| **Policy warnings** | Policy Review | Surface withdrawal/schedule-change/over-allowance facts needing evaluation |
| **Future charges** | Visibility | Surface upcoming obligations (field trips, scheduled rate increases) |
| **Recommendations** | Finalize gate | Recommend approve/hold per anomaly score |

**Hard invariant:** **BOS operates only up to the review gate. The transition Draft → Posted is exclusively a human Finalize.** BOS proposes; the operator disposes. There is no autonomous posting, ever. (This is Law 1, restated for the agent layer.)

---

## 10. Future-industry validation

The contract — *Fact → Consumption Rule → Candidate → Commercial Resolution → Event → Obligation → Draft Charge → Finalize* — survives every industry; only fact types and policies differ.

| Industry | Fact | Consumption Rule reads | Resolution applies | Obligation(s) |
|---|---|---|---|---|
| **Childcare** | Late pickup | Expected pickup vs actual | Late-pickup fee + funding split | Family (+ agency) |
| **Medical** | Procedure performed | Authorized vs delivered | Fee schedule + insurance split + copay | Insurer + patient |
| **Fitness** | Class attended | Member vs drop-in | Membership (flat) or drop-in price | Member (+ corporate benefit) |
| **Trades** | Hours/materials logged | Contract vs actual | Rate card + warranty split | Customer (+ warranty co.) |
| **Prof. services** | Hours logged | Retainer cap vs actual | Hourly rate over cap | Client |
| **Hospitality** | Incidental / booking consumed | Reserved vs used | Folio price | Guest (+ corporate account) |

**The "Expected vs Actual" engine is universal:** authorized-vs-delivered (medical), contract-vs-actual (trades), retainer-cap-vs-actual (prof. services) are all the same Consumption Rule shape. The contract holds.

---

## 11. Verified build-state matrix & next batch

### 11a. Status matrix (verified on `origin/staging @ 9a2887287`)

| Capability | Status | Evidence |
|---|---|---|
| **Fact layer** | **Built** | `workflow_events` + `emitEvent()` (`web/lib/emitEvent.ts`) |
| **Candidate** | **Built** (runtime-only by design) | `ConsumptionCandidate` (`consumptionTypes.ts`) — not persisted, intentional |
| **Event + rule registry** | **Built** | `consumption_events`, `consumption_event_types` (12 seeded keys); foundation migration `20260706120050` |
| **Consumption Resolver** | **Built** | `resolveConsumption()` (pure fn) + data-driven registry (`web/lib/operationalConsumption/`) |
| **Obligation generation** | **Built** | `resolved_obligations` (11 kinds, `responsibility_key`, `draft_charge_id`); `obligationFromChargeIntent()` |
| **Draft Charge generation** | **Built** | `charges` + `charge_line_items`; `upsertPrimaryDraftServiceCharge`, `childcareChargeService` |
| **Charge Template consumption** | **Built** | `financial_charge_templates` (`trigger_type` ∈ manual/event/attendance/schedule); `resolveChargeFromTemplate()` |
| **Financial Policy consumption** | **Built** | `resolveFinancialPolicy()` (proration, late_fee, deposit, vacation, cadence) consumed at runtime |
| **Attendance fact integration** | **Built** | `child_attendance_events` (append-only) → `interpretAttendance()` |
| **Schedule fact integration** | **Built** | `schedule_patterns`, `schedule_assignments` → `interpretSchedule()` + `prorateAmountCents()` |
| **Enrollment as first-class** | **Built** | `child_enrollment_agreements` (+ `child_placements`); one active row per child per site |
| **Draft Obligation Review → Approve gate (Batch A0)** | **Built (end-to-end)** | Schema: Slice 4 `review_status` ∈ {pending, review_required, reviewed, suppressed, stale}, `reviewed_at`/`reviewed_by`/`suppression_reason`. Service: `obligationReviewService.ts` (`listResolvedObligations`, `getObligationDetail`, `reviewObligation` mark_reviewed→reviewed / flag / suppress / restore / recompute→stale). API: `app/api/admin/financial/consumption/obligations/route.ts` (role-gated, org-isolated, review-only). UI: `app/adminV2/finance/obligation-review/page.tsx`. Review-only — never posts/ledger. "Reviewed" = eligible for future Finalize. |
| **Multi-obligation fan-out per event** | **Built** | `previewScheduleConsumption` / `previewAttendanceConsumption` loop `interpretation.directives` → many obligations; `draftConsumption` drafts a charge **per obligation** (`consumptionService.ts`) |
| **Multi-*payer* split (one amount → co-pay + agency)** | **Absent** | Each obligation carries exactly one `responsibility_key` (`chargeIntent.responsibilityKey` → `eventType.default_responsibility_key` → hardcoded `"household"`); **no allocation engine** divides one amount across payers. Fan-out today is by obligation *kind*, not by payer. |
| **BOS participation (beyond the gate)** | **Partially built / verify** | Review gate exists (Slice 4); BOS *suggestions / anomaly detection / Finalize recommendations* layer **not confirmed** |
| **Finalize / Posting** | **Partially built** | Status-flip primitive `postChildcareCharge()` exists (draft→posted, immutability, corrections via `source_charge_id`) but writes **no ledger/GL** (its own header: "NOT Posting … arrives in later P3 batches"). Legacy `postCashEvent.ts` **does** write balanced `ledger_transactions`+`gl_journal_entries` for payments/payouts (separate path). `billableSource.ts` generalizes the substrate so enrollment charges can post through the same pipes. Not yet wired to the consumption pipeline or an obligation-review→approve gate. |
| **Operator commercial config (Tuition Grid)** | **Not assessed / separate track** | Rate/template/service config exists (`financial_services`, `financial_charge_templates`, `rateConfigService`); the operator-facing **Tuition Grid** UX is a separate commercial-config concern, not part of this pipeline |

**The prior batch plan is obsolete.** What it called the "keystone to build" — the Consumption Resolver — and Batches 1–5 (resolver, enrollment, attendance/schedule facts, periodic + metered obligations) are **already shipped** as Slices 1–4 plus the enrollment/attendance foundations. The pipeline is complete **through Draft Charge**.

### 11b. The real next batch

Ordered by what is actually missing and load-bearing:

Posting is **not** greenfield — the direct read found it is *partially* built, so Batch A splits into a small bridge then the real write:

| Batch | Deliverable | Why now |
|---|---|---|
| **A0 — Obligation review → approve gate** | ✅ **DONE.** Operators list/triage obligations and mark them **reviewed** (the frozen vocabulary's "approve"), suppress (reversible), restore, or recompute — review-only, no posting. Service + role-gated API shipped in `e3e647cc3`; the operator UI (`app/adminV2/finance/obligation-review/page.tsx`) + an audit-metadata test added in this batch. "Reviewed" obligations are flagged `eligibleForPosting`. | Was the precondition for Finalize; now satisfied. |
| **A1 — Generalized childcare Posting (ledger/GL)** | Extend the existing JE writer (`postCashEvent.ts`) to post `enrollment_agreement` charges through `billableSource.ts`, emitting balanced `ledger_transactions` + `gl_journal_entries` from the `gl_mapping_key` already on the draft charge's metadata. | The status-flip (`postChildcareCharge`) and the JE-writing pattern (`postCashEvent`) **both already exist** — they're just not joined for enrollment charges. This is composition, not invention. |
| **B — Multi-*payer* split** | A Funding allocation step that turns one resolved amount into *multiple* obligations with distinct `responsibility_key` (family co-pay + agency + employer). | **Confirmed absent** (not just unverified): every obligation is single-responsibility, often hardcoded `"household"`. Subsidy/corporate need this. The fan-out machinery (many obligations per event) already exists — this adds a *payer* axis to it. |
| **C — BOS participation layer** | Anomaly flags on Draft Charges, policy-review warnings, Finalize recommendations — strictly up to the gate (Law 1). | Review gate exists; the *intelligence* on top of it does not. |
| **D — Operator commercial config (Tuition Grid)** | The operator-facing authoring surface for the Pricing Matrix / rates that the resolver already consumes. | Separate track from the pipeline, but the operator's day-one experience (per the Commercial doctrine §10). |

**A0 is now complete.** Recommended next batch: **A1 — Generalized childcare Posting.** It makes Posting *authoritative* by joining two pieces that already exist (`postChildcareCharge`'s status flip + `postCashEvent`'s balanced-JE writer) over the generalized `billableSource` substrate, driven by the `gl_mapping_key` the draft charge already carries, gated on `review_status='reviewed'` (the A0 gate). Before A1, verify GL account mappings exist for enrollment charge categories. A1 stays inside Law 1: Posting is still operator-initiated (Finalize), never autonomous.

---

## 12. Final recommendations

1. **Adopt one pipeline, with reconciled vocabulary:** Fact → (Consumption Rule) → Candidate → (Commercial Resolution) → Event → Obligation → Draft Charge → Finalize → Posted. Verbs are the prompt's; nouns are the existing system's; they are the same machine.
2. **Hold the two laws:** never post autonomously (terminus = Draft Charge), and Expected drives recurring while Actual drives variance.
3. **The Consumption Resolver already exists and is the keystone** — `resolveConsumption()` over the data-driven `consumption_event_types` registry is the single place where Facts meet Pricing/Funding/Policies. Do not rebuild it; *bind to it*. The next authoritative work is **Posting / Finalize** (§11b, Batch A), the one place the pipeline currently dead-ends.
4. **Keep Facts commercially neutral.** `workflow_events` records truth; all money is derived. New operational features emit Facts and never reason about charges.
5. **Consume policies at their correct point** (§5) — and never confuse a *financial* fact (charge aging → late payment fee) with an *operational* fact (check-out → late pickup fee).
6. **Bind, don't branch.** A new Scheduling/Attendance/Billing/Subsidy/Reporting feature plugs in by emitting a Fact type and binding a Rule or Charge Template to it. If a future feature requires a *new pipeline stage*, that is the signal the model is wrong — revisit this doctrine, don't fork it.
7. **BOS up to the gate, human at the gate.** Suggestions, anomalies, warnings, recommendations — then a person Finalizes.

> **The answer to the governing question** — *given everything that happened today, what should be owed?* — is now mechanical: replay the day's Facts through the Consumption Resolver; it emits Candidates; Resolution prices, funds, and applies policy; Obligations become Draft Charges; the operator Finalizes. Every future feature that touches money is just another Fact flowing through this one contract.
