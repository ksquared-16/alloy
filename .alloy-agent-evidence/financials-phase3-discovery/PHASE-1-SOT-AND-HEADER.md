# Phase 1 — Configuration source-of-truth map

| Visible concept | Source of truth | Configuration surface | Consuming product | Fallback / debt |
|---|---|---|---|---|
| Billing Frequencies | `option_sets` / `option_set_items` (`commercial_billing_cadence`) | Financials → Tuition → Billing Frequencies (new); also `/settings/option-sets` | Tuition Plans (primary cadence + rates) | Commercial API GET-only; write via option-set items |
| Enrollment Commitments | Derived from `program_offering_variants` patterns; ensure-on-plan via variants API | Financials → Tuition → Enrollment Commitments (new) | Tuition Plans | No org table — adapter A (derived catalog) |
| Tuition Plans | `program_offerings` | Financials → Tuition → Plans | Rates, Catalog boundary | — |
| GL Codes | `gl_accounts` | Financials → Accounting → GL Codes | Tuition Plans, Catalog via revenue categories | Revenue categories map to GL |
| Revenue categories | `commercial_revenue_categories` | Accounting / Catalog | Tuition plan metadata, products | Plan uses metadata key |
| Catalog Items | `commercial_products` | Financials → Catalog | Execution | Legacy fee tables transitional |
| Financial Policies | `commercial_policies` | Financials → Policies | Commercial execution | Separate `financial_policies` substrate A — keep out of primary IA |
| Care Formats | Code enum `attendance_type` | Plan create/edit | Offerings | Labels in code (`ATTENDANCE_TYPE_LABELS`) |
| Programs | Option set + LPC | `/organization/programs` | Tuition | — |
| Locations | `locations` | `/organization/locations` | Overrides | — |

## Shared header

- Primitive: `ConfigurationContext` in `ConfigurationModeLayout.tsx`
- Compacted: smaller title (1.125rem), icon 6×6, tighter page gap, reduced content `pt`
- Domains affected: Programs, Locations, Financials, other settings using the same shell

## Enrollment Commitment strategy

**A — derived catalog** (no schema). Distinct `(quantity_type, quantity_value[, label])` across org variants; create = ensure pattern; add to plan = find-or-create variant + rate.
