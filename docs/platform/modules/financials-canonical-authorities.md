---
owner: modules
status: canonical
last_reviewed: 2026-09-19
supersedes: []
---

# Financials — the canonical authorities

**Status:** current as of the Thread 11A **Core freeze**. Section 7 is mounted-certified;
Core Financials feature work is complete and Payments is the next program.
**Purpose:** name the single owner of every core financial concept, so a lane that needs one
**finds it instead of building a second one.**

This document exists because the failure mode in this domain is not ignorance, it is *duplication*.
Every concept below already has an owner. A second discount engine, a second prepaid wallet, a
second allocation path, a second child filter, a second charge writer or a second responsibility
model would each be a defensible-looking local decision and a platform-level defect. The rule is:

> If you cannot express the behaviour through the authority named here, report the smallest
> compatible extension to it. Do not build a parallel mechanism.

---

## 0. The Core financial lifecycle — four layers, four owners

Everything else in this document is a detail of this shape. The layers are **separate acts with
separate owners**, and collapsing any two is the mistake that cannot be undone later.

```
ACCEPTED COMMERCIAL TERM   →  GROSS OBLIGATION
        owner: enrollment_pricing_terms (accepted via enrollment.pricing.accept)

COMMERCIAL REDUCTION POLICY →  REDUCTIONS  →  NET OBLIGATION
        owner: commercial_policies → applyFinancialReductions → financial_reduction_applications

RESPONSIBILITY              →  WHO OWES THE OBLIGATION
        owner: financial_responsibility_arrangements + _shares

PAYMENT / ALLOCATION        →  HOW MONEY SETTLES IT
        owner: payments + payment_allocations
```

**Recurring generation and commercial reductions are two governed acts over the same Billing
Period**, not one chained operation. `billing.generate_tuition` produces the gross;
`billing.apply_discounts` reduces whatever gross that period holds. Do not chain them merely because
a human exercises them in sequence — chaining would make the reduction a property of generation, and
a manually added tuition charge would then be discounted by a different path than a generated one.

Each layer may be run, previewed and audited on its own, and each answers a question the others do
not:

| Layer | Answers | Does NOT answer |
|---|---|---|
| Accepted term | what was agreed | who owes it |
| Reduction | what the organisation's rules take off | who owes it, who paid |
| Responsibility | who owes it | who paid, what it is for |
| Payment | how it was settled | who owes it |

---

## 1. The five identities that must never collapse

These are distinct questions with distinct owners. Conflating any two is the single most expensive
mistake available in this domain, because the resulting data cannot be un-merged later.

| Identity | The question | Owner |
|---|---|---|
| **Financial subject** | What/whom is this financial event *for*? | `charges.billable_source_*` → child agreement or household; projected as `subjectMemberId` |
| **Responsible party** | Who *owes* some or all of it? | `financial_responsibility_arrangements` + `_shares` |
| **Payer** | Who actually *supplied* the money? | `payments` / `payment_allocations` |
| **Payment method** | *How* the money was supplied or collected? | `payment_provider_*`, collection attempts |
| **Prepaid / deposit balance** | Money *held* before it is applied to an obligation | unapplied posted payment — see §6 |

**Never infer payer from responsibility.** A grandparent may pay an obligation a parent owes.
**Never infer responsibility from subject.** A household charge may be owed by one of two parents.

### `subjectMemberId: null` means HOUSEHOLD GRAIN

It does **not** mean unknown, missing, or not-applicable. A charge whose billable source is the
household has no child agreement, so it resolves to `null` *deliberately*, rather than being
attributed to a child who did not incur it.

Reading `null` as "missing" is what produced the defect this thread repaired twice.

---

## 2. Subject scope — ONE predicate

**Owner:** `web/lib/adminV2/runtime/focusPanel/financials/financialsRowScope.ts`

```
rowInFinancialsSubjectScope(row, scope)

  "all"        → every row
  "household"  → ONLY rows with subjectMemberId == null   (the deliberate narrow view)
  <memberId>   → that child's rows AND the household's, MINUS siblings
```

A child scope is an **attention context**: it says which child the operator is working on. It does
not turn a household financial account into a child's account. Asking for the household *by itself*
is a different question, which is why `household` is the one scope that is narrower than the
account.

**Both** consuming surfaces read this and only this:

- Focus Panel → Financials → Details
- Financials Workspace → Accounts (`lib/financials/workspace/accountLenses.ts`)

`accountLenses.subjectTokenOf` still exists and is **not** a second predicate: it answers which
filter *option* a row contributes to, which is a different question from which rows a filter
*selects*. Conflating those two is precisely what broke the Workspace.

Derived, same file: `compactPayableRows` (scope ∩ current period ∩ `offersPayment`) and
`ledgerPayableRows` (scope ∩ `offersPayment`, every period). Compact may only settle the current
period; the ledger crosses periods deliberately.

---

## 3. The six time identities

Not interchangeable. `charges` carries four dates and each answers a different question.

| Identity | Owner | Notes |
|---|---|---|
| **Service / effective date** | `charges.occurs_on` (template `occurs_on_strategy`) | when the chargeable event happens |
| **Billing period** | derived from `charges.billable_on` | `lib/financials/billingPeriod.ts` — see the gap in §9 |
| **Invoice / bill date** | `charges.billable_on` (template `billable_on_strategy`) | `immediate` \| `offset_days` \| `next_billing_cycle` |
| **Due date** | `charges.due_date` | **no template strategy** — see the gap in §9 |
| **Payment date** | `payments.received_at` | when money actually arrived |
| **Accounting period** | `financial_accounting_periods` | via `financial_accounting_calendars`, ≤1 active per org |
| **Accounting period close** | `financial_accounting_periods.status` | `open` \| `closed` — *not* a synonym for posted |

