# Expansion closeout — shared header + Tuition setup + Financials chapters

**Date:** 2026-07-22  
**Branch:** `agent/cursor/2-org-config-financials`  
**Localhost:** `http://localhost:3012`

## Completed

### Shared header (Programs / Locations / Financials)
- Compacted `ConfigurationContext` (title 1.125rem, icon 6×6, tighter gaps)
- Reduced settings content `pt` / `pb`
- Removed duplicated Financials in-page breadcrumb; chapter tabs only
- Tightened Programs breadcrumb padding

### Tuition setup
- Subnav: Plans | Enrollment Commitments | Billing Frequencies (+ New Tuition Plan on Plans)
- Billing Frequencies collection (option-set backed)
- Enrollment Commitments derived catalog
- Plan Snapshot + Current Tuition overview with GL deep links
- Action-oriented landing (no inventory metric grid)
- Create/add dialogs use configured commitments (not hardcoded 1–5 only)

### Accounting
- GL Codes collection → selected workspace (Overview / Used By)
- Create / Edit / Archive / Restore via existing `financials/accounts` APIs
- Used By groups Tuition Plans + Catalog Items with contextual links
- Usage counts on collection rows
- Deep link `?chapter=accounting&accountId=`

### Catalog
- Collection → selected item → Overview / Pricing / Locations / History
- New / Edit / Activate / Deactivate against `commercial/products`
- Item Snapshot with readiness + GL setup link
- Boundary copy: fees/services here; recurring tuition under Tuition

### Policies
- Collection → selected policy → Overview / Rules / Applies To
- New / Edit / Activate / Deactivate via shared registry-driven editor
- Operator scope labels: Tuition Plan / Enrollment Commitment (not offering/variant)

## Validation
- Focused tuition productization tests
- `npm run typecheck`
- QA captures under `expansion-qa/`

## Remaining gaps (truthful)
1. True multi-row effective-dated price history still needs schema later; metadata ledger is interim
2. Enrollment templates via option set appear in selectors after use on a plan (derived catalog)
3. Revenue-category authoring still lives partly in Programs AccountingReferencePanel; Financials GL consumes mapped categories
4. Catalog type-specific package/deposit advanced fields remain thinner than Programs CommercialCatalogPanel (core fields covered)
5. `canManage` still often hardcoded true pending permission wiring
