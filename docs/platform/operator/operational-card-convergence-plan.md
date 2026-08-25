---
owner: operator
status: draft
last_reviewed: 2026-08-25
supersedes: []
---

# Operational cards — backend / runtime convergence plan

The card family is designed. This document maps each approved surface onto the systems that
already exist, names what is missing, and orders the work. **It proposes no parallel UI-specific
model.** Where a card needs truth, it consumes the canonical owner or the gap is listed.

Design authority: [`operational-card-visual-audit.md`](./operational-card-visual-audit.md) ·
[`child-health-information-architecture.md`](./child-health-information-architecture.md) · the
Local Design Lab at `/dev/operational-card-lab`.

---

## 1. Financials

### 1.1 What exists

| Concern | Owner | State |
|---|---|---|
| Charges | `charges` — `charge_type` (service·fee·adjustment), `status` (draft·posted·partially_paid·paid·void), `amount_cents`, `service_date`, **`due_date`**, `posted_at`, `voided_at` | ✅ |
| Charge lines | `charge_line_items` | ✅ |
| Charge semantics | `CHARGE_CATEGORIES` — tuition · deposit · consumable_fee · late_pickup · one_time · fee · discount · credit · adjustment · **subsidy_offset** | ✅ |
| Ledger | `ledger_transactions` — `occurred_at`, `type`, `direction` (in·out), `amount_cents`, `customer_id`, `provider` | ✅ |
| Payments | `payments` (+ `posted_to_ledger_at`), `payment_statuses` | ✅ |
| Allocation | `payment_allocations` — `target_entity_type`/`id`, `allocated_amount_cents`, `allocation_type`, `reversed_at` | ✅ |
| Payment method | `customer_payment_methods` — brand, last4, `is_default` | ⚠ household-scoped |
| Charge configuration | `financial_charge_templates` — `trigger_type` (**manual**·event·attendance·schedule), `amount_strategy` (fixed·rate_derived·usage_derived·attendance_derived·manual), `occurs_on`, `billable_on`, `responsibility` (household·employer·third_party·agency) | ✅ |
| Charge services | `createChildcareDraftCharge` · `recalculateDraftCharge` · `postChildcareCharge` · correction (`reversal`·`credit`·`replacement`) | ✅ |
| Rates | `childcare_rate_plans`, `childcare_rate_rules`, `commercial_tuition_rates`, `resolveRate` | ✅ |

### 1.2 The read model the cards need

**One projection, `buildFamilyFinancialsReadModel(customerId, period)`**, owned in
`lib/financials/`, not in the card. It computes exactly the reconciliation the cards render:

```
grossCharges        Σ charges  status='posted'  category ∈ {tuition,deposit,consumable_fee,
                                                            late_pickup,one_time,fee}
reductions          Σ charges  category ∈ {discount,credit,adjustment}
funding             Σ charges  category = subsidy_offset
familyResponsibility = grossCharges − reductions − funding
paymentsReceived    Σ payment_allocations against those charges, minus reversed_at
currentBalance      = familyResponsibility − paymentsReceived
pastDue             Σ over charges where due_date < today, unpaid remainder
ledger              ledger_transactions ∪ payments, grouped by billing period
```

**`subsidy_offset` is a charge category, not a payment** — this is the single most important
semantic in the whole area. Subsidy reduces *responsibility*; payments reduce *balance*. The card
shows both totals and never collapses them.

### 1.3 Gaps

| # | Gap | Blocks | Smallest fix |
|---|---|---|---|
| **F0** | No billing-period concept | Period grouping, "current period", period close | A period resolver over `charges.service_date` + org billing cadence. Derivable — no new table required |
| **F1** | Autopay has no owner (no table, no column) | Payment zone autopay state, next scheduled charge | A payment-preference row on the customer |
| **F2** | `customer_payment_methods` is household-scoped | Per-payer method | Add a payer reference |
| **F3** | No responsibility split (`billing_responsibility` is a composition group with `defaultFieldKeys: []`) | The 70/30 split; payer attribution filters | A payer-responsibility record |
| **F4** | No authoritative running balance | Running-balance column | **Do not build for the card.** The detail deliberately omits it and says why |
| **F5** | **No registered Add Charge action** | Add charge | An action definition wrapping the existing services |
| **F6** | Payer attribution of payments/ledger rows | The payer filter in detail | `payment_allocations` can carry it; needs F3 first |

### 1.4 Add Charge — the specified capability

Everything except the action definition exists.

```
operator intent      "Add a charge to this account/child"
subject              customer (household) or customer_member (child), per template.responsibility
configuration        financial_charge_templates row, trigger_type = 'manual'
required inputs      DERIVED from the template, never hardcoded:
                       amount_strategy=fixed  → amount locked to the template
                       amount_strategy=manual → operator supplies the amount
                       billable_on            → default due date
                       responsibility         → who is billed
                       requires child / note  → per template
eligibility          existing action contract: { eligible, blockers[], requiredInputs[] }
preview              recomputed read model — balance before → after
canonical mutation   createChildcareDraftCharge → postChildcareCharge
event                charge posted → workflow_events
projection refresh   Financials summary + detail re-read the read model
```