**`POSTED != ACCOUNTING PERIOD CLOSED`.** Posting is a charge lifecycle state; closing is an
accounting calendar state.

**`BILLING PERIOD != ACCOUNTING PERIOD`.** A commercial period may cross accounting boundaries.
Journal attribution follows the accounting calendar, never the billing period boundary. Periods
within one calendar cannot overlap (GiST exclusion constraint); different calendars may freely cover
the same days, which is how monthly parent billing coexists with a 4/4/5 reporting calendar.

Why `billable_on` and not `posted_at`: `posted_at` records when someone pressed post, so a September
charge posted late in October would move to October and silently change a closed period's totals.
Why not `occurs_on`: a field trip occurring in September but billing next cycle belongs to the cycle
that bills it.

---

## 3.1 Billing period identity — the interval, not the month

**Owner:** `lib/financials/billingPeriod.ts`.

### 3.1.0 Two levels, and the string that joins them

This document previously described the billing period as simply *derived*, which is true of the
**instances** and wrong about the **rule**. There are two levels and a product that conflates them
cannot be configured coherently.

| Level | What it is | Where it lives | Who authors it |
|---|---|---|---|
| **Billing frequency** | the recurrence RULE — Weekly, Monthly, and whatever else an organisation authors | `billing_cadences` option set; surfaced by `TuitionBillingFrequenciesPanel` | **configured** by the organisation |
| **Billing period** | the resulting commercial INTERVAL — `Sep 15–21`, `September 2026` | `lib/financials/billingPeriod.ts` | **derived**, never authored |

The chain is:

```
configured billing frequency        Weekly
  ↓ selected by
accepted commercial term            $185 / week   (enrollment_pricing_terms.cadence_key)
  ↓ anchored at
agreement anchor                    the earliest accepted term's effective_start — Sep 1
  ↓ derives
billing period instances            Sep 1–7 · Sep 8–14 · Sep 15–21 · …
```

Nobody authors `Sep 15–21`. Asking an operator to do so would be asking them to maintain by hand
what the anchor and the cadence already determine, and the first hand-entered period that
disagreed with the tiling would be a period nobody signed.

**The join is a string, and it is not validated.** `billingFrequencyItemKeyFromLabel` mints the
cadence key from whatever label was typed, so an organisation can author `fortnightly`, attach it
to a tuition plan and have an assignment accept a term on it. `billingPeriodFor` knows five
cadences; `fortnightly` is not one. The money stays safe — `previewTuitionGeneration` and
`generateTuitionCharges` both gate on `isPeriodBillableCadence` and refuse rather than invent an
interval — but the configuration surface used to say nothing, so the operator met silence.

`billingRecurrenceFor` closes that: the Billing Frequencies screen states the recurrence the
**derivation authority** will actually produce for each configured frequency, and says plainly when
it will produce none. It is a report of `billingPeriodFor`'s behaviour, not a second opinion about
it, so configuration cannot drift from the periods the platform derives.

### 3.1.1 Period identity

A billing period is a **commercial interval**. Its identity carries its boundaries:

| Cadence | Key | Label |
|---|---|---|
| monthly | `2026-09` *(unchanged)* | September 2026 |
| weekly | `2026-09-21~2026-09-27` | Sep 21–27, 2026 |
| biweekly | `2026-09-21~2026-10-04` | Sep 21–Oct 4, 2026 |
| crossing a year | `2026-12-28~2027-01-03` | Dec 28, 2026–Jan 3, 2027 |

**Monthly is unchanged byte-for-byte.** `YYYY-MM` is what every existing resolution key, stored
`service_period`, ledger grouping and `<input type="month">` already holds. A monthly commercial
period *is* the calendar month, so it ignores the anchor.

**Weeks are not ISO weeks.** Periods tile from the **agreement's own anchor** — the earliest
accepted term's `effective_start` — so one tenant's week runs Mon–Sun and another's Thu–Wed, and
both are right. A shared calendar would impose a boundary nobody signed.

**`hourly` and `per_session` have no interval.** They price a unit of usage; `isPeriodBillableCadence`
is how a caller finds out before assuming, and generation refuses rather than inventing a month.

Labels **derive from boundaries** (`billingPeriodLabel`), never from the key. `placeInBillingPeriod`
takes an optional commercial grain and stays **monthly by default**, because every existing caller
groups by calendar month and a ledger that silently regrouped would restate history.

One tiling, called twice: `assignmentBillingPeriods` is shared by generation **and preview**, so a
preview cannot show four weeks and then create five.

### 3.0.9 Discounts, the Add target, and prepaid

**DISCOUNT POLICY** — the organisation's commercial rule, authored in
`/organization/financials` → Policies and owned by `commercial_policies`.

**DISCOUNT FORECAST** — a read-only prediction for one commercial relationship.
`forecastAssignmentReductions` asks the three readers the application path asks — `readPolicies`,
`resolveHouseholdEligibility`, `resolveFinancialReductions` — over the ACCEPTED tuition for the
current period, and writes nothing: no reduction application, no charge, no adjustment, no ledger
row. It decides no eligibility of its own, because a forecast that reasoned independently would be
a second opinion about money and the first disagreement with the ledger would be unattributable.

