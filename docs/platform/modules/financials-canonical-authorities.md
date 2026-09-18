# Financials — the canonical authorities

**Status:** current as of `agent/financials-11a-repair2`, Thread 11A.
**Purpose:** name the single owner of every core financial concept, so a lane that needs one
**finds it instead of building a second one.**

This document exists because the failure mode in this domain is not ignorance, it is *duplication*.
Every concept below already has an owner. A second discount engine, a second prepaid wallet, a
second allocation path, a second child filter, a second charge writer or a second responsibility
model would each be a defensible-looking local decision and a platform-level defect. The rule is:

> If you cannot express the behaviour through the authority named here, report the smallest
> compatible extension to it. Do not build a parallel mechanism.

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

### 9.1 `BILLING_PERIOD_CADENCE_CONVERGENCE_REQUIRED`

`BillingPeriodKey` is `"YYYY-MM"` — every billing period identity is a calendar month. Meanwhile
cadence is configurable as `weekly | biweekly | monthly | annual | daily | hourly | per_session`.

`resolveTuitionRecurrence` accepts a `cadenceKey` but uses it only to **filter which terms** a run
bills; the period itself is still a month. Because the occurrence key is
`cev:tuition:<assignmentId>:<periodKey>`, a weekly-billed organisation would generate **one charge
per month**, not four — the idempotency guarantee working exactly as designed, over the wrong period
grain.

A weekly organisation must eventually be able to represent `Sep 21–27, 2026` as a real commercial
billing period. The smallest evolution is to make billing-period identity a function of the
configured cadence inside the existing `billingPeriod.ts` authority — **not** a parallel period
system, and not a new column, since the period is derived.

### 9.2 Due-date rule has no configuration authority

`billable_on_strategy` gives the invoice/bill date a configured rule. `due_date` has none — it is
supplied by the caller. So the model *can* represent `Billing Period Oct 1–31, invoiced Sep 25, due
Oct 1` (the three dates are separate columns), but an organisation cannot **configure** the due-date
rule. Smallest extension: `due_on_strategy` + `due_offset_days` on `financial_charge_templates`,
mirroring the billable pair exactly.

### 9.3 Discount eligibility is only half an intersection

The intended rule is:

```
discount applies ONLY IF  discount allows charge category
                     AND  charge category permits discounting
```

The **first** half exists: `policy.params.applies_to` is `tuition | fees | all`. The **second** half
does not — no charge category or template carries a "discountable / exempt" flag, so `applies_to:
"fees"` currently means *every* non-tuition category, sweeping in late-pickup and returned-payment
fees that most organisations would exempt. Neither side should be able to override the other
unilaterally.

### 9.4 Subject grain has no configuration authority

Nothing on charge categories, templates or policies expresses `CHILD_REQUIRED` / `HOUSEHOLD` /
`CHILD_OR_HOUSEHOLD`.

Note the shape of the category authority before extending it: `CHARGE_CATEGORIES` is a **code-owned
invariant** in `lib/financials/billableSource.ts`, not a tenant-editable table. So the *permitted*
grain per category belongs beside it in code, and a template may only **narrow** within that
permitted set — which is exactly the intended doctrine and needs no new table for the category half.

`MULTIPLE CHILDREN` is an **operational selection mode**, never a stored row grain. Selecting two
children for a $40 field trip produces two independent $40 child-grained obligations — never one
$80 household charge, and never an array of subject ids on one row.

### 9.5 Prepaid is representable but not surfaced as a position

The data distinguishes *owes $0 with $200 prepaid* from *owes −$200*: the former is a $0 obligation
balance plus a $200 unapplied payment; the latter would be a negative responsibility. They are
different rows and cannot be confused at the storage layer. **This is not an architectural
deficiency.** What is missing is an account-level aggregate of unapplied money presented beside
Balance, so an operator can see the distinction the data already holds.

---

## 10. Operator configuration boundary

**Organization-level Financials policy belongs on `/organization/financials`** — the canonical
configuration surface — and nowhere else. Do not create a disconnected configuration route, and do
not leave operator-configurable policy visible only in database or config artifacts.

The chapter is `?chapter=policies`, rendered by `FinancialPoliciesConfigurationPanel` /
`CreateFinancialPolicyForm`. That form is **registry-driven**: it renders
`POLICY_TYPE_REGISTRY[policyType].fields` generically. A policy type added to the registry is
therefore configurable by an operator **automatically**, with no new route and no bespoke screen.

`financial_policies` scopes are `org | location | service | rate_plan`, effective-dated. The
database already permits these types:

```
proration · billing_cadence · grace_period · late_fee · nsf_fee · deposit · refund
vacation_credit · withdrawal · write_off · adjustment_approval · draft_expiration
posting_review
```

The application registry currently declares nine of the thirteen. `withdrawal`, `write_off`,
`adjustment_approval` and `draft_expiration` are **permitted by the database and absent from the
application model** — the same gap `vacation_credit` documents having had, where the consumption
path read a boolean off an operational fact instead, putting commercial authority in the wrong
place. Closing that gap is registry work, not schema work.

**What is NOT configuration:** individual household or child state stays in its operational record
and in Financials Details. Generated billing periods and transactions are operational Financials
truth, not configuration. Configuration says *what the rules are*; the ledger says *what happened*.

---

## 11. Surface boundary

**Compact** — understand the current financial position, initiate common actions, navigate to
Details. It must not grow: no responsibility management, no discount administration, no deposit
administration, no payer setup, no payment methods, no allocation management. If prepaid funds
materially affect the position, surface the **minimum financially necessary indicator**, not an
administration interface.

**Details** — administer the financial relationship. This is where responsibility, discounts,
deposits, allocation and payer administration live.

---

## 12. Deferred — the next phase, deliberately not started

Payment method / autopay / provider / collection productization is the next major phase and is **out
of scope** for the core-financials work this document describes. Provider, merchant, collection
attempt and refund authorities already exist (`lib/financials/payments/*`); productizing them is a
separate pass.
