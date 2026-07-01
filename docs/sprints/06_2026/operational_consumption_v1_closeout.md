# Operational Consumption V1 — closeout summary (Slices 1–4)

**Status:** COMPLETE (June 2026). Doctrine: [`../../platform/modules/operational-consumption-platform.md`](../../platform/modules/operational-consumption-platform.md). Per-slice detail: [v1](operational_consumption_v1.md) · [v2](operational_consumption_v2.md) · [v3](operational_consumption_v3.md) · [v4](operational_consumption_v4.md).

Operational Consumption is the **runtime interpretation layer** between Operational Execution and Commercial / Financial Resolution. It answers one question — *given an operational fact, what commercial meaning should exist?* — and produces recomputable, non-authoritative draft intent. It **posts nothing**.

## The full platform flow

```
Operational Truth → Operational Execution → Operational Consumption →
Commercial Model → Financial Resolution → Resolved Obligations →
Draft Charge Review → Posting → Payments → Settlement
```

Everything through **Draft Charge Review** is recomputable and non-authoritative. **Posting is the first authoritative financial write** and, with Payments / Settlement / Statements / Subsidies / Claims / GL, is a **downstream consumer** of this runtime — none are built here.

## The slices

- **Slice 1 — Foundation (registration).** `consumption_event_types` / `consumption_events` / `resolved_obligations`; the `enrollment.registration` vertical → a fixed registration-fee draft charge via the existing Charge Template resolver. Migration `20260706120050` (+ seeds `20260706120100`).
- **Slice 2 — Agreement + Schedule.** Recurring tuition from an agreement + schedule; a pure schedule-interpretation engine (recurring → tuition; replacement → proration credit + replacement tuition; holiday/exception/no-op → no obligation). One event → many obligations. Consumes Rate Resolution + Charge Templates + Financial Policies. Migration `20260707120000`.
- **Slice 3 — Pipeline + Attendance.** Generalized every domain into one canonical pipeline (Fact → **Consumption Candidate** → Consumption Event → Resolved Obligation → Draft Charge) with a single shared directive resolver; **Attendance** as first consumer (late pickup / drop-in / hourly / vacation credit; "not every fact is commercial"). Migration `20260708120000`.
- **Slice 4 — Draft Obligation Review.** Pre-posting review surface over `resolved_obligations` (the primary object): `review_status` lifecycle (pending / review_required / reviewed / suppressed / stale), review actions (mark reviewed / flag / suppress / restore / recompute), a reusable Explanation Engine + Timeline, and the **Draft Obligations** workspace. Migration `20260709120000`.

## Major architectural decisions

1. **Consumption consumes; it never reimplements.** Pricing/timing/review come from the existing Commercial Model resolvers (`resolveRate`, `resolveChargeFromTemplate`, `resolveFinancialPolicy`, the charge lifecycle service). The shared `resolveDirective` is the only resolution core across all domains.
2. **Resolved Obligations are the primary object.** A draft Charge is a downstream artifact; the review experience centers on obligations.
3. **The Consumption Candidate is a normalized, non-persisted interpretation.** One candidate → zero, one, or many events; discarded candidates carry an explanation. No candidate table.
4. **Two distinct lifecycles, never conflated.** `resolved_obligations.status` (resolution: previewed / drafted / no_charge / superseded), `resolved_obligations.review_status` (pre-posting review), and `charges.status` (charge lifecycle) are separate.
5. **Idempotent by resolution key.** Duplicate operational facts never create duplicate obligations or charges; recompute replays the pipeline in preview and is keyed identically.
6. **Explanation is first-class** — for created *and* suppressed obligations — and is structured for reuse by BOS. Provenance (`context.fact_snapshot`) makes obligations faithfully recomputable.
7. **Additive-only schema; no Posting.** Every migration is additive and uniquely ordered; nothing posts money, writes the ledger, or creates invoices/payments/statements.

## Final runtime objects

`consumption_event_types` (registry; global + org), `consumption_events` (the canonical runtime contract; carries `fact_snapshot`), `resolved_obligations` (the primary object; obligation_kind, period, review lifecycle, draft-charge link). Code: `web/lib/operationalConsumption/` (pure interpreters `scheduleInterpretation` / `attendanceInterpretation`, orchestration `consumptionService`, review `obligationReviewService`). APIs: `…/consumption/simulate` and `…/consumption/obligations`. UI: **Consumption** + **Draft Obligations** runtime sections under `/settings/financials`.

## Remaining Financial Platform work (NOT in this runtime)

**Posting** (the first authoritative financial write), Invoicing, Payments, Statements, Subsidies / Third-Party Payers, Claims, Settlement, and the General Ledger. These consume Resolved Obligations / reviewed draft charges downstream. Attendance-derived verticals beyond the current set (meals, etc.) can be added by registering an event type + interpreter directive — the pipeline already carries them.