The forecast asks about a **calendar month** even when the commercial period is weekly: reductions
resolve per month, and the month it names is the one the application path will resolve the same
charge under. That is what makes the two answers comparable.

**DISCOUNT EXCEPTION** — *not* an enable/disable Boolean. `discount_enabled = false` would say "no
discounts here" about every policy at once, for all time, with nobody's name on it, and would
silently suppress any policy authored later. An exception names one policy, one commercial
relationship, an effective window, an operator and a reason, and supersedes rather than mutating.
It is scoped by `opportunity_customer_member_id` — the same through-line an accepted pricing term
uses — so no second "assignment id" concept exists for discounts.

**UNIFIED ADD TARGET** — one control answering "who receives this charge": Household explicitly, or
one or more children, mutually exclusive. An empty selection is **never** Household; that ambiguity
is why Household is a value rather than the absence of ticks, and Confirm is unavailable until a
target is chosen. Category grain still governs what is offered.

A SUBJECT IS A CHILD, not an agreement. A child with a closed enrolment beside a live one has one
entry in the target, carrying the active agreement as its billable source.

**PREPAID** — posted, unapplied money, available to allocate. It is a separate account position
from Current Balance and is never netted into it; zero is silence, never `$0.00`. The same
canonical projection feeds Focus Panel Summary, Focus Panel Details and Financials → Accounts.

**PREPAID IS NOT A DEPOSIT.** No surface may label it one. Held money has a lifecycle — taken,
held, forfeited, refunded, applied — that this platform does not model, and calling available
prepaid a deposit would promise it. `DEPOSIT_OPERATOR_PRODUCTIZATION_GAP` belongs to Payments.

### 3.1.3 The accounting period lifecycle

**Owner:** `financial_accounting_calendars` + `financial_accounting_periods`;
`lib/financials/accounting/accountingCalendarService.ts` is the only writer, reached through
`POST /api/admin/financials/accounting-calendar` (`fin.write`).

| act | who | what it does |
|---|---|---|
| Adopt | operator, `fin.write` | creates the org's single active calendar and materialises twelve calendar-month periods from `calendarMonthPeriods`, all open |
| Close | operator, `fin.write` | sets `status`, `closed_at`, `closed_by` on one period. Nothing else. |
| Reopen | — | **not supported in V1.** No authority exists and none is offered; a closed period shows no control. |

**Closing is not a refusal.** This is the rule most likely to be "corrected" by someone who
assumes otherwise, and doing so would let a closed month stop a nursery billing its families.
`attribute_financial_journal_entry` decides every entry's period from `effective_on`:

| situation | result |
|---|---|
| no active calendar | `period_attribution = 'no_calendar'` — a complete history carrying no period |
| no period covers the date | refuse `accounting_period_unavailable` |
| the covering period is **closed** | **defer** to the earliest later open period, stamping `accounting_period_deferred` and the date it came from |
| closed and nothing later is open | refuse `accounting_period_closed` |

> A CLOSED PERIOD DEFERS; IT DOES NOT REFUSE. Refusing would make a REPORTING boundary able to
> block an OPERATIONAL act: a family could not be charged, or a cheque could not be recorded,
> because the books were closed. Books close after the fact and money does not wait for them.

**What close checks, and what it does not.** It checks the period exists and is open, and it
warns when closing the last open period, because that is what turns the deferral into a refusal.
It does **not** check reconciliation, posting review or draft work: no platform doctrine makes any
of them a close blocker, and drafts are not journal entries — they carry no attribution at all, so
an unposted charge cannot be "in" the period being closed.

**History is stable.** `enforce_accounting_period_boundaries_frozen` refuses any change to
`starts_on`, `ends_on`, `period_key` or `calendar_id` once entries are attributed — *"open a new
period instead"*. `status` is deliberately outside that guard, which is what makes closing a
period with history possible at all. Closing re-attributes nothing.

### 3.1.2 Billing period is not accounting period

Two configured period systems, two instance levels, and they are allowed to disagree:

| | Configuration | Instance |
|---|---|---|
| **Commercial** | billing frequency (`billing_cadences`) | billing period — `Sep 29–Oct 5` |
| **Accounting** | accounting calendar (`financial_accounting_calendars`, style `calendar_month` / `four_four_five` / `custom`) | accounting period (`financial_accounting_periods`) — `October 2026` |

A weekly billing period of `Sep 29–Oct 5`, invoiced Sep 29, due Oct 9, paid Oct 3 and attributed to
accounting period `October 2026` is an ordinary arrangement, not a contradiction. Deriving one from
the other collapses two identities a 4/4/5 calendar exists to keep apart.

Attribution is decided by the `attribute_financial_journal_entry` BEFORE INSERT trigger, never by a
service — a rule the service owns is a rule a second writer can skip. A **draft** obligation has no
accounting period yet and says so rather than displaying one it has not reached.

## 3.2 Invoice date and due date

| Date | Owner | Configured by |
|---|---|---|
| Invoice / bill date | `charges.billable_on` | template `billable_on_strategy` (`immediate` / `offset_days` / `next_billing_cycle`) |
| Due date | `charges.due_date` | **`financial_policies` type `due_date`** |

Four due strategies, each computable from a date the charge already carries: `on_invoice`,
`days_after_invoice`, `on_period_start`, `days_after_period_start`.

*Fixed day of the month* was evaluated and deliberately excluded: it is month-shaped and meaningless
for a weekly organisation, and `days_after_period_start` expresses the same intent for every cadence
(offset 0 = the first day of the period).

