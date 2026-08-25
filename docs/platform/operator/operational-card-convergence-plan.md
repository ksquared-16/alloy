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

---

## 6. Final pressure-test decisions (2026-08-25)

### 6.1 Financials — two columns, not three peers

Current Period is the primary financial explanation and takes **60%**; Past Due and Payment answer
one related question — *what needs collecting, and how* — and stack in the remaining **40%**. The
arithmetic block is capped at a 380px measure so a label and its amount stay adjacent; at full
column width the stack stopped reading as a sum.

**Action placement follows intent, not convenience:**

| Action | Home | Why |
|---|---|---|
| **Pay now** | inside Past Due | Contextual and primary whenever money is owed |
| **Add charge →** | under Current Period | *"Add something that should be billed"* is a Current Period intent. Quiet, so it never competes with Pay now |
| **Details →** | under Current Period | The card identity supplies the context — not "Financials details" |
| **Manage payment →** | inside Payment | It owns payers, split, methods, autopay and recovery, so it sits under the payment facts, not in a footer |

There is **no separate Manage payers product**. Backend semantics do not require one:
payers, split and methods are all facets of the same configuration.

### 6.2 Add charge — four dates, four columns, no invention

| Operator sees | Canonical column | Decided by |
|---|---|---|
| Service date | `charges.service_date` | template `occurs_on`; overridable only when the template allows |
| Billing period | derived | template `billable_on` |
| Due | `charges.due_date` | configured policy |
| Posting | `charges.posted_at` | the mutation, never the operator |

A future-dated charge is therefore ordinary — a September service date created in August, billable
next cycle. Charge type is the **platform select**, sourced from `financial_charge_templates`,
showing configured labels and never keys. Payer targeting offers only what the template permits
(`default_split` · `operator_selectable` · `single_payer` · `third_party`) and resolves against the
canonical responsibility model; the command builds **no** allocation of its own, and the preview
renders allocation math **only when that split is authoritative**.

### 6.3 Ledger — GL code is canonical, and labels come from the catalog

> **GL code: INCLUDE IT.** `lib/financials/gl/` (`glCodeOptions`, `glConfigService`,
> `glConfigTypes`, `accountTypes`), `accounting/resolveGlMapping.ts`, and tables `gl_accounts`
> (with `code`), `gl_account_mappings`, `gl_journal_entries`, `gl_journal_lines`.
> `resolveGlMapping` answers *"which charge category, which mapping key it posts through, and which
> GL account that mapping resolves to (or that it is unmapped)"* — exactly the ledger column. An
> unmapped category renders **"— unmapped"**, which is an honest state, not a blank.

Type labels come from `chargeCategoryLabel()` in `lib/financials/chargeCategories.ts`. The card
renders no raw key and builds no display map — the catalog already owns the vocabulary.

Detail ledger columns: **Date · Type · Description · GL code · Amount · Status · Source**, grouped
by billing period with prior periods collapsed. Still **no running balance** — `ledger_transactions`
provides none authoritatively.

### 6.4 Work View vs durable stage — proven, not asserted

> `buildOperationalContext` resolves `businessProcess.stageKey` from
> `subjectVm.workspace.lifecycle_rail.current_stage_key ?? stage_context.stage_key` and contains
> **no reference to a work unit or work view**. A lens is structurally incapable of reaching the
> stage.

The one seam a lens can touch is the stage **label** fallback (`stage_label ?? statusLabel`) —
never the key. That asymmetry deserves a guard test.

Rendered proof: the Wright case from **Tour** and from **All** produce an identical stage band,
work line and action set; only the lens chip differs.

### 6.5 Grain — a real gap, by doctrine rather than omission

> `OperationalGrain` declares `"child"` as *"Not yet used in the Focus Panel; reserved for
> child-grain queue row contexts"*, a shipped conformance test asserts *"grain is always 'case' for
> Focus Panel contexts"*, and `operational-grain-doctrine.md` §2.4 states the panel *"always opens
> on an Opportunity"* and that a child selection is a scope hint which *"does not change the Focus
> Panel's grain. The panel is still case-grain."*

