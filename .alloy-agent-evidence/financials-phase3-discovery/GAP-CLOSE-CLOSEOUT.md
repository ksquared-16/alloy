# Gap-close pass — Categories, multi-location, GL selector

**Date:** 2026-07-23  
**Branch:** `agent/cursor/2-org-config-financials`

## Closed

1. **Catalog Categories** — first-class Items | Categories subnav; create/edit/deactivate; Used By; quick-create in item dialog.
2. **Catalog multi-location + location prices** — `LocationMultiSelect`; org default + `metadata.location_prices` overrides; Locations tab.
3. **Policy locations** — business target (scope) separated from Locations multi-select; `metadata.location_ids`.
4. **Tuition location assignment** — create/edit `LocationMultiSelect`; `metadata.tuition_location_ids`; Locations tab Offered column.
5. **GL Code selector** — shared `GlCodeSelect` + `buildGlCodeOptions`; Accounting create auto-ensures revenue category mapping so new GL appears in Tuition/Catalog without restart.

## Shared primitives

- `LocationMultiSelect`
- `GlCodeSelect` / `lib/financials/gl/glCodeOptions.ts`
- `lib/financials/applicability/locationApplicability.ts`

## Validation

- `npm run typecheck` — passed
- `npm run test -- tests/financials/tuitionPlans` — 27 passed

## Authority

See `PHASE-GAP-AUTHORITY-MAP.md`. No schema redesign; metadata adapters over existing tables.

## Remaining truthful gaps

1. True multi-row effective-dated catalog price history still interim (metadata).
2. Policy “Applies to Tuition vs Catalog” uses existing scope_type targets (org/program/offering/variant), not a separate product-type enum.
3. Catalog location override UX uses prompt for amount (Manage actions can deepen later).
4. Slot 2 Next may still need `alloy-dev-start` under machine load before browser QA.
