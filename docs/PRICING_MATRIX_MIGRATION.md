# Universal Pricing Matrix — Migration & Parity

Additive phase: new `pricing_matrix` table and seed from legacy tables. Legacy tables and APIs remain in use until the resolver is switched.

## 1. Concept

**Pricing = Service Offering + Plan Template + Pricing Mode + Pricing Dimension Value + Amount**

| Component | Table / Source | Notes |
|-----------|----------------|-------|
| Service Offering | `service_offerings` | One per vertical/offering. |
| Plan Template | `service_plan_templates` | Null for one-time/initial/setup. |
| Pricing Mode | `pricing_modes` | e.g. `initial`, `recurring`, `setup_fee`, `subscription`. |
| Pricing Dimension Value | `pricing_dimension_values` | e.g. square footage bucket; null for flat. |
| Amount | `amount_cents` | Stored in matrix row. |

## 2. Mapping: Legacy Tables → pricing_matrix

### pricing_first_clean_prices → matrix (mode = initial)

| Legacy column | Matrix column | Resolution |
|---------------|---------------|-------------|
| vertical_id | vertical_id | Direct. |
| service_id | service_offering_id | Via `pricing_services.service_offering_id`. |
| — | service_plan_template_id | Always NULL (one-time/initial). |
| — | pricing_mode_id | `pricing_modes.id` WHERE `mode_key = 'initial'`. |
| sqft_tier_id | pricing_dimension_value_id | Via `pricing_square_footage_tiers.dimension_value_id`. |
| amount_cents | amount_cents | Direct. |
| is_active | is_active | Direct. |
| id | source_id | Stored in matrix for parity. |
| — | source_table | `'pricing_first_clean_prices'`. |

### pricing_recurring_prices → matrix (mode = recurring)

| Legacy column | Matrix column | Resolution |
|---------------|---------------|-------------|
| vertical_id | vertical_id | Direct. |
| service_id | service_offering_id | Via `pricing_services.service_offering_id`. |
| frequency_id | service_plan_template_id | Via `pricing_frequencies.service_plan_template_id`. |
| — | pricing_mode_id | `pricing_modes.id` WHERE `mode_key = 'recurring'`. |
| sqft_tier_id | pricing_dimension_value_id | Via `pricing_square_footage_tiers.dimension_value_id`. |
| amount_cents | amount_cents | Direct. |
| is_active | is_active | Direct. |
| id | source_id | Stored in matrix for parity. |
| — | source_table | `'pricing_recurring_prices'`. |

**Edge cases**

- If `pricing_square_footage_tiers.dimension_value_id` is NULL, matrix row gets `pricing_dimension_value_id = NULL` (flat tier).
- Seed uses `ON CONFLICT DO NOTHING` on the matrix unique constraint so re-runs are safe.

## 3. Parity Validation Queries

Run these to compare legacy rows to matrix rows. No changes to data.

### 3.1 First-clean: legacy rows with no matching matrix row (missing in matrix)

```sql
SELECT f.id AS legacy_id, f.vertical_id, f.service_id, f.sqft_tier_id, f.amount_cents, f.is_active
FROM pricing_first_clean_prices f
JOIN pricing_services ps ON ps.id = f.service_id
JOIN pricing_modes pm ON pm.mode_key = 'initial'
LEFT JOIN pricing_square_footage_tiers pt ON pt.id = f.sqft_tier_id
LEFT JOIN pricing_matrix m ON m.vertical_id = f.vertical_id
  AND m.service_offering_id = ps.service_offering_id
  AND m.service_plan_template_id IS NULL
  AND m.pricing_mode_id = pm.id
  AND (m.pricing_dimension_value_id IS NOT DISTINCT FROM pt.dimension_value_id)
  AND m.source_table = 'pricing_first_clean_prices'
  AND m.source_id = f.id
WHERE m.id IS NULL;
```

Expected: 0 rows after seed. Any row = legacy row not represented in matrix (or mismatch).

### 3.2 First-clean: amount mismatch (legacy vs matrix)

```sql
SELECT f.id AS legacy_id, f.amount_cents AS legacy_cents, m.amount_cents AS matrix_cents
FROM pricing_first_clean_prices f
JOIN pricing_services ps ON ps.id = f.service_id
JOIN pricing_modes pm ON pm.mode_key = 'initial'
LEFT JOIN pricing_square_footage_tiers pt ON pt.id = f.sqft_tier_id
JOIN pricing_matrix m ON m.vertical_id = f.vertical_id
  AND m.service_offering_id = ps.service_offering_id
  AND m.service_plan_template_id IS NULL
  AND m.pricing_mode_id = pm.id
  AND (m.pricing_dimension_value_id IS NOT DISTINCT FROM pt.dimension_value_id)
  AND m.source_table = 'pricing_first_clean_prices' AND m.source_id = f.id
WHERE f.amount_cents IS DISTINCT FROM m.amount_cents;
```

Expected: 0 rows. Any row = same logical price but different amount (data drift).

### 3.3 Recurring: legacy rows with no matching matrix row