**So there is no child-grain Focus Panel today.** Rendering Avery *as the subject* is a platform
change, not a card change.

What the Process card does instead, and what the specimens prove: the case's stage stays
authoritative; each child's own participation projects as supporting context beneath the band; the
scoped child is **emphasised, not substituted**. A waitlisted Avery never rewrites a case at Tour.

> **Gap P2 — child-grain Focus Panel subject.** Requires: `OperationalGrain` to admit `child` for
> the panel, `buildOperationalContext` to accept a child subject, and per-card grain resolution.
> **Recommendation: do not build it for this.** The scope-hint model answers the operational
> question, and the doctrine is deliberate.

### 6.6 Process history — P1, with the grain stated

```
process_stage_history
  org_id · process_instance_id
  subject_type · subject_id          ← the grain, explicitly
  stage_key · stage_label_snapshot
  entered_at · exited_at
  outcome_key
  transition_source                  event | operator | system
  transition_event_id                → workflow_events
```

Derived from the event stream and persisted as a **projection**, not a second authority. Until it
exists the card renders only what events support and **never fabricates an entry date**. It must
not be solved in card state.

### 6.7 Focus Panel shell

**Subject avatar — generic, one model.** `FocusPanelSubjectIdentityBlock` takes
`personSubjectName` / `personSubjectImageUrl` / `personSubjectRecordId`. When a person subject is
present it renders `CardAvatar` — the same primitive the cards use, image with initials fallback;
otherwise it keeps the household tile, which is correct for a family subject. The shell knows the
subject's name and possibly an image; it does **not** know or care whether the person is a child, a
contact or an employee, so a child, a staff member and a contact all work with no per-type code.

**Vertical density — measured, at the shell owner.**

| | Header bottom → first card top | Card width | Side gutter |
|---|---|---|---|
| Before | **37px** | 507px | 16px |
| After | **23px** | 507px | 16px |

Two owners, both shared: the Work-mode scroll container's top padding
(`py-3` → `pt-1 pb-3`, −8px) in `InlineOpportunityFocusPanel`, and
`padding-top: var(--alloy-os-fp-pad-top, 10px)` on
`.alloy-os-focus-panel-grid:not(--work)`, the shared non-Work grid rule (−6px). **Top only** — side
and bottom gutters keep `--alloy-os-fp-pad`, so column widths do not move and no card's internal
spacing is touched. No route-specific override.

> A first attempt put the rule on `.alloy-os-focus-panel-grid--composed` (0,1,0) and silently did
> nothing: `.alloy-os-focus-panel-grid:not(.alloy-os-focus-panel-grid--work)` is (0,2,0) and wins
> regardless of order. Caught by measuring the rendered value, not by reading the file.

### 6.8 Density — combined Process card vs the pair it replaces

| Grain | Old: Journey + What's Next | New: Process card | Saved |
|---|---|---|---|
| Case from Tour | 119 + 348 = **467**, two cards | **221**, one card | −53% |
| Case from All | 467 | 221 | −53% |
| Scoped to Avery | 467 | 221 | −53% |
| Scoped to Riley | 467 | 221 | −53% |

No information lost: stage, status, current work, still-needed, due and actions each appear once.
Recent Activity is deliberately dropped — activity has its own canonical mode. Child divergence is
**added**, and the old pair could not express it at all.

### 6.9 Updated gap register

| # | Gap | Note |
|---|---|---|
| **F0** | No billing-period concept | Derivable from `charges.service_date` + org cadence |
| **F5** | No registered Add Charge action | Thin wrapper over existing services |
| **F1 / F2 / F3** | Autopay unowned · method household-scoped · no split field | Payment zone degrades gracefully |
| **F4** | No authoritative running balance | **Do not build** |
| ~~GL~~ | ~~GL code~~ | **Resolved — canonical, include it** |
| **P1** | No durable stage history | §6.6 |
| **P2** | No child-grain Focus Panel subject | §6.5 — recommend not building |
| **G1** | Expanded body capped at 360px | Still a Director decision |
| **A1 / D1 / B1** | Health grain · document requirements · health facts | See the health contracts |
| **S1 / S2** | Signal config · health visibility permission | Signals must not ship before S2 |

