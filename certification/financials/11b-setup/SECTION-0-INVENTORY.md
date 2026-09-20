---
title: Commercial Setup Productization — §0 inventory before mutation
status: sprint
---

# §0 — what already exists, and what is actually missing

Written before any code, as §0 requires. Every row below was read in the tree or measured on the
deployed build `c1945a04a`; nothing is asserted from the prompt's proposed UX.

**Headline: of the ten product goals, three need no new authority at all, five are orchestration
and presentation over authorities that already exist, and two cannot be built as described without
a provenance-bearing extension that this document specifies rather than assumes.**

---

## A · ASSIGNMENT

| | |
|---|---|
| **Existing authority** | `opportunity_customer_members` (the assignment), `child_enrollment_agreements` (the enrolment), `process_instances` (the journey) |
| **Operator surface** | `OpportunityInquiryChildrenSection.tsx` (1,751 lines, opportunity drawer) and the Focus Panel **Children** card |
| **Write path — link** | `ensureOpportunityCustomerMemberLink` → `POST /api/admin/opportunity-customer-members` — **idempotent**, returns the existing row |
| **Write path — participation** | `patchChildParticipation` → `POST /api/admin/child-participation` → `applyChildParticipationEdit`, which routes to the **process instance** pre-materialization and the **durable model** after. It never writes OCM |
| **Write path — OCM columns** | `PATCH /api/admin/opportunity-customer-members/{id}` — site, program, room, schedule type, start date, notes, outcome status. Guarded: **program without site is refused** |
| **Write path — agreement** | `createChildEnrollmentAgreement`, reached through `materializeChildEnrollment` / `enrollmentAgreementHandoff` / `directEnrollService`, and by `POST /api/admin/child-enrollment-agreements` (`enrollment.decide`) |
| **Read path** | the inquiry-children hydration (`inquiryChildrenHydration.ts`), which merges OCM-linked rows with household children under an `unlinked:` prefix |
| **Configuration** | `location_program_categories` (program, location-scoped), `childcare_schedule_type` option set, locations |
| **WHAT IS MISSING** | **No single assignment "commercial setup" surface.** The facts are authorable across two surfaces and four write paths, and **none of them touches tuition, responsibility or discounts.** An operator completes an assignment and the commercial relationship is still empty |

**Two live constraints the workflow must respect**, both measured this thread: the placement guard
refuses a program without a site *in the same patch*, and an agreement created **after** a price is
accepted only reaches the term because `insertTerm` now back-fills it (`811c544d9`).

---

## B · TUITION

| | |
|---|---|
| **Existing authority** | `program_offerings` → `program_offering_variants` → `commercial_tuition_rates`; `composeCommercialExport`; `resolveAssignmentPricingOptions`; `enrollment_pricing_terms` |
| **Operator surfaces** | `/organization/financials → Tuition` (plans, enrolment commitments, **Billing Frequencies**); `AssignmentTuitionCard` (`billing_preview`) on the Focus Panel |
| **Write path** | `enrollment.pricing.accept` and `enrollment.pricing.override` → `enrollmentPricingTermsService` → `enrollment_pricing_terms` |
| **Read path** | `buildAssignmentTuitionView` / `buildOpportunityTuitionViews` → `/api/admin/financial-config/opportunity/{id}` |
| **Resolution dimensions — measured, not guessed** | program key · attendance type · days-per-week (variant quantity) · location (site rate **supersedes** org default) · payer type · cadence · effective date. Within a cadence the later effective start supersedes; two survivors is **ambiguous** and the resolver refuses to choose |
| **Recommended semantics** | exactly one survivor → `recommended`; more than one → `ambiguous` with `tied[]`; none → `no_match` with a named reason |
| **Override semantics** | **already complete.** Requires the `enrollment.pricing.override` permission AND a reason; the chosen option must still be one the catalog offers this assignment (*"there is no path here that accepts a number"*); records `state: "overridden"`, `override_reason` and `recommended_source_id` |
| **WHAT IS MISSING** | Tuition is not reachable **during** assignment creation — the operator must create, leave, find the Focus Panel, open the card, accept. Nothing else |

