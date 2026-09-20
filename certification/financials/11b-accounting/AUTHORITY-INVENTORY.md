---
title: Accounting Periods — authority inventory before mutation
status: inventory
recorded: 2026-09-20
candidate: bec2934fc
---

# CANONICAL MODEL — exists, and is enforced by the database

`supabase/migrations/20260904180000_financial_periods_and_journal.sql`.

**`financial_accounting_calendars`** — `calendar_key`, `period_style` ∈ {`calendar_month`,
`four_four_five`, `custom`}, `is_active`. A partial unique index allows **at most one active
calendar per org**, "because *pick* is how a posted row's period becomes a matter of query order".

**`financial_accounting_periods`** — `period_key`, `label`, `starts_on`/`ends_on` (**inclusive**),
`status` ∈ {`open`,`closed`} CHECK-enforced, `closed_at`, `closed_by`, and an EXCLUDE constraint
forbidding overlap *within* a calendar (two calendars may cover the same days deliberately).

# READ AUTHORITY — exists

`GET /api/admin/financials/accounting-calendar` (`fin.read`). `lib/financials/accountingPeriod.ts`
generates period SHAPES purely — `calendarMonthPeriods`, `fourFourFivePeriods`, `findPeriodForDate`,
`findOverlappingPeriods` — and resolves nothing against the database.

# POSTING AUTHORITY — exists, in the database, and NOT as the instruction assumes

`attribute_financial_journal_entry`, a BEFORE INSERT trigger on `financial_journal_entries`. It
chooses the period from `effective_on`:

| situation | result |
|---|---|
| no active calendar | `period_attribution = 'no_calendar'`, no period — a complete history that carries no period rather than one nobody configured |
| no period covers the date | refuse: `accounting_period_unavailable` |
| **the covering period is CLOSED** | **defer** to the earliest later OPEN period, stamping `accounting_period_deferred` and `accounting_period_deferred_from_date` |
| closed **and no later open period** | refuse: `accounting_period_closed` |

The deferral is deliberate and argued in the migration:

> A CLOSED PERIOD DEFERS; IT DOES NOT REFUSE. Refusing would make a REPORTING boundary able to
> block an OPERATIONAL act: a family could not be charged, or a cheque could not be recorded,
> because the books were closed. Books close after the fact and money does not wait for them.

# JOURNAL INTEGRITY — exists

`enforce_financial_journal_append_only`; `enforce_accounting_period_org_parity`; and
`enforce_accounting_period_boundaries_frozen`, which refuses any change to `starts_on`, `ends_on`,
`period_key` or `calendar_id` once entries are attributed — *"open a new period instead"*. `status`
is deliberately **not** frozen, which is what makes closing a period with history possible at all.
§26's history-safety requirement is therefore already satisfied by the schema.

# WRITE AUTHORITY — **NONE**

No INSERT, UPDATE or DELETE against either table exists anywhere in application code. No service,
no registered action, no route. There is no way to adopt a calendar, materialise a period, or
close one.

# CLOSE AUTHORITY — **NONE**

`status`, `closed_at` and `closed_by` are modelled and never written.

# CONFIGURATION / OPERATOR SURFACE

`AccountingPostingPanels.tsx` renders `accounting-calendar-panel`, read-only, and honestly reports
absence. Measured mounted on this tenant: *"This organization has no accounting calendar. Financial
activity cannot be attributed to an accounting period until one exists."* `resolveChargeDetail`
reads the attributed period for a charge.

# ACTUAL GAP

The entire write half. Everything that decides and protects attribution exists in the database;
nothing lets a human adopt a calendar, materialise its periods, or close one — so on this tenant
every journal entry is `no_calendar` and the accounting period system is inert.

# CORRECTION TO THE RUN'S PREMISE

§13 requires that "a normal posting that would enter a closed Accounting Period must not silently
succeed", and §32 asks that "posting into CLOSED succeeds" be planted as a dangerous defect. Under
the certified doctrine above, posting into a closed period **correctly defers** and is not silent:
it records where it came from. Implementing a refusal would reverse a deliberate, argued design
decision and would let a closed reporting boundary stop a family being charged.

The lockable integrity rule the platform actually holds is therefore:

1. a closed period accepts no NEW attribution — entries effective in it land in the next open one;
2. the deferral is recorded on the entry, never silent;
3. with nowhere to defer to, the write is refused as `accounting_period_closed`;
4. closing never re-attributes entries already posted.

The QA catalog states this incorrectly too — scenario `accounting_period` says the trigger
"refuses a write into a closed one". That is wrong and should be corrected with this slice.
