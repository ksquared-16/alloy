# OI Platform V1 — Certification evidence

**Date:** 2026-07-28  
**Host:** `http://127.0.0.1:3012`  
**Branch:** `agent/cursor/2-operational-intelligence-expansion`

## Automated

| Check | Result |
|-------|--------|
| `vitest` operatorCollectionFilter + definitionCatalog + equivalencyEngine | Pass (24 tests) |
| `npm run typecheck` (tsconfig.build.json) | Pass |
| Production `next build` | Skipped (machine swap pressure; typecheck is merge gate) |

## Browser QA (authenticated)

| Surface | Result |
|---------|--------|
| Questions | Future Room Capacity + Room Utilization only; Measuring |
| Measurements | Rail + Overview / History / Settings |
| Calculation Library | Dense Definitions rail; full titles; search icon spacing OK |
| Operator collection | 2 defs (QA/preview hidden); `?developer=1` shows 9 |
| No FTE product question card | Confirmed |
| No standalone Calculations nav | Library lives under OI tab |

## Cosmetic (non-blocking)

See `COSMETIC-FOLLOW-UPS.md`.