**§6 does not trigger its STOP clause.** Override provenance exists and is enforced: permission,
reason, the recommendation it departed from, and the catalog option it chose. It needs productizing,
not extending.

---

## C · RESPONSIBILITY

| | |
|---|---|
| **Existing authority** | `financial_responsibility_arrangements` + `_shares`; `readArrangementInForce` (most specific wins — child beats household); `onDate = net.serviceDate` |
| **Operator surface** | **Manage responsibility** on a charge detail (Focus Panel Details and the Accounts workspace) |
| **Write path** | `billing.configure_responsibility` (account-grain, effective-dated arrangements + shares) |
| **Charge-grain actions** | `billing.resolve_responsibility`, `billing.reallocate_responsibility` — deliberately separate intents |
| **Share methods** | **fixed** is operator-authorable; percentage and remainder are enforced in the authority with **no Core authoring surface** (`SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED`) |
| **WHAT IS MISSING** | Responsibility is only reachable **from a charge that already exists**. There is no way to say who will owe the obligations this commercial relationship is about to create |

---

## D · DISCOUNTS

| | |
|---|---|
| **Existing authority** | `commercial_policies` (kinds `waiver`, `sibling_discount`, `discount`); `resolveFinancialReductions` (pure); `applyFinancialReductions` (period write path); `financial_reduction_applications` (provenance) |
| **Operator surface** | `/organization/financials → Policies` — `CommercialPoliciesPanel` lists the commercial discount policies, and a **separate** "Financial execution policies" panel below it owns proration, billing cadence, due date, posting review and deposits |
| **Eligibility inputs** | household facts read server-side (sibling rank, sibling count, employee household) · the charge **category** · the policy's `applies_to` (tuition / fees / all), `min_siblings`, `applies_to_rank`, `requires`, `max_benefit_cents` · the effective window |
| **Producer independence** | the resolver never learns what produced the gross — a manual tuition charge and a generated one are the same conversation |
| **Application** | `billing.apply_discounts`, period-scoped; preview now states the money |
| **WHAT IS MISSING (two things)** | 1. Nothing answers *"what will apply to this commercial relationship"* **before** a charge exists — every read is charge-grain and retrospective. 2. **There is no exclusion or exception authority at all.** Eligibility is policy params + the category veto; there is no per-assignment, per-household or per-subject suppression, and therefore nowhere to record who suppressed one or why |

---

## E · ADD CHARGE

| | |
|---|---|
| **Existing authority** | `FINANCIAL_TRANSACTION_ACTIONS` → one executor → `/api/admin/actions/execute`; `childIdsFrom` resolves the grain |
| **Operator surface** | `AddChargeCommand.tsx` (424 lines), raised from the Financials card and the Accounts workspace |
| **The two controls today** | **`Applies to`** — a `<select>` of Household + each child, narrowed by the category's code-owned grain rule. **`Also bill`** — a checkbox group of the *other* children, offered only when the category permits child grain, the anchor is a child, and a sibling exists |
| **Payload** | `customer_member_ids` (plural, de-duplicated, order-preserving); singular `customer_member_id` still honoured; `subject_grain: "household"` is the explicit household statement |
| **Economics** | entered amount is **per child** — N children produce N independent obligations, each with its own discount, responsibility, ledger row, GL and identity |
| **Idempotency** | per-child, through the charge resolution key |
| **WHAT IS MISSING** | Nothing in the model. The gap is presentational: two controls express two dimensions and read as implementation history |

### The trap in §13, named before it is built

The two controls are **not** history. `Applies to` is the **grain**; `Also bill` is a **widening**.
The container's own comment states the hazard §15 independently forbids:

> *"Anchored at the household the control is absent BY DESIGN: a household charge is reached by
> naming NO child, and offering checkboxes there would invite an empty selection to mean
> 'household', which is precisely the ambiguity the grain model forbids."*