---

## 7. Final pass — density, subject dimension, mixed-grain truth (2026-08-25)

### 7.1 Financials density — one card, existing primitives

**No new density system.** Presentation derives from what the runtime already has:
`FocusPanelCardDensity` (`micro · compact · standard · expanded`) and `FocusPanelCardSpan`
(`1 · 2 · "row"`).

| Placement | density | span | Renders | Height |
|---|---|---|---|---|
| **Compact** | `compact` | `1` | due line · 2–4 charge lines · payment health · Pay now / Add charge / Details | **221px** |
| **Summary** | `compact` | `"row"` | full Current Period / Past Due / Payment | 450px |
| **Detail** | `expanded` | `"row"` | ledger-first, filters, periods | 653px |

The compact card **deliberately does not reconcile**. A card that half-reconciles is the worst of
both; the arithmetic belongs to the summary and the detail.

> **Proof that density changes nothing that matters:** all three read the same
> `FinancialsEvidence`, compute nothing, and expose the same canonical actions. Density selects
> *how many of the card's questions this placement answers* — never ownership, never the
> arithmetic, never which actions exist.

**Recommended default: compact (span 1).** At 221px it sits beside Household (216) and Readiness
(188) without dominating, and answers the question most processes actually ask — *is money owed,
and can I act on it*. **Full-row summary is for billing-heavy contexts only**: at 1023 × 450 it
takes an entire row and its left column runs to dead space unless the operator is genuinely
working the money. Expanded stays behind Details.

### 7.2 Subject and payer are independent dimensions

| Dimension | Question | Values |
|---|---|---|
| **Charge subject** | who or what is this *for* | Household · Avery · Riley |
| **Payer** | who is responsible for *paying* | Jordan · Taylor · Funding |

**Never collapsed.** A charge for Avery may be paid by Jordan; a household charge has no child
subject at all. The detail ledger carries a Subject column and both filters, which compose:
*all activity for Avery* · *Jordan's payments* · *Avery's charges allocated to Jordan* ·
*household-only charges* · *funding applied to Riley*.

Both are **projections over canonical truth, never separate ledgers.**

In Add charge the two are separate inputs: **Applies to** = financial subject, **Charge to** =
financial responsibility, each governed by the template (required · inherited · fixed ·
selectable · overridable).

### 7.3 Read-model resolution, per ledger row

| Column | Resolvable today? | From |
|---|---|---|
| Billing period | ⚠ **derivable, not stored** | `charges.service_date` + org cadence → gap **F0** |
| Operator-facing type | ✅ | `chargeCategoryLabel()` |
| GL code | ✅ | `resolveGlMapping` → `gl_accounts.code`; unmapped is an honest state |
| Status | ✅ | `charges.status` · `payment_statuses` |
| Source | ✅ | `ledger_transactions.provider` / `payments.provider` · charge origin |
| Amount + direction | ✅ | `charges.amount_cents` · `ledger_transactions.direction` |
| **Subject** | ❌ **gap F7** | `charges` has `job_id`, `schedule_id`, `subscription_id` — **no subject column**. A child-specific charge cannot be attributed today |
| **Payer / allocation** | ⚠ partial | `payment_allocations` attributes *payments*; responsibility split for *charges* has no field → gaps **F3 / F6** |

> **F7 is new and it is the one that blocks the Subject filter.** Without a subject reference on
> `charges`, "all activity for Avery" cannot be answered. Smallest fix: a nullable
> `subject_entity_type` / `subject_entity_id` on `charges`, polymorphic exactly as `documents` and
> the proposed `person_health_facts` are — null meaning household-level.

### 7.4 Process card — four layers, and the acceptance answers

