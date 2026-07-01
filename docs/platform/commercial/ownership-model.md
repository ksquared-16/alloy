# Commercial Ownership Model

## Layer responsibilities

| Layer | Owns | Does not own |
|---|---|---|
| **Programs** | `program_offerings`, `program_offering_variants` | Rates, billing, cadences |
| **Commercial** | `commercial_tuition_rates`, `billing_cadences` | Offering structure, variant quantities |
| **Billing** | Posting, charges, obligations | Rate decisions |

## Hierarchy

```
location_program_categories (program_key)
  └─ program_offerings       (attendance type: Full Day, Part Day, Drop-In, …)
       └─ program_offering_variants  (quantity: 2 days/week, 5 days/week, or transparent default)
            └─ commercial_tuition_rates  (variant_id × cadence_key × payer_type × location_id)
```

## Why variants exist

Offerings express *type* (Full Day). Variants express *quantity* (2 days/week vs 5 days/week). Separating them lets operators add or remove quantity options without restructuring offering records or migrating rates.

**No-quantity offerings** (Drop-In, Hourly, Before School, After School) receive a single transparent default variant (`quantity_type = null`, `quantity_value = null`). The UI omits the variant sub-header for these. Rates still attach to the variant, never directly to the offering.

## Rate scoping

`location_id = null` → org default. Non-null → location override. Rates fall back to the org default when no location row exists. This is resolved client-side in `buildTuitionRateMap`.

## `not_offered` semantics

`not_offered` is a **rate-level, cadence-level, scope-level** exception — e.g. a location that only bills monthly marks `weekly` as `not_offered` for that variant at that location. It is *not* a global on/off for the offering or variant. Global availability is controlled by `program_offerings.is_active` and `program_offering_variants.is_active`.

## Structural guards

- **PATCH variant**: blocks `quantity_type` / `quantity_value` changes if rates already exist for that variant (409). Use a new variant instead.
- **DELETE variant**: blocks deletion of the last active variant on an offering (409). Soft-archives to `archived` status if rates exist; hard-deletes if no rates.

## Key constants

```typescript
// programOfferings.ts
NO_QUANTITY_ATTENDANCE_TYPES = new Set(["drop_in", "hourly", "before_school", "after_school"])

// programOfferingVariants.ts
isDefaultVariant(v) // quantity_type === null && quantity_value === null
autoVariantLabel(5, "days") // "5 days/week"
autoVariantLabel(1, "days") // "1 day/week"  (singular)
```

## API surface

```
GET/POST /api/admin/programs/offerings
GET/PATCH/DELETE /api/admin/programs/offerings/[id]
GET/POST /api/admin/programs/offerings/[id]/variants
PATCH/DELETE /api/admin/programs/offerings/[id]/variants/[variantId]

GET/POST /api/admin/commercial/tuition-rates        (body: { variant_id, cadence_key, … })
PATCH/DELETE /api/admin/commercial/tuition-rates/[id]
```

The `GET /tuition-rates` endpoint accepts `?offering_id=` for backward compatibility — it resolves the offering's variant IDs internally and returns all matching rates.
