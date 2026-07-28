# Implementation note — Calculation Library as OI tab

**Date:** 2026-07-28  
**Branch:** `agent/cursor/2-org-calcs-integration`  
**PR #249:** OPEN · ~18 ahead / 122 behind staging · no rebase this slice

## Audit summary

| Item | Current |
|------|---------|
| OI route | `/organization/operational-intelligence` → `OperationalIntelligenceWorkspace` |
| OI state | `view` / `add` / `orgMeasurement` / `question` query params |
| Calc route | `/organization/calculations` → `OrganizationCalculationsWorkspace` (standalone shell) |
| Deep link | Measurement Settings uses `?id=` but library reads `calculationId` |
| Org nav | Calculations already demoted from peers; domain lookup remains |

## Plan

1. Embed one `OrganizationCalculationsWorkspace` with `embedded` prop inside OI `view=calculations`.
2. Library URL state: `libraryView` + `calculationId` (OI keeps top-level `view`).
3. Redirect `/organization/calculations` (+ query) → OI calculations view.
4. Measurement Settings → View definition uses OI deep link.
5. Where used → link back to Future Room Capacity measurement when bound.
6. No evaluator / version / binding changes.
