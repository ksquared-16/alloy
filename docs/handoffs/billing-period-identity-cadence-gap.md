# Handoff — BILLING_PERIOD_IDENTITY_MONTH_DERIVED_DESPITE_CONFIGURABLE_CADENCE

**Handoff ID:** `HANDOFF-BP-CADENCE-2026-09-16`
**Classification:** `BILLING_PERIOD_IDENTITY_MONTH_DERIVED_DESPITE_CONFIGURABLE_CADENCE`
**Owning thread:** Financials commercial/billing productization — **not absorbed into Thread 11A**
**Raised by:** Thread 11A Repair Pass 5H, addendum census
**Absorbed into 5H:** **no.** 5H records the gap and demonstrates the independence; it changes
no period identity, no cadence authority, and no ledger grouping.

---

## 1. Doctrine, stated so the two are never collapsed

**Billing Period** — a commercial/service billing cycle. What a *family* is billed for.

**Accounting Period** — an organization's accounting-calendar period. What the *business*
closes its books for.

They are independent. A weekly Billing Period may sit inside a monthly Accounting Period, or
span two of them. Neither derives from the other.

## 2. The gap

Billing **cadence** is configured and operator-editable — `commercial_billing_cadence` offers
`weekly, biweekly, monthly, annual, daily, hourly, per_session` (`web/lib/commercial/billingCadences.ts`),
and it drives **pricing**: how often a plan raises a charge.

Billing **period identity** is not configurable. It is a calendar month, hardcoded:

```ts
export type BillingPeriodKey = string; // "YYYY-MM"     web/lib/financials/billingPeriod.ts:34
```

`placeInBillingPeriod` derives the key by slicing `billable_on` (then `occurs_on`,
`service_date`, `created_at`) to its first seven characters, and reports `unplaceable` rather
than sweeping an undated row into the current month.

**Consequence:** a weekly-billing organization gets weekly charges priced correctly and sees
them grouped into monthly buckets on every operator-facing ledger. Configurable pricing cadence
and Billing Period semantics are therefore **not yet converged**.

## 3. What 5H proved instead of fixing

`web/tests/financials/billingVsAccountingPeriod.test.ts` — 9 tests, committed:

- four weekly charges across September (`billable_on` 09-07, 09-14, 09-21, 09-28) place by
  `billable_on`, while all four attribute by `effective_on` into **one** accounting month;
- the attribution trigger reads `NEW.effective_on` and **never** `billable_on`
  (`supabase/migrations/20260904180000_financial_periods_and_journal.sql`);
- a closed accounting period **defers** to the earliest later open period and records
  `accounting_period_deferred_from_date` — it does not refuse;
- the month-derived key is asserted as **current truth**, so the test fails the day identity
  becomes cadence-aware and the person making that change decides what grouping should say.

## 4. Impact on Director QA

This does **not** block current Director QA: the selected fixture and product scenario
intentionally use monthly billing, where month-derived identity and cadence agree.

It **does** block any future claim that arbitrary billing cadence has fully productized
Billing Period semantics. That claim needs cadence-aware period identity, a migration path for
existing `YYYY-MM` keys, and an operator-facing answer for what a ledger groups by.

## 5. Accounting Period is not in scope for that work

Accounting Period remains the accounting/books primitive, broader than customer billing, and
will eventually apply across financial domains. It must not be collapsed into Billing Period,
and the operator-visible accounting-calendar work already delivered (Pass 5F) stands.