So a single multi-select must carry **Household as an explicit, mutually exclusive option**, and
must keep both category grain rules (a household account fee cannot become a child's; a child's
tuition cannot become the household's). A control that lets an empty selection mean household would
recreate the exact defect Core designed out, and would do it in the surface that spends money.

---

## F · PREPAID

| | |
|---|---|
| **Existing authority** | unapplied POSTED payment — **there is no wallet table**. `lib/financials/prepaid/availableFunds.ts`; only `posted` is available, and pending / processing / requires-action / failed / voided / unknown are excluded, failing toward do-not-offer |
| **Read path** | `buildFinancialsCardVM` → `adaptFinancialsVmToFinancialsCard` |
| **Operator surfaces** | Focus Panel **Summary** card and **Details** card. Rendered under `data-testid="available-prepaid"`, and **silent at zero** by design |
| **WHAT IS MISSING** | **`FinancialsAccountWorkspaceDetail.tsx` does not render it.** An operator working in Financials → Accounts — the wider account workspace — never sees the available position. Kelly's "prepaid is not visible" has a real basis, and it is one surface, not the doctrine |

Zero-silence is correct and must not be replaced with a permanent empty row.

---

## G · BILLING PERIOD

| | |
|---|---|
| **Existing authority** | `lib/financials/billingPeriod.ts` — `billingPeriodFor`, `billingPeriodKeyFor`, `assignmentBillingPeriods`, `isPeriodBillableCadence`. Weekly periods tile from the **agreement anchor**; monthly keys stay `YYYY-MM` |
| **Derived from** | accepted commercial terms + cadence + anchor. **Derived, never stored, never configured** |
| **Visible today** | charge detail (`Billing period September 2026`), the generation preview (each period named, e.g. `Sep 29–Oct 5`), the charges list, the account workspace detail |
| **Operator-configurable authority** | **none, and correctly none** |
| **WHAT IS MISSING** | `AssignmentTuitionCard` — the surface that owns the accepted cadence — **never states a period**. Three operator questions are unanswered there: what period is this assignment in, what is the next one, and what will Generate Tuition create for it |

**Accounting Period is separate** and stays separate: attributed by the database at write time
against the accounting calendar. Where both appear they are already labelled distinctly.

---

## The two things that cannot be built as described

### 1 · Discount exception (§11) — needs a provenance-bearing extension

There is no exclusion authority. Per §11 I am not building an unattributed Boolean, and per the
platform rule I am not building a second opinion about a commercial policy. The **smallest
compatible extension**:

- a scoped, effective-dated **policy exception** record naming the policy, the subject it excludes
  (assignment / child / household), who authorised it, when, and **why** — reusing the effective
  dating and snapshot discipline `financial_reduction_applications` already has;
- read by `resolveFinancialReductions` as one more eligibility input, returning a **named**
  `NotEligibleReason` (`excluded_by_exception`) so the ledger can still say why nothing applied;
- authored through a registered action, never a UI flag.

Until that exists, the assignment surface can **show** discount truth and must not offer to change it.

### 2 · Discount forecast during assignment (§10) — needs a subject-grain read

`resolveFinancialReductions` is pure and takes a `GrossObligation`. Answering "what will apply to
this relationship" before any charge exists needs a **read-only projection** that evaluates the same
policies against the assignment's facts and a hypothetical tuition gross — the resolver reused, not
re-implemented, and returning the same `applied` / `not_eligible` reasons the ledger uses.

---

## Proposed sequencing

1. **Presentation-only, no new authority** — the Add Charge single multi-select with explicit
   Household (§13–§16); prepaid on the Accounts workspace (§18); billing period on the tuition card
   (§20).
2. **Orchestration over existing authorities** — tuition selection and acceptance during assignment
   creation, and responsibility setup, both calling the registered actions with partial-completion
   honesty (§3–§9, §23–§24).
3. **The two extensions above**, each returned for approval before implementation (§10–§11).
4. **Discoverability** — whether "Policies" is the word an operator looks for when they want
   "Discounts" (§17). The configuration exists and is reachable; this is naming and IA, not an engine.