**An unconfigured organisation is unchanged.** `resolveDueDate` returns `null`, meaning *leave the
due date alone* — never "due today". An unknown stored strategy is **reported, not guessed**.

`Billing Period Oct 1–31, invoiced Sep 25, due Oct 1` is an ordinary arrangement and is supported;
the dates are separate columns and separate identities.

## 3.3 Subject grain — two layers that cannot contradict

**Owner:** `lib/financials/chargeCategorySemantics.ts` (code-owned, beside `CHARGE_CATEGORIES`).

```
CATEGORY   declares what is semantically PERMITTED     CHILD | HOUSEHOLD | CHILD_OR_HOUSEHOLD
TEMPLATE   may select, default or NARROW within it
```

A template may say a field trip is always child-grained. It **may not** say tuition is
household-grained: `narrowSubjectGrain` returns `contradicts_category` and **refuses**, rather than
picking a winner, because either answer would be a guess about whose money a charge is.

Why code and not a table: `CHARGE_CATEGORIES` is a code-owned invariant, and "tuition is for a
child" is what tuition *means*, not a preference a tenant may invert.

**There is no `CHILD_OR_MULTIPLE_CHILDREN`.** Multiple children is an *operation* producing
independent child-grained rows. A stored grain meaning "several children" would be a row whose money
belongs to nobody in particular, and every per-child question asked of it afterwards would have no
answer.

## 5.1 Discount eligibility is an intersection

```
a discount applies ONLY IF   the discount policy permits this charge/category/subject
                      AND    the charge category permits discounting
```

The policy half is `policy.params.applies_to` (`tuition | fees | all`). The category half is
`chargeCategorySemantics(...).discountable`. Neither side can override the other.

Refused as **incoherent**: `discount`, `credit`, `adjustment`, `subsidy_offset` — a reduction of a
reduction is not something any reconciliation can explain.

**Business opinion is deliberately not encoded.** `late_pickup` *is* discountable at the category
layer. "Late fees are never discounted" is a belief many organisations hold and some do not, so the
tenant's own policy decides. `category_not_discountable` is reported separately from
`category_not_covered`, because "this kind of charge cannot be discounted" and "your policy does not
cover this" are different conversations with an operator.

## 6.1 The prepaid position — unapplied is not available

**Owner:** `lib/financials/prepaid/availableFunds.ts`. A projection over existing money; it computes
no money of its own.

| Bucket | Meaning |
|---|---|
| **available** | posted, inbound, not refunded, not allocated — the only figure fit to be offered |
| **pending** | the platform has been *told* about money it does not have |
| **held** | deposit-restricted — **`heldSupported: false`**, see below |

Anything not explicitly `posted` fails toward *do not offer it*: the cost of under-reporting is an
operator asking a question; the cost of over-reporting is money applied that never arrived.

**Held deposits are not invented.** The `deposit` policy carries `amount_cents` and `refundable`,
but nothing marks an individual receipt as held, so the platform cannot tell a held deposit from
ordinary prepaid money. It reports `heldCents: 0` **with `heldSupported: false`** — saying plainly
that the zero is an absent capability, not a measurement. Silently classifying every deposit as
spendable would let an operator spend a refundable deposit by accident.

**Deposit vs prepaid — the decision:** they are **one money spine with policy metadata over it**,
not two stores. A refundable held deposit and an account credit balance are the same unapplied money
under different policy. A distinct financial object would only be justified if the accounting
lifecycle genuinely diverged, and it does not.

**Current Balance excludes unapplied money**, and that is the *existing* doctrine, not a new rule:
`balance = responsibility − payments` sums only what was **applied**. So prepaid funds do not move
Current Balance and do not reduce Due until allocation. `owes $0 with $200 prepaid` and
`balance −$200` therefore stay two different facts, distinguishable at rest.

**Application stays manual/governed.** `payment_allocations` is the only application mechanism;
nothing auto-applies.

## 3.4 Multi-child Add — one gesture, N obligations

**Owner:** `charge.add` (`financialChargeActions.ts`), via `executeMultiChildAdd`.

`customer_member_ids` (plural) selects one or more children; the singular `customer_member_id` still
works unchanged. Selection is **de-duplicated**, so a double-clicked checkbox cannot bill twice.

Two children at $40 produce **two independent $40 child-attributed charges**. The amount is **per
child** and is never divided across the selection — splitting an entered amount would invent a price
nobody quoted. The preview states both numbers: *$40 per child · 2 children selected · Total to
create $80*.

**Batch idempotency authority — the one that already exists.** No batch key, no batch table. Each
charge goes through `writeTemplateDraftCharge` → `tpl:<template>:<occurs_on>:<scope>`, enforced by
`charges_resolution_key_unique` scoped to the billable source. Two children are two billable sources,
so a re-run **converges on the same two charges**. A batch-level key would be a second idempotency
authority, and the two would disagree the first time an operator retried a partial batch with one
child removed.

**No rollback, deliberately.** Where no review boundary applies these charges *post*, and posted
childcare money is immutable by trigger — undone by a reversing entry, never a DELETE. Unwinding a
partial batch would mean fabricating reversals for money the operator never saw. Instead: every
subject resolves **before** any charge is written, failures are named per child, the successes stay
real, and the retry converges. A failed *post* does not unmake a charge — it is a draft the operator
can post from the row.

**Grain rules apply unchanged** (§3.3): a CHILD-only category requires at least one child; a
HOUSEHOLD-only category offers no child selection; blank selection never silently means household.

