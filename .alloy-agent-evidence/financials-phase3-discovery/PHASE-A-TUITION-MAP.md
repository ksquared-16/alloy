# Phase A — Tuition Plan realization map

**Base:** `2c8dc2f6c` · **Worktree:** wt2-org-config-financials  
**Decision:** Proceed with adapters over existing commercial/programs truth. No schema redesign.

## Operator concept → source of truth → API → adapter → gaps

| Operator concept | Source of truth | API / runtime | Presentation adapter | Gaps / handling |
|---|---|---|---|---|
| **Tuition Plan** | `program_offerings` | `/api/admin/programs/offerings` | One collection row per offering; display name = offering.label (e.g. Full Day) + Program | Per-program offerings (Infant Full Day ≠ Toddler Full Day) — correct by doctrine |
| **Enrollment Commitment** | `program_offering_variants` | `/api/admin/programs/offerings/[id]/variants` | Nested options under plan; label via `variantDisplayLabel` | Quantity PATCH blocked if rates exist |
| **Billing Frequency** | Cell: `commercial_tuition_rates.cadence_key`; catalog: `commercial_billing_cadence` option set | GET `/api/admin/commercial/billing-cadences`; rates POST | **Plan primary cadence** stored in `offering.metadata.tuition_billing_frequency_key`; options table shows that cadence; other cadences preserved underneath | Not plan-native in schema — metadata + derivation |
| **Current price** | `commercial_tuition_rates` (unique cell) | tuition-rates GET/POST/PATCH | Resolve by as-of date vs `effective_start`/`effective_end` | One row per cell |
| **Upcoming / History** | Same row + `metadata.priceHistory[]` on supersede | PATCH/POST with metadata merge | Current / Upcoming / History lenses | True multi-row history blocked by unique key — **metadata ledger** for prior periods |
| **Org default / Location override** | `location_id` null vs set | same rates APIs; `buildTuitionRateMap` | Locations tab + Compare | None |
| **Revenue GL Code** | Plan: `offering.metadata.tuition_revenue_category_id` → `commercial_revenue_categories` → GL; rates column `revenue_category_id` exists | revenue-categories GET; wire rates API | Plan Accounting field | Wire rate column in API; plan uses metadata until batch-applied |
| **Availability** | Program at sites via LPC; rates `not_offered` | location-program-categories; rates | “All locations” ≈ programs with LPC; overrides via rate rows | No offering×location table |
| **Care Format** | `attendance_type` | offerings create/patch | Operator labels | “Full Day” often in `label` |
| **Compare Locations** | `diffRateMaps` | client | Compare surface | Reuse resolver |
| **Status** | offering `status` / `is_active`; rate effective dates | existing | Draft / Active / Scheduled / Archived derived | Map only truthful states |

## Configuration sequence (guidance, not wizard)

1. GL Codes (Accounting / revenue categories)  
2. Billing Frequencies (option set)  
3. Enrollment Commitments (org-wide variant patterns = variants under plans)  
4. Tuition Plans (offerings)  
5. Location Overrides  
6. Compare / Simulator  

## Irreconcilable?

No. Proceed. Documented soft gaps: versioned DB history (metadata ledger), plan-level cadence (metadata), offering×location availability (LPC + rates).

## Reuse

Programs collection pattern: `ProgramsConfigurationPage` + URL `?planId=` under Financials `?chapter=tuition`.