**No card-local writes**, and no fee definitions duplicated into the card.

### 1.5 Order

**F0 → F5 → F3 → F6 → F1/F2.** The period resolver unblocks everything the summary renders; Add
Charge is the highest-value capability and is a thin wrapper; responsibility split unblocks payer
attribution; autopay and per-payer methods are last because the Payment zone degrades gracefully
without them.

---

## 2. Health & Safety

### 2.1 Convergence

```
Enrollment / Forms / Participant Runtime      collection
        ↓
Processing / Trust                            interpretation, evidence, approval
        ↓  RelatedRecordProposal
Canonical health truth
   field_values @ customer_member  ·  person_health_facts  ·  documents
        ↓
Requirement evaluation  (stageRequirementsV1, pinned revision)
        ↓
Health & Safety summary → detail → Safety Signals
```

Full ownership matrix, entity shape, mutation model and Trust contract:
[`child-health-information-architecture.md`](./child-health-information-architecture.md).

### 2.2 Gaps

**A1** health fields bind to `enrollment` not `customer_member` (small) · **D1** `kind: "document"`
not authorable (medium — `public.documents` already exists, so this is an evaluator plus a
`doc_type` catalog) · **B1** no `person_health_facts` entity, provider or capability (large).

### 2.3 Safety Signals

```
canonical health fact → configured signal eligibility → permission / context evaluation
                      → Safety Signal projection
```

A projection, never a copy, and never a generic tag. Configuration decides which fact **types**
project and to which surfaces — child header, Attendance, roster, check-in/out, Meals. Each
surface renders only what is configured for it: Meals sees dietary, the roster does not.

**Only the minimum operationally useful fact is revealed** — "Peanut allergy · severe", never the
medical note behind it.

| # | Gap | Note |
|---|---|---|
| **S1** | Signal eligibility configuration has no owner | Sits alongside the health-fact type configuration; depends on B1 |
| **S2** | Health visibility is not a field-level permission | The permission-evaluation step is specified but not enforceable today. **Until S2 lands, signals must not ship** — the projection would bypass a policy that does not exist |

---

## 3. Business Process card

### 3.1 Composition, not merger

| The card shows | Owner |
|---|---|
| Ordered stages, current stage, labels | Business Process configuration / `RecordLifecycleRailModel` |
| Current work, work line, due | Current Work / stage work runtime |
| Still needed | Readiness |
| Actions | The registered action registry for that stage |

The card derives nothing and owns nothing. **No process branching in the component** — Enrollment,
Assignment and Billing render through the same code from configuration alone, which the three
specimens demonstrate.

### 3.2 Redundancy removed

| Fact | Journey | What's Next | Combined |
|---|---|---|---|
| Current stage | ✔ | ✔ | once — the band's current column |
| Status | — | ✔ | once — the work band's micro-label |
| Current work | — | ✔ | once |
| Still needed | — | ✔ | once |
| Due | — | ✔ | once, on the work line |
| Actions | — | ✔ | once |
| Recent activity | — | ✔ | **removed** — activity has its own canonical mode |

Journey 119 + What's Next 348 = **467px across two cards**. The combined card is **195–216px**,
one card — roughly a 55% saving, and one fewer card in the composition.

### 3.3 The history constraint

**No durable stage-history store exists.** Past entry and completion dates come from mutation
events. The card must never fabricate a date, and a skipped stage can only ever be rendered as an
inference, never as an assertion.

> **Gap P1 — a durable process-stage-history projection.** Stage entry, exit, outcome, skip and
> reopen, derived from the event stream and persisted as a projection. **It must not be solved by
> storing history inside the card**, and until it exists `View process →` can only show what the
> events support.

### 3.4 `View process →`

The same card at `density="expanded"` — the existing Focus Panel expand pattern, not a separate
Process History product. It would carry complete stage history, outcomes, skipped and reopened
history, requirement completion, transitions and event provenance — all of it gated on P1.

---

## 4. Cross-cutting

| # | Gap | Affects |
|---|---|---|
| **G1** | Expanded card body is capped at `min(360px, 45vh)` and scrolls | Both detail surfaces, and Household / Children equally. **Platform decision** |
| **G2** | Nothing is registered | Every candidate. Registration is the first step of implementation, not of design |

---

## 5. Recommended sequence

1. **F0** billing-period resolver + `buildFamilyFinancialsReadModel` — unblocks the whole
   Financials surface, and is derivable from existing tables.
2. **F5** Add Charge action definition — thin wrapper over services that already exist.
3. **A1** re-bind health fields to `customer_member` — cheap, and every later health decision
   inherits the wrong grain otherwise.
4. **P1** process-stage-history projection — unblocks Journey history and `View process`.
5. **G1** decide the expanded-body cap.
6. **D1** authorable document requirements.
7. **F3 → F6** responsibility split, then payer attribution.
8. **B1** `person_health_facts` — the largest, and correctly last.
9. **S2 → S1** health visibility policy, then Safety Signal configuration.

Registration onto real Surfaces happens per card as its read model lands — never as a batch, and
never ahead of the truth it projects.