**Adjustments** inherit the source transaction's grain — Wrigley's charge cannot become Lennon's
adjustment. Standalone adjustments follow their category's permitted grain and may use the same
selection primitive.

**Discounts evaluate per resulting child.** Each child's obligation is its own gross charge, so
`resolveFinancialReductions` runs per child with that child's own eligibility facts — one sibling
may receive 10% and the other nothing, and each reduction keeps its own subject identity and
provenance. Reduction idempotency is `fred:<policyId>:<chargeId>`, and the charge is already
child-specific, so a retry cannot double-reduce.

**Responsibility is not part of Add.** The resulting obligations enter the existing responsibility
model normally and are independently inspectable in Details.

## 6.2 Rendering the prepaid position

Projected into the read model as `vm.prepaid` by `resolveAccountPrepaidPosition`; **no component
computes it**. A card summing unapplied cents itself would be a second answer to "what may this
family spend", and would get the *pending* case wrong.

**Zero is silence.** The adapter sends `null`, never `"$0.00"`, so an ordinary account carries no
prepaid metric — the same density rule that removed Autopay from the metric strip.

**Compact decision: an indicator, yes.** It earns its line on the `Unassigned` precedent — the test
is whether a fact changes what the operator *does*. Due may read $150 while the family has already
handed over $200 that is merely unallocated; without the line the card says *collect $150* about
someone who owes nothing in cash terms. It is an indicator only: **no Apply, no Manage deposit, no
allocation controls** — applying money is Details' work through `payment_allocations`.

**Apply Payment is reused, not replaced.** There is no "use prepaid" writer. Available funds are
applied through the canonical allocation path, which leaves payer identity unchanged and does not
alter responsibility merely because money moved.

**An absent capability is not a zero.** `heldSupported: false` is never rendered as "$0 held" —
locked by test, because the claim would let an operator spend a refundable deposit believing none
was held.

---

## 4. Recurring billing — the lifecycle, arrow by arrow

There **is** a recurring billing engine. Do not write a second scheduler or generator.

| Arrow | Owner |
|---|---|
| assignment / agreement | `child_enrollment_agreements` |
| → commercial terms | `enrollment_pricing_terms` (accepted terms; may be an **override**) |
| → billing cadence | `financial_policies` type `billing_cadence`; option set `commercial_billing_cadence` |
| → billing period | `lib/financials/billingPeriod.ts` |
| → is it due, at what price | `lib/financials/tuitionGeneration/resolveTuitionRecurrence.ts` (pure) |
| → generation | `lib/financials/tuitionGeneration/generateTuitionCharges.ts` |
| → operator trigger | registered action `billing.generate_tuition` (`fin.write`), with preview |
| → consumption → obligation → charge | `lib/operationalConsumption/consumptionService.ts` → `resolved_obligations` → `writeTemplateDraftCharge` |
| → discount resolution | `lib/financials/reductions/*` (§5) |
| → responsibility | `financial_responsibility_arrangements` (§7) |
| → settlement | `childcarePaymentService` + `payment_allocations` (§6) |
| → journal attribution | `financial_journal_entries` + `financialJournalService` (§3) |

**Generation does not re-price from the catalog.** The accepted term is the money. A generator
pricing from today's catalog would bill a family a rate they never agreed to, and would let a
catalog edit change what an already-agreed family owes.

**It refuses rather than guessing.** Two terms covering one period → `overlapping_terms`. A partial
period with no configured proration policy → `proration_policy_required`. Billing a whole month for
a fortnight is not a default; it is a guess with somebody's money.

### The accepted price outranks the charge template

`resolveAmount` in `resolveChargeFromTemplate` returns the **accepted** amount when one is present,
before it consults `amount_strategy` at all.

This is not a tidy-up. A charge template says HOW tuition posts — its category, its GL mapping, when
it occurs, when it becomes billable, whether it needs review. It has no second opinion about WHAT
THIS CHILD AGREED TO PAY. A tenant whose tuition template was `fixed` at $400.00 billed **every**
generated obligation $400.00 while the families had accepted $185.00 a week and $1,450.00 a month —
silently, on every charge, because the accepted price arrived as `resolvedAmountCents`,
indistinguishable from a catalog rate hint.

**A number cannot carry its own authority.** `acceptedAmountCents` is the authority: present means a
commercial contract already decided this. It is threaded through the draft WRITE as well as the
resolution, because the write re-resolves the template and a fixed amount would otherwise reinstate
itself on the second pass.

**Do not "fix" this in a tenant's configuration.** Setting a template to `rate_derived` makes one
tenant correct and leaves the platform able to bill every other tenant a number nobody agreed to.

### Cadence is operator intent, and preview is a promise

One account can legitimately hold a weekly term for one child and a monthly term for another, so a
service period alone is **not an instruction**. The Generate Tuition surface asks for a Billing
frequency, and changing it clears a standing preview, because that preview described a different
operation.

`generationCadenceFrom` is read by **both** `buildPreview` and `execute`. They previously disagreed:
preview defaulted to monthly while execute honoured the payload, so previewing a weekly run reported
the monthly answer and Confirm then generated five weekly obligations. **Do not return to a
month-only preview that can execute another cadence.**

The preview echoes `cadence_key` and `service_period` in its `after` block so a caller can check
Confirm against what was previewed.

### Generated, recalculated, unchanged

`writeTemplateDraftCharge` answers `created` / `recalculated` / `unchanged` / `skipped_posted`, and
the generation result reports them as such:

