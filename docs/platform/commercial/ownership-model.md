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

## Program scoping

Each **Program** independently owns its Offerings, Variants, and Rates. There is no sharing across programs.

```
Infant Program
  └─ Full Day offering   → variants → rates
  └─ Part Day offering   → variants → rates

Toddler Program
  └─ Full Day offering   → variants → rates   ← different records; no relation to Infant's Full Day
  └─ Part Day offering   → variants → rates
```

"Infant Full Day" and "Toddler Full Day" are separate `program_offerings` records linked to separate `program_key` values in `location_program_categories`. They share a label but have independent variant sets and independent rate tables. There is no global "Full Day" template — each program configures its own.

## Rooms (future relationship)

**Location ownership:**
```
Location
  └─ Rooms (capacity, square footage, resources)
       └─ (future) room_program_assignments: which programs/offerings use this room
       └─ (future) room_schedule_blocks: when a room is in use
```

**Commercial pricing does not touch rooms.** Rates attach to `program_offering_variants`, not rooms. Room capacity and scheduling are a separate concern owned by the Location layer. The future relationship is:

- A room hosts a program/offering for capacity and scheduling
- An offering's variant determines how many days/week a child attends
- Commercial sets the price for that variant — independent of which room it occurs in

When room-based scheduling is built, the join will be `program_offerings ↔ rooms` (many-to-many), not `commercial_tuition_rates ↔ rooms`. Rates stay program/variant-scoped.

## Fees, Add-ons & Deposits

Three separate primitives — not subtypes of one another.

### Fees (`commercial_fees`)

Required or triggered charges beyond tuition. Examples: registration fee, application fee, materials fee, annual re-enrollment fee.

- `fee_type` enum: `registration | application | materials | annual | other`
- `cadence_key = null` → one-time. Non-null (e.g. `annual`) → recurring.
- `is_required` distinguishes a mandatory charge from an optional one.
- Commercial owns fee definitions and amounts. Billing owns when and whether to post the charge.

### Add-ons (`commercial_addons`)

Optional recurring or one-time commercial products families can elect. Examples: extended care, enrichment, lunch program, transportation.

- `addon_type` enum: `extended_care | enrichment | lunch | transport | other`
- `cadence_key` is required (e.g. `monthly`, `weekly`, `per_session`, `one_time`).
- An add-on is a commercial product definition. Enrollment linkage (which families elected this add-on) is a separate domain not yet built.

### Deposits (`commercial_deposits`)

A deposit is a separate primitive — not a fee subtype — because it has a distinct refund lifecycle.

- `is_refundable`: whether the deposit is returned on departure.
- `apply_to_balance`: whether the deposit is credited toward the first tuition charge at billing time.
- `due_timing` enum: `at_enrollment | at_acceptance | at_contract | other`
- Refund processing is owned by Billing V2 (not yet built).

### Scope model

All three tables share the same scope pattern:

| `location_id` | `program_key` | Scope |
|---|---|---|
| null | null | Org-wide default — applies to all programs at all locations |
| non-null | null | Location-specific — applies to all programs at that location |
| null | non-null | Program-specific — applies to that program at all locations |
| non-null | non-null | Program + location — most specific |

Scope resolution is currently UI-side only. There is no server-side inheritance or fallback — each record is independent. The `formatScope` helper in `lib/commercial/feesAddons.ts` formats scope for display.

### What is deferred

The following are **not** built in Commercial Experience 02 and must not be added until explicitly scoped:

- Pass/package model (enrollment in a bundle of add-on sessions)
- Automated fee triggers (posting a fee when a condition fires)
- Family-level overrides (waiving or adjusting a fee for a specific family)
- Add-on enrollment linkage (tracking which families have elected an add-on)
- Refund lifecycle and deposit release (Billing V2 domain)

## Future commercial domains (not yet built)

These domains are planned but not implemented. Do not build until explicitly scoped.

| Domain | Covers | Relationship to current model |
|---|---|---|
| **Add-On Programs** | Enrichment passes, extended care, after-school | Separate program_offerings in their own program category; billed independently |
| **Funding Sources** | Subsidies, vouchers, scholarships | Applies against tuition rates at billing time; separate domain with payer splits |
| **Billing Policies** | Sibling discounts, late fees, grace periods, proration rules | Policy engine applied at charge-generation time |
| **Accounting** | GL category mappings, revenue recognition rules | Maps from commercial rate categories → chart of accounts entries |

Current model: `commercial_tuition_rates` is private-pay tuition only. `payer_type` exists on the row to support funding source differentiation later, but no split logic is built yet.

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