```
1  CASE JOURNEY          configured stage spine
2  CASE work + actions   actions whose SUBJECT is the case
3  PARTICIPANT STATE     first-class, at its own grain
4  child-scoped actions  sitting WITH the child they affect
```

| # | Question | Answer |
|---|---|---|
| 1 | Authoritative journey spine | The configured Business Process stages, from `lifecycle_rail` / `stage_context` |
| 2 | Owns current case work | Current Work / stage work runtime |
| 3 | Owns participant state | The child's own process participation — **not** derived from the case |
| 4 | Selected-child scope | The child is **ordered first and emphasised**; the panel's subject never changes |
| 5 | Actions separated by subject | Case actions sit in the case work row; child actions sit **on the child's row** |
| 6 | Changes with Work View | **Nothing.** Configuration may vary an action *recommendation*; stage and participant state cannot vary |
| 7 | Stays identical | Journey, case stage, participant states, canonical actions |
| 8 | Child region disappears | When `participantsLabel` is absent (no participant grain), or collapses to one line when every child matches the case |
| 9 | Process with no participants | Renders layers 1–2 only. **No Enrollment-specific section exists in the component** |

**Lens chip: removed.** The workspace already tells the operator which Work View they are in, and
since a lens cannot change stage or work, the chip restated navigation context at the cost of card
space. It would earn its place only if the lens materially changed the recommendation.

**Scenario results — one implementation, six renders:**

| Scenario | Case | Children | Height |
|---|---|---|---|
| A · from Tour | Tour | Avery Waitlisted · Riley Tour | 297 |
| B · from All | Tour | identical to A | 297 |
| C · scoped to Avery | Tour | Avery first, emphasised | 297 |
| D · scoped to Riley | Tour | Riley first, emphasised | 297 |
| E · divergent | Enrolling | Avery Waitlisted · Riley Enrolling | 297 |
| F · aligned | Tour | collapsed to one line | **228** |

### 7.5 Density comparison — combined vs the pair it replaces

| Grain | Old: Journey + What's Next | New | Saved |
|---|---|---|---|
| Family case | 119 + 348 = **467**, two cards | **297**, one card | −36% |
| Avery-scoped | 467 | 297 | −36% |
| Riley-scoped | 467 | 297 | −36% |
| Children aligned | 467 | 228 | −51% |

The combined card is taller than the previous iteration (221 → 297) because participant state
became **first-class** rather than a chip strip. That is the point: the old pair could not express
child divergence at all, and the chip version understated it. Facts removed: current stage, status,
current work, still-needed, due, actions each appear once; Recent Activity dropped. **Subject
ambiguity: eliminated** — every action now sits with the entity it affects.

### 7.6 Runtime work for the next mission

| Area | Change |
|---|---|
| **Card providers** | Register `financials`, `business_process`, `health_safety`, `care_team`, `staff`, `attendance` in `FOCUS_PANEL_CARD_KEYS`, `FOCUS_PANEL_CARDS`, catalog, `SYSTEM5_CARD_ARCHETYPE`, `focusPanelCardProviders` |
| **Surface config** | Placement + density/span per process context; Financials compact by default |
| **Density/span** | No change needed — `compact`/`expanded` × `1`/`"row"` already exist |
| **Shell** | Subject avatar wiring (done in lab); scoped-child identity line in the header |
| **Commands** | `charge.add` (F5) · child-scoped process actions resolved through the registered action subject model |
| **Read models** | `buildFamilyFinancialsReadModel` · participant process state resolver · `process_stage_history` projection (P1) |
| **Migrations** | F7 subject on `charges` · F3 responsibility split · P1 history · M1 health grain |
| **Tests** | Guard: a Work View cannot alter `stageKey`. Guard: density does not change action availability. Reconciliation invariant |

**Dependency order:** F0 → F7 → F5 → M1 → P1 → G1 decision → F3/F6 → registration per card as its
read model lands.

**Remaining blockers to production implementation:** F7 (subject attribution) blocks the Subject
filter; F0 blocks period grouping; F5 blocks Add charge; P1 blocks journey history; G1 is a
Director decision. Everything else degrades gracefully.