- **generated** — created, or an existing draft moved to a new amount or date
- **unchanged** — a draft that already stood and still agrees; converged, *not billed again*
- **alreadyPosted** — settled money, reported and not entered

A rerun reporting its converged drafts as `generated` tells an operator they have charged a family
twice. The ledger was right and the sentence was not, and the sentence is what an operator reads.

### Effective lifecycle

`resolveTuitionRecurrence` distinguishes **`term_not_yet_effective`** from **`term_already_ended`**,
because "not yet" and "no longer" send an operator to two different places. A partial period with no
configured proration is **refused**, not billed whole.

### Idempotency — three layers, all database-enforced

For each `assignment × charge rule × billing period × child`, the same obligation cannot be created
twice. This is a **constraint**, never a read-then-insert:

1. `consumption_events (org_id, idempotency_key)` UNIQUE — key `cev:tuition:<assignmentId>:<periodKey>`
2. `charges_resolution_key_unique (org_id, billable_source_type, billable_source_id, metadata->>'resolution_key')` — key `tpl:<template_key>:<occurs_on>:<scope>`
3. `financial_reduction_applications (org_id, idempotency_key)` UNIQUE — key `fred:<policyId>:<chargeId>`

The occurrence key is **period-based and deliberately excludes the term**: a tuition occurrence is
"this child's September", and the term is what *priced* it, not what it *is*. A successor term
re-prices the existing draft rather than opening a second obligation. A posted consequence answers
`skipped_posted` — posted money is immutable.

---

## 5. Discounts, credits, adjustments, payments, prepaids — four different things

These are **not** interchangeable merely because each can reduce what is currently due.

| Concept | Definition | Owner |
|---|---|---|
| **Discount** | changes the amount charged, under a pricing/eligibility rule | `commercial_policies` (`discount`, `sibling_discount`, `waiver`) |
| **Credit / adjustment** | changes an established financial position | `charges` with category `credit` / `adjustment` |
| **Payment** | settles an obligation | `payments` + `payment_allocations` |
| **Prepaid / deposit** | money held for future application | unapplied posted payment (§6) |

### Commercial reduction is producer-independent

`applyFinancialReductions` reads the gross `tuition` charges a period produced — **whatever produced
them** — and `resolveFinancialReductions` never learns where a charge came from. A manually added
eligible tuition charge and a generated one therefore use the same authority and the same rules, and
the same policy means the same thing for both.

**Attachment grain**: the household's eligibility facts (sibling rank and count, employee household,
read server-side and never asserted by a caller), the charge's CATEGORY, and the policy's own
`applies_to` and effective window. No cadence, no assignment, no generator.

**The Billing Period owns effective policy selection.** Policies are filtered to those effective
across the period's bounds, and gross is selected by `service_date` inside them. Not `created_at`,
and not one date for manual and another for recurring.

**Draft reductions converge; posted reductions are immutable.** The already-posted check runs BEFORE
anything is written; a draft reduction reconciles in place; a posted one is reported and left alone,
and a later policy edit corrects it only by appending through the correction authority. Each
application carries a `policy_snapshot`, so editing a policy cannot rewrite what it already reduced.

**Provenance lives in `financial_reduction_applications`** — the policy, its kind, the basis, the
base it was taken on, whether a cap bound it, the period, the child and the gross charge it reduces.

### Gross stays gross

A reduction is a **separate charge** in the ledger (category `discount` / `credit` / `adjustment`),
never an edit to the tuition amount. The balance authority sums those into responsibility.

**Provenance is mandatory.** `financial_reduction_applications` records the decision behind the
reduction charge: which authored policy, what it was calculated on (`basis` percentage|amount,
`basis_value`, `basis_amount_cents`), whether it was `capped`, who decided, and a `policy_snapshot`
of the policy **as it was** — so editing a live policy cannot rewrite what was already applied.
Corrections append (`reverses_id` / `reversed_by_id`); a reduction is never DELETEd.

`discount_applications` / `discount_programs` belong to the **jobs/booking vertical** and are not
this. Do not point childcare reductions at them.

### Eligibility is proven from canonical facts, never asserted by a caller

`lib/financials/reductions/resolveReductionEligibility.ts` reads the enrolment agreements the
household actually holds and the employments the org actually recorded. A surface that could declare
its own eligibility would be a surface that could grant itself money.

- **Sibling** = children of the same account with an agreement **covering the service period**.
  Ranked by enrolment start then id, so the same household ranks identically on every run.
- **Employee household** = a linked person holding an `employments` row covering the period.

### One-time vs ongoing

An ongoing discount is an **effective-dated policy** (`commercial_policies` effective window)
re-evaluated per period; its idempotency key `fred:<policyId>:<chargeId>` means "not twice for this
obligation, yes for the next eligible period". A one-time discount is a single application. Both are
the same mechanism with different effective boundaries — **not** a second recurring scheduler.

### Discount grain

A discount rule must not erase the subject identity of the charge it reduces. The reduction record
carries `customer_member_id` / `customer_id` / `enrollment_agreement_id`. For a multi-child
operation, eligibility is evaluated **independently per resulting child obligation** — never one
household reduction because the operator acted once.

---

## 6. Deposits and prepaids — unapplied payment IS the authority

**Do not build a second stored-value ledger.**

A posted payment with money not yet assigned to an obligation is already a canonical, durable
financial position:

```
unapplied = amount − activeApplied − refunded        (childcarePaymentService)
```

`readPaymentUnappliedCents` is the owner. Only `status = 'active'` allocations count, so reversing
an application returns the obligation to the charge and the money to unapplied in the **same** write
— not two.

