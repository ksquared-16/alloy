# Tuition First — realization closeout

**Branch:** `agent/cursor/2-org-config-financials`  
**Slot:** 2 · `http://localhost:3012`  
**Date:** 2026-07-22

## Delivered

- Tuition Plans collection → selected plan → focused workspace (Programs grammar)
- Tabs: Overview, Tuition Options, Locations, Upcoming Changes, History
- Create (4-step), Edit Plan, Schedule Change, Add/Stop commitments, Compare Locations
- Setup sequence (quiet guide, not wizard)
- Composed API `GET /api/admin/financials/tuition-plans`
- View models over offerings / variants / rates (no schema redesign)
- Rate PATCH accepts `metadata` (priceHistory) + `revenue_category_id`
- Docs: ownership-model operator presentation section
- Tests: `tuitionPlanViewModel.test.ts` (6) + routing containment

## Adapter map (truthful)

| Operator | Persistence |
|---|---|
| Tuition Plan | `program_offerings` |
| Enrollment Commitment | `program_offering_variants` |
| Plan billing frequency | `offering.metadata.tuition_billing_frequency_key` (rates remain cadence-keyed) |
| Plan GL | `offering.metadata.tuition_revenue_category_id` |
| Price history | `rate.metadata.priceHistory` (unique cell prevents multi-row history) |

## Remaining gaps (documented, not blockers for this slice)

1. True multi-row effective-dated history still needs schema if product later requires concurrent current+upcoming rows without metadata ledger.
2. Setup deep-links (`?setup=frequencies|commitments`) need dedicated compact surfaces.
3. Plan display names are offering labels (`Full Day`) — Program shown as secondary fact (Infant Full Day composition can be a follow-up naming polish).
4. `canManage` not yet capability-gated.
5. Broader Catalog/Policies/Funding productization out of scope.

## QA evidence

`.alloy-agent-evidence/financials-phase3-discovery/tuition-realization-qa/`

Observed: Infant **Full Day** as one plan with 4 enrollment commitments; create dialog; setup sequence; Locations/History tabs.
