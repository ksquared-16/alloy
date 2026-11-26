# Phase 1 — Authority map (Financials location / category / GL gaps)

**Date:** 2026-07-23  
**Branch:** `agent/cursor/2-org-config-financials`  
**Constraint:** No schema redesign. Close gaps with existing tables + metadata adapters (same pattern as Tuition billing frequency / revenue category metadata).

## Operator concept → source → API → write → UI → gap

| Operator concept | Canonical source | Read | Write | Current UI | Gap / resolution |
|---|---|---|---|---|---|
| Catalog Category | `commercial_categories` | `GET /api/admin/commercial/categories` | POST/PATCH/DELETE (soft-archive when in use) | Inline quick-create only | **Add Categories setup collection** |
| Catalog Item | `commercial_products` | `GET .../products` | POST/PATCH/DELETE | CatalogConfigurationPage | Keep |
| Catalog location scope | `location_id` single nullable FK | product GET | product PATCH | Single `<select>` | **No multi-location.** Use `metadata.selected_location_ids: string[] \| null` (`null`/absent = all). Keep `location_id` null for multi/all. |
| Catalog org price | `amount_cents` | product | product | Single amount | Keep as org default |
| Catalog location prices | *(none)* | — | — | — | **Use `metadata.location_prices`** map `{ [locationId]: { amount_cents, effective_start? } }` — one item, many prices |
| Policy business target | `scope_type` + refs | policies GET | POST/PATCH | Mixed with location in one dropdown | **Split UI:** Applies to (org/program/offering/variant) vs Locations |
| Policy locations | `location_id` single | policies GET | PATCH | Single select when scope=location | **`metadata.location_ids`** for multi; `scope_type=location` remains legacy single |
| Tuition Plan locations | *(none on offering)* — badge from program↔site junction | tuition-plans GET | — | Inherited “N locations” | **`program_offerings.metadata.tuition_location_ids`** |
| Tuition org / location price | `commercial_tuition_rates` (`location_id` null = org) | tuition-rates | POST/PATCH | Locations panel | Already correct — improve presentation |
| GL Code | `gl_accounts` | `/api/admin/financials/accounts` | POST/PATCH | GlCodesConfigurationPage | Create only writes GL |
| Revenue Category | `commercial_revenue_categories` | `/api/admin/commercial/revenue-categories` | POST/PATCH | Programs AccountingReferencePanel | Tuition selects **this**, labeled “Revenue GL” |
| Tuition revenue assignment | `offering.metadata.tuition_revenue_category_id` | tuition-plans | offering PATCH | Create/Edit dialogs | **Mismatch:** new GL not auto-mapped to a revenue category |
| Catalog revenue | `commercial_products.revenue_category_id` | products | PATCH | Catalog dialog | Same resolver needed |

## GL Code vs Revenue Category (root cause)

Financials → Accounting creates `gl_accounts` only.  
Tuition “Revenue GL” lists `commercial_revenue_categories` only.  
No auto-link → newly created GL codes never appear until a Revenue Category is mapped in Programs.

**Resolution (no schema change):**

1. Shared GL option resolver: load GL accounts + revenue categories; present `4000 — Tuition Revenue`.
2. On GL create (type revenue), ensure a matching revenue category with `mapped_gl_account_id`.
3. On select in Tuition/Catalog, store `revenue_category_id` (existing truth); display uses GL code+name.
4. Invalidate/refresh snapshot after GL create so Edit Tuition Plan sees it without restart.

## Hard-coding audit (initial)

| Visible concept | Class |
|---|---|
| Catalog types (fee/addon/deposit) | Code-owned capability registry |
| Catalog Categories | Tenant configuration (`commercial_categories`) |
| Policy types | Code-owned registry |
| Policy scope targets | Code-owned + metadata locations |
| Billing Frequencies | Tenant option set |
| Enrollment Commitments | Derived + option set templates |
| Locations | Canonical entity catalog |
| Programs | Canonical entity catalog |
| GL Codes / types | Canonical + code-owned type enum |
| Care formats | Code-owned (`ATTENDANCE_TYPE_LABELS`) |

## Safe to proceed

No authority contradiction blocking implementation. Multi-location and catalog location prices use **metadata adapters** over existing rows; tuition pricing overrides stay on `commercial_tuition_rates`.