Recording money and applying money are deliberately **separate operations**: money can arrive before
any obligation exists. That is the deposit case, and it already works:

```
Deposit received     $500     →  posted payment, $500 unapplied
Obligations            $0
Tuition charge       $300     →  apply $300
Remaining prepaid    $200     →  unapplied
Outstanding            $0
```

**Cash arrival is not revenue recognition.** The journal separates them: `financial_journal_entries`
carries `obligation_delta_cents` as a column distinct from `amount_cents`, precisely because a
receipt has an amount and changes nothing owed. One column would have invited a consumer to sum it
and get a second, wrong answer.

### Deposit vs prepayment

They are **one money position with different policy metadata**, not two stores. The distinction is
already configurable: `financial_policies` type `deposit` carries `amount_cents` and `refundable`.
A refundable held deposit and an account credit balance are the same unapplied money under different
policy; building two ledgers for that difference would be duplication.

### Application policy

Application is **manual / governed** today. There is no automatic oldest-obligation sweep, and one
must not be added implicitly — automatic application is a policy decision, and the safe V1 is that
money moves only when someone decides it moves. The seam for a future policy is
`financial_policies`, alongside `deposit` and `proration`.

---

## 7. Responsibility

**Owner:** `financial_responsibility_arrangements` + `financial_responsibility_shares`.

Grain matches the subject model: `customer_id` always, `customer_member_id` **nullable** — null
being household grain, the same doctrine as §1. Effective-dated, with supersede lineage; shares are
`percentage` \| `fixed` \| `remainder` with a priority order.

Responsibility answers **who owes what**. It is assigned against obligations and rules — never
against payment methods. It belongs in **Details** administration, not Compact, and not in Manage
Payments.

**Ordering:** a discount reduces the obligation *before* responsibility is interpreted. This is not
a new rule — it is what the balance authority already computes:

```
responsibility = gross + discounts + funding + adjustments
```

---

## 8. Account summary semantics

**Owner:** `buildFinancialsCardVM` — the single balance authority. Presentation code must never
decide accounting semantics.

```
responsibility = gross + discounts + funding + adjustments   (sum of every owed line)
balance        = responsibility − payments                    (over the SAME rows)
past due       = owed rows whose due date has passed, MINUS what was applied
collectible    = resolveFamilyCollectible, per charge (subsidy-aware)
```

Past due is the **residual, not the face amount**. `charges.status` is deliberately never advanced
to `partially_paid` / `paid`: a stored status would be a second answer to "how much is left", and
the first reversal would make the two disagree. The applications are the record.

`unresolvedVarianceCents` sits **beside** the collectible figure and is never folded into it.

---

## 9. Known gaps — open, and deliberately not invented around

These are reported rather than patched, because each needs a decision that is not a lane's to make.

### 9.1 ~~`BILLING_PERIOD_CADENCE_CONVERGENCE_REQUIRED`~~ — **CLOSED**

Billing period identity is now the interval's **boundaries**, resolved from the configured cadence
and the agreement's own anchor. See §3.1. A weekly organisation billing a four-week span now
produces four independent obligations with four distinct identities.

### 9.2 ~~Due-date rule has no configuration authority~~ — **CLOSED**

`due_date` is now a financial policy type with four strategies. See §3.2. It landed as a *policy*
rather than a template column because due terms are how an organisation runs billing, not a property
of one charge kind — and policies are already effective-dated and scopable.

### 9.3 ~~Discount eligibility is only half an intersection~~ — **CLOSED**

Both halves now vote. See §5.1.

### 9.4 ~~Subject grain has no configuration authority~~ — **CLOSED at the model layer**

Category semantics now declare permitted grain, and a template may narrow within it. See §3.3.

**CLOSED.** The multi-child Add operation ships — see §3.4.

### 9.5 ~~Prepaid is representable but not surfaced as a position~~ — **CLOSED at the model layer**

`resolveAccountPrepaidPosition` and `resolveAccountFinancialPosition` project the position over
existing money. See §6.1.

**CLOSED.** The position is projected into the read model and rendered on both surfaces — see
§6.2.

---

## 10. Operator configuration boundary

**Organization-level Financials policy belongs on `/organization/financials`** — the canonical
configuration surface — and nowhere else. Do not create a disconnected configuration route, and do
not leave operator-configurable policy visible only in database or config artifacts.

The chapter is `?chapter=policies`, rendered by `FinancialPoliciesConfigurationPanel` /
`CreateFinancialPolicyForm`. That form is **registry-driven**: it renders
`POLICY_TYPE_REGISTRY[policyType].fields` generically. A policy type added to the registry is
therefore configurable by an operator **automatically**, with no new route and no bespoke screen.

`financial_policies` scopes are `org | location | service | rate_plan`, effective-dated.

### The policy-type audit

Three questions, and they have three different answers — which is why counting types is misleading:
*permitted by the database*, *declared in the application registry* (and therefore configurable by
an operator), and *actually resolved by runtime code*.

