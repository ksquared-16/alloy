# Operational Consumption V2 — Slice 2 (agreement + schedule)

**Status:** Built (June 2026). Continues from Operational Consumption Slice 1 (registration fee) — the architecture is frozen, not redesigned. Posting remains out of scope.

Doctrine: [`../../platform/modules/operational-consumption-platform.md`](../../platform/modules/operational-consumption-platform.md) (Slice 2 sections).

## Milestone

Alloy can now answer, for *"a child has an active agreement and attends Monday/Wednesday/Friday"*:

```
Agreement (active, site)  +  Schedule (MWF → three_day)
  → which Service?      Full-Time Care (via the rate plan)
  → which Rate Plan?    Standard Tuition (org scope, current version)
  → which Rate Rule?    three_day @ monthly = $820.00
  → which Policies?     proration (daily), billing_cadence (monthly), posting_review
  → which obligation?   recurring_tuition for the service period
  → which Draft Charge?  charges status='draft' $820.00, billable next cycle
```

…without posting a single dollar.

## As-built

- **Pure interpretation engine** — `web/lib/operationalConsumption/scheduleInterpretation.ts`: maps a schedule mutation → obligation directives. Encodes *not every mutation is commercial* (holiday override / exception / no-op → no obligation). `weekdaysToScheduleBasis` maps MWF → `three_day`.
- **Runtime service** — `consumptionService.ts` extended: a schedule path that consumes **Rate Resolution** (`resolveRate`), the **Charge Template resolver** (`chargeLifecycleService`, with `resolvedAmountCents` now threaded through), and **Financial Policies** (`resolveFinancialPolicy`). One event → many obligations. Per-obligation idempotent draft charges; preview-only proration/credit.
- **Schema (additive)** — `20260707120000`: `resolved_obligations.obligation_kind` + `period_start`/`period_end`; global seed of `schedule.recurring_tuition | proration | drop_in | extra_day`. No money-table ALTERs, no new policy types (proration/billing_cadence/grace_period already exist).
- **Seed/demo** — demo dataset adds a rate-derived `tuition` and `drop_in` charge template + a `drop_in` rate rule.
- **API** — `POST /api/admin/financial/consumption/simulate` accepts schedule facts (`schedule_change_kind`, `schedule_basis`/`weekdays`, proration inputs); returns the full explanation.
- **UI** — the Consumption simulator becomes scenario-driven and renders the explanation chain: Consumption Event → Commercial objects used → Policies applied → Resolved obligations → Draft charges, each with *why*.
- **Tests** — `tests/operationalConsumption/`: pure interpretation (every scenario), the milestone (MWF → $820 draft), multi-obligation replacement, proration preview-only, extra-day drop-in, idempotency (no duplicate obligations on re-run; new period → new obligation), posted-untouched, no-rate → no_charge, route schedule dispatch, and Slice 2 convergence.

## Out of scope (unchanged)

Posting, Payments, Invoices, Statements, GL posting, Subsidy, Claims, Settlement, Attendance/late-pickup/meals/hourly consumption, vacation credits, refunds, withdrawals.
