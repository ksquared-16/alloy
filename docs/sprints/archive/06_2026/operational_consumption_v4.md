# Operational Consumption V4 — Slice 4 (Draft Obligation Review)

**Status:** Built (June 2026). Builds on the merged Operational Consumption runtime (Slices 1–3, staging `13cbb80ca`). Does **not** redesign Consumption. Posting remains out of scope.

Doctrine: [`../../platform/modules/operational-consumption-platform.md`](../../platform/modules/operational-consumption-platform.md) (Slice 4 section).

## Objective

The pre-posting **review surface** operators need before Posting exists: inspect every Resolved Obligation and answer *"why does Alloy think this should be charged?"* — then mark reviewed / flag / suppress / restore / recompute, without posting a dollar.

Resolved Obligations are the primary object; a draft Charge is a downstream artifact.

## As-built

- **Schema (additive)** `20260709120000`: `resolved_obligations.review_status` (pending | review_required | reviewed | suppressed | stale) + `reviewed_at` / `reviewed_by` / `suppression_reason` + CHECK + index + backfill from `review_required`. Distinct from `status` and `charges.status`. New obligations seed `review_status` on insert (`consumptionService.upsertObligation`).
- **Provenance** — consumption events now store `context.fact_snapshot` (the normalized fact) so an obligation can be faithfully recomputed by replaying the pipeline. Additive; pricing unchanged.
- **Service** `obligationReviewService.ts`: `listResolvedObligations` (filters), `getObligationDetail` (obligation + event + draft charge + explanation + timeline), `reviewObligation` (mark_reviewed/flag/suppress/restore/recompute), `recomputeObligation` (replays the pipeline in **preview** — no charge writes — reports drift, optionally persists → `stale`). Reusable pure builders `buildObligationExplanation` + `buildObligationTimeline`.
- **API** `GET/POST /api/admin/financial/consumption/obligations` — list/detail + review actions; `recompute` with `persist=false` is a preview. Role-gated (admin/ops), org-isolated.
- **UI** — `DraftObligationReviewWorkspace` in a new **Draft Obligations** runtime section under `/settings/financials`: left queue + filters, center detail + review actions, right explanation + timeline. Pre-posting framing; reuses the financial config visual language.
- **Tests** — list/filtering/org-isolation, detail + explanation + timeline ordering, review actions, suppress/restore + posting eligibility, recompute preview/drift/stale, idempotency (duplicate facts → no duplicate obligations or charges), no-posting, route auth/dispatch, Slice 4 convergence. 320 consumption/financial tests green (Slices 1–3 unchanged).

## Boundaries (verified)

Review-only: writes solely `resolved_obligations` review columns (and, on apply-recompute, the recomputed amount). **No** posting, invoice, payment, statement, or ledger writes. Recompute never writes a charge.

## Downstream (not built)

Posting, Invoicing, Payments, Statements, Subsidies, Claims, Settlement, General Ledger.