| Policy type | DB | Registry | Operator-visible | Consumed by runtime | Classification |
|---|:--:|:--:|:--:|:--:|---|
| `proration` | ✓ | ✓ | ✓ | ✓ (4 sites) | ACTIVE_RUNTIME_POLICY |
| `posting_review` | ✓ | ✓ | ✓ | ✓ (4 sites) | ACTIVE_RUNTIME_POLICY |
| `billing_cadence` | ✓ | ✓ | ✓ | ✓ | ACTIVE_RUNTIME_POLICY |
| `grace_period` | ✓ | ✓ | ✓ | ✓ | ACTIVE_RUNTIME_POLICY |
| `vacation_credit` | ✓ | ✓ | ✓ | ✓ | ACTIVE_RUNTIME_POLICY |
| **`due_date`** | ✓ | ✓ | ✓ | ✓ | ACTIVE_RUNTIME_POLICY *(added this pass)* |
| `deposit` | ✓ | ✓ | ✓ | — | DECLARED, INERT — configurable, not yet read. Holds the `refundable` flag §6.1 will need. |
| `late_fee` | ✓ | ✓ | ✓ | — | DECLARED, INERT |
| `nsf_fee` | ✓ | ✓ | ✓ | — | DECLARED, INERT |
| `refund` | ✓ | ✓ | ✓ | — | DECLARED, INERT |
| `withdrawal` | ✓ | — | — | — | FUTURE |
| `write_off` | ✓ | — | — | — | FUTURE |
| `adjustment_approval` | ✓ | — | — | — | FUTURE |
| `draft_expiration` | ✓ | — | — | — | FUTURE |

**The four DB-only types were deliberately NOT registered.** Registering them would make an operator
a configuration screen for policies nothing resolves — a control that changes no behaviour, which is
worse than an absent one because it looks like a capability. They are recorded here so a future lane
finds them instead of inventing a parallel mechanism, and each becomes registry work *at the moment
a runtime consumer exists for it*, not before.

This is the same gap `vacation_credit` documents having had — the database permitted it, the
application never caught up, and the consumption path read a boolean off an operational fact
instead, putting commercial authority in the wrong place. The lesson is that a type should become
configurable **when something reads it**, which is exactly how `due_date` was added this pass.

**What is NOT configuration:** individual household or child state stays in its operational record
and in Financials Details. Generated billing periods and transactions are operational Financials
truth, not configuration. Configuration says *what the rules are*; the ledger says *what happened*.

---

## 11. Surface ownership

Five surfaces, one set of authorities. **There are no host-specific financial writers**: every one
of these reads through the canonical readers and writes through the registered actions, and a
surface that needed its own writer would be a second financial authority wearing a screen.

| Surface | Owns the question | Must not grow into |
|---|---|---|
| **Focus Panel Summary** (`financials` card) | What is this family's position, and what are the common next acts? | responsibility administration, discount administration, deposit administration, payer setup, payment methods, allocation management |
| **Focus Panel Details** | Deep account truth and charge-grain administration — the ledger, lenses, filters, responsibility, reductions, corrections | a second account workspace |
| **Financials Workspace → Accounts** | The wider operational account workspace, across households | a second ledger, a second charge writer |
| **/organization/financials** | Financial and commercial CONFIGURATION — tuition plans, billing frequencies, catalog, policies, accounting calendar, GL | transactional money |
| **Assignment Tuition card** (`billing_preview`) | What this child's assignment costs, and the acceptance of recurring commercial terms | pricing. It renders Commercial Execution's answer and records a decision; it computes no amount |

**Shared command authority.** Every financial mutation on every one of these surfaces goes through
`FINANCIAL_TRANSACTION_ACTIONS` → one executor → `/api/admin/actions/execute`. The workspace
REQUESTS and the card PERFORMS; neither writes directly.

**Shared filtering.** Subject scope is `financialsRowScope` and nothing else (§2). A surface with
its own child filter is a second subject model.

---

## 12. Focus panel publication integrity — the v160/v161 finding

Recorded here so no future lane repeats a seven-hypothesis investigation.

A published Focus Panel Summary document carries **two independent card lists**:

- `doc.sections` — the authored cards: key, tier, span, density, visibility
- `doc.metadata.focusPanelLayout` — `{ grid: { areas, columns }, rows }`, the operator-published
  explicit layout

**The runtime renders the explicit layout.** `readFocusPanelPublishedLayout` reads the metadata one,
and when it is present the runtime draws exactly those rows and widths.

For two published versions, `billing_preview` was authored into `sections` and made visible there
while the metadata layout continued to name six other cards. The published document said the card
existed; the panel drew six; nothing anywhere reported an error. Every surface an investigator can
read said the card was placed.

**Publication now refuses a document whose two lists disagree.** A card authored visible and absent
from the explicit layout, or placed by the layout and authored nowhere, is a `400` at
`/api/admin/entity-layouts/{id}/publish` — see `focusPanelPublicationIntegrity.ts`. The rule names
no card and protects every Focus Panel card, including ones added later.

**If you republish a layout, write both projections.** A `sections` entry alone is not a placement.

---

## 13. Deferred — Payments is the next program

Payment method, autopay, provider, collection and deposit-lifecycle productization is the next major
program. See **`docs/platform/modules/core-payments-contract.md`** for the boundary: what Payments
inherits, what it must not rebuild, and where provider-specific objects belong.

The three accepted Core deferrals are stated in full in the Director QA catalog
(`CORE_DEFERRALS` in `lib/qa/financialsDirectorQa/scenarioCatalog.ts`) and are **not** Core defects:

- `SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` — fixed shares are operator-authorable; percentage
  and remainder exist in the arrangement authority with no Core authoring surface.
- `LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED` — canonical provenance exists and the ledger states a
  concise preview of it; there is no deep row-inspection surface in Core.
- `DEPOSIT_OPERATOR_PRODUCTIZATION_GAP` — the deposit policy and model foundation exist; the held
  deposit lifecycle belongs to Payments.
