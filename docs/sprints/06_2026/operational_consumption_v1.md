# Operational Consumption V1 — Slice 1 (foundation)

**Status:** Built (June 2026). Continues from Commercial Model Slice D (`a79ddaef6`) on `origin/staging`. Does **not** restart architecture; the Commercial Model (Services, Rate Plans, Rate Rules, Charge Templates, Financial Policies, Charge Resolution, Draft Charges, Accounting) is unchanged.

Doctrine: [`../../platform/modules/operational-consumption-platform.md`](../../platform/modules/operational-consumption-platform.md).

## What this slice proves

The platform boundary for the first vertical:

```
Enrollment Agreement Activated
  → Consumption Event   enrollment.registration
  → Charge Template     registration_fee  (Commercial Model, by key)
  → Resolved Obligation (draft preview)
  → Draft Charge        (charges status='draft', idempotent — never posted)
```

Operational Consumption is the **runtime interpretation** layer between Operational Execution and Commercial / Financial Resolution. It posts nothing, writes no invoices/payments/ledger/GL, and never mutates a posted charge.

## As-built

- **Schema (additive)** — migration `20260706120000_operational_consumption_foundation.sql`: `consumption_event_types` (global-or-org registry mapping `event_key` → Commercial Model `charge_template_key`), `consumption_events` (normalized fact, idempotent per `(org, idempotency_key)`), `resolved_obligations` (draft obligation, optionally linked to a `status='draft'` charge via `draft_charge_id`, idempotent per `(org, resolution_key)`). RLS + org isolation + `set_updated_at` triggers on all three. No `charges`/money-table alterations; FK references only.
- **Seed** — migration `20260706120100_…_event_type_seeds.sql`: registers the global `enrollment.registration` event type (source family `agreement`) mapped to the `registration_fee` template. Idempotent (`WHERE NOT EXISTS`).
- **Runtime service** — `web/lib/operationalConsumption/`: `resolveConsumption.ts` (pure: fact + event type + Charge intent → Consumption Event + obligations) and `consumptionService.ts` (`previewConsumption` writes nothing; `draftConsumption` persists event + obligation + idempotent draft charge). **Consumes** the Slice D `chargeLifecycleService` — does not reimplement pricing.
- **Preview API** — `POST /api/admin/financial/consumption/simulate` (`requireAdminOrOps`), `action=preview|draft`.
- **UI** — `OperationalConsumptionSimulator.tsx`, a new **Consumption** runtime section under `/settings/financials` (distinct from the configuration sections; the boundary is made visible, not blurred).
- **Tests** — `web/tests/operationalConsumption/`: pure resolver, service preview/draft/idempotency, no-charge-when-no-template, posted-untouched, org isolation, route authorization/dispatch, and additive-migration + boundary convergence checks.

## Non-goals (later slices)

Posting, Payments, Invoices, Statements, GL posting, Subsidy runtime, Claims, Settlement, Focus Panel, Attendance consumption, Schedule-tuition consumption, Vacation credits, Refunds, Withdrawal policies.
