# Implementation note — Calculation Library as OI tab

**Date:** 2026-07-28  
**Branch:** `agent/cursor/2-org-calcs-integration`  
**PR #249:** OPEN · stacked · no rebase this slice

## Done

1. OI product tabs: Questions · Measurements · Calculation Library
2. Single `OrganizationCalculationsWorkspace` with `embedded` prop (no fork)
3. Library URL state: `view=calculations` + `libraryView` + `calculationId`
4. `/organization/calculations` redirects into OI (preserves id / libraryView / step)
5. Settings → View definition deep-links the bound definition
6. Where used → Future Room Capacity measurement return path
7. Org nav still has no Calculations peer
8. Architecture unchanged (evaluator, versions, binding)

## Validation

- Focused tests pass
- `npm run typecheck` EXIT:0
- Authenticated browser QA deferred for this pass