```sql
SELECT r.id AS legacy_id, r.vertical_id, r.service_id, r.frequency_id, r.sqft_tier_id, r.amount_cents
FROM pricing_recurring_prices r
JOIN pricing_services ps ON ps.id = r.service_id
JOIN pricing_frequencies pf ON pf.id = r.frequency_id
JOIN pricing_modes pm ON pm.mode_key = 'recurring'
LEFT JOIN pricing_square_footage_tiers pt ON pt.id = r.sqft_tier_id
LEFT JOIN pricing_matrix m ON m.vertical_id = r.vertical_id
  AND m.service_offering_id = ps.service_offering_id
  AND m.service_plan_template_id = pf.service_plan_template_id
  AND m.pricing_mode_id = pm.id
  AND (m.pricing_dimension_value_id IS NOT DISTINCT FROM pt.dimension_value_id)
  AND m.source_table = 'pricing_recurring_prices' AND m.source_id = r.id
WHERE m.id IS NULL;
```

### 3.4 Recurring: amount mismatch

```sql
SELECT r.id AS legacy_id, r.amount_cents AS legacy_cents, m.amount_cents AS matrix_cents
FROM pricing_recurring_prices r
JOIN pricing_services ps ON ps.id = r.service_id
JOIN pricing_frequencies pf ON pf.id = r.frequency_id
JOIN pricing_modes pm ON pm.mode_key = 'recurring'
LEFT JOIN pricing_square_footage_tiers pt ON pt.id = r.sqft_tier_id
JOIN pricing_matrix m ON m.vertical_id = r.vertical_id
  AND m.service_offering_id = ps.service_offering_id
  AND m.service_plan_template_id = pf.service_plan_template_id
  AND m.pricing_mode_id = pm.id
  AND (m.pricing_dimension_value_id IS NOT DISTINCT FROM pt.dimension_value_id)
  AND m.source_table = 'pricing_recurring_prices' AND m.source_id = r.id
WHERE r.amount_cents IS DISTINCT FROM m.amount_cents;
```

### 3.5 Counts: legacy vs matrix (by mode)

```sql
-- First-clean: legacy count vs matrix count (initial mode)
SELECT
  (SELECT COUNT(*) FROM pricing_first_clean_prices) AS legacy_first_clean,
  (SELECT COUNT(*) FROM pricing_matrix WHERE source_table = 'pricing_first_clean_prices') AS matrix_from_first_clean;

SELECT
  (SELECT COUNT(*) FROM pricing_recurring_prices) AS legacy_recurring,
  (SELECT COUNT(*) FROM pricing_matrix WHERE source_table = 'pricing_recurring_prices') AS matrix_from_recurring;
```

## 4. Files to Update When Switching the Pricing Resolver

Do **not** change these until you explicitly switch the live flow to `pricing_matrix`. This list is for the future cutover.

| Area | File(s) | Change |
|------|--------|--------|
| **Quote RPC** | Supabase: `get_quote_pricing` (or equivalent RPC) | Implement or replace to read from `pricing_matrix` by (vertical, service key, plan/frequency key, mode, dimension value) instead of joining `pricing_first_clean_prices` / `pricing_recurring_prices`. |
| **Quote API** | `web/app/api/book-v2/quote-start/route.ts` | `computeQuote()` calls RPC; no change if only RPC impl changes. If quote logic moves to API, resolve from matrix. |
| **Quote API** | `web/app/api/book-v2/quote-refine/route.ts` | Same as quote-start. |
| **Supabase pricing** | `web/lib/pricing/supabasePricing.ts` | `getQuotePricingFromSupabase()` — backend of RPC; update when RPC is rewritten to use matrix. |
| **Admin pricing list** | `web/app/api/admin/pricing/first-clean-prices/route.ts` | Optional: add a “matrix” view or switch list to read from `pricing_matrix` filtered by mode. |
| **Admin pricing list** | `web/app/api/admin/pricing/recurring-prices/route.ts` | Same. |
| **Admin pricing create/edit** | `web/app/api/admin/pricing/*/route.ts` (POST/PATCH) | When matrix becomes source of truth: write to `pricing_matrix` (and optionally keep writing to legacy tables for a transition period). |
| **Admin UI** | `web/app/admin/financials/pricing/PricingClient.tsx` | When list/create APIs use matrix, UI can stay mode-based; only backend data source changes. |
| **Backend (Python)** | `backend/app/pricing.py` | If it calls Supabase or DB for cleaning pricing, point at matrix or new resolver. |
| **Other** | Any job/schedule price calculation that reads first_clean or recurring tables | Switch to matrix lookup by (vertical, offering, plan, mode, dimension value). |

## 5. Migration Files (This Repo)

| File | Purpose |
|------|--------|
| `supabase/migrations/20250303100000_pricing_matrix.sql` | Creates `pricing_matrix` table, indexes, optional `updated_at` trigger. |
| `supabase/migrations/20250303100001_seed_pricing_matrix_from_legacy.sql` | Seeds matrix from `pricing_first_clean_prices` and `pricing_recurring_prices`; idempotent. |

Legacy tables and existing APIs are unchanged and remain the source of truth until you switch the resolver.
