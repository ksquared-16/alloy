# Commercial Ownership Model

## Layer responsibilities

| Layer | Owns | Does not own |
|---|---|---|
| **Programs** | `program_offerings`, `program_offering_variants` | Rates, billing, cadences |
| **Commercial** | `commercial_products` (+ `commercial_categories`), `commercial_tuition_rates`, `billing_cadences` | Offering structure, variant quantities, charge posting |
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

## Commercial Product — the canonical primitive

Fee, Add-on, and Deposit are **not separate entities**. They are `commercial_type` values of one **Commercial Product** primitive, differentiated by typed **behavior**, not by structure. The Commercial Catalog is the single source of truth: `commercial_products`.

```
commercial_products                        ← the primitive (single table)
  ├─ commercial_type   fee | addon | deposit    ← open discriminator (extensible)
  ├─ category_id       FK → commercial_categories   ← operator-managed config
  ├─ amount_cents
  ├─ cadence_key       (frequency; null = one-time)
  ├─ scope             location_id, program_key
  ├─ revenue_category  (Accounting maps → GL)
  ├─ effective_start / effective_end
  ├─ behavior          jsonb (typed per commercial_type)
  ├─ is_active, metadata
  └─ source_table / source_id   ← transitional provenance (see below)
```

### Why one primitive

~80% of every fee/addon/deposit row was identical (name, scope, amount, effective dates, revenue_category, cadence, is_active, metadata). The differences were **behavioral flags describing how Billing treats the charge**, not structural. Unifying passes all three primitive tests — shared identity, differences-as-values, and downstream simplification (Billing gets one input contract). The open discriminator absorbs future charge types (tuition credit, sibling discount, late fee, scholarship) without a new table or a new UI section each time.

### Typed behavior (jsonb)

`behavior` carries the type-specific rules. Shape is validated at the API/lib layer, not by DB constraints, so new types flex freely:

| `commercial_type` | `behavior` shape |
|---|---|
| `fee` | `{ required: boolean }` |
| `addon` | `{ package?: { unit_count, unit_type, expires_days } }` — absent = plain add-on |
| `deposit` | `{ refundable: boolean, apply_to_balance: boolean, due_timing: string }` |

Accessors live in `lib/commercial/commercialProducts.ts` (`feeIsRequired`, `getPackage`, `depositBehavior`, `buildBehavior`). Promote a behavior key to a real column only when Billing needs to query/index on it.

### Accounting V1 — Revenue Category → GL Account

**Chain:**
```
Commercial Product → Revenue Category → GL Account
Tuition Rate       → Revenue Category → GL Account   (forward-compat column; UI wiring is next)
```
**Accounting owns GL accounts. Commercial never stores GL codes directly** — it references a revenue category, which maps to a GL account.

**GL accounts — reuse the existing primitive.** Alloy already has a full chart of accounts: the `gl_accounts` table (+ `gl_account_mappings`, `gl_journal_entries/lines`, `ledger_transactions`) with a live API (`/api/admin/financials/accounts`) and service layer (`lib/financials/gl/glConfigService`). Commercial does **not** own a GL-account table. (An earlier draft created `commercial_gl_accounts`; it was corrective-removed in migration `20260713000002` because `gl_accounts` already exists.)

**Revenue categories (`commercial_revenue_categories`)** — Commercial-owned, org-scoped: `label`, `mapped_gl_account_id` (FK → `gl_accounts`), `sort_order`, `is_active`. The legacy free-text `gl_code` column is retained transitional but no longer used or exposed. The Accounting tab has three sub-sections:
- **Revenue Categories** — create categories, map each to a GL account (dropdown of active `gl_accounts`), product usage count, delete.
- **GL Accounts** — **operable** chart of accounts: create (code/name/type), edit, archive/restore — via the existing `/api/admin/financials/accounts` (POST + `[id]` PATCH; **admin-role required**). No new GL table.
- **Mapping Review** — flags unmapped categories ("Needs accounting mapping") and shows the product → category → GL account chain.

**GL accounts are org-scoped.** The 6 demo `gl_accounts` seeded in the DB belong only to the *Alloy Bend* org; *Firefly Early Learning* (the dev org) had none, so its Accounting → GL Accounts read empty ("No GL accounts configured"). This was correct org-scoping, not a bug — the fix is that GL accounts are now creatable in the tab, so each org populates its own chart.

**Catalog integration:** products reference a revenue category via `revenue_category_id` (FK → `commercial_revenue_categories`) — a dropdown of configured categories, **no free-form GL code and no free-form revenue-category text**. If the chosen category is unmapped, the form and card show "Needs accounting mapping". The legacy free-text `revenue_category` column is retained transitional for backfill.

**V2 (deferred):** optionally bridge mapped revenue categories into `gl_account_mappings` so the existing posting resolver sees Commercial categories through the same chain; wire `commercial_tuition_rates.revenue_category_id` into the Tuition UI. No posting, exports, funding, or policies in V1.

### Commercial Categories (`commercial_categories`)

Operator-managed configuration, **not** free text. Org-scoped option set (same pattern as `billing_cadences` / `location_program_categories`): `key`, `label`, `sort_order`, `is_active`. Seeded per org with Registration, Enrollment, Materials, Transportation, Food, Enrichment, Other. Operators can add their own.

`category_id` is the merchandising/grouping axis (childcare language, catalog grouping, reporting rollup). It is **distinct from `revenue_category`**, which is the Accounting-facing reference that maps to a GL code. Two different jobs — both retained.

### Effective dates

`effective_start = null` means "active from day one" — deliberately unbounded, not unset. Only set a date when the product activates on a specific future date or was active only during a specific period. Never required.

### Scope model

| `location_id` | `program_key` | Scope |
|---|---|---|
| null | null | Org-wide default — all programs, all locations |
| non-null | null | Location-specific |
| null | non-null | Program-specific — all locations |
| non-null | non-null | Program + location — most specific |

Scope resolution is UI-side only; each record is independent. `formatScope` in `lib/commercial/commercialProducts.ts` formats for display.

## Legacy tables — transitional

`commercial_fees`, `commercial_addons`, `commercial_deposits` are **retained as transitional storage** for backward compatibility. They are **no longer the source of truth** and the Commercial Catalog UI no longer reads them. The migration `20260711000001_commercial_products_primitive.sql` is **non-destructive** — it creates the new tables and backfills products from the legacy rows (idempotent via `(source_table, source_id)`), keeping the old tables intact.

- Backfilled products carry `source_table` / `source_id` provenance.
- Legacy free-text `fee_type` / `addon_type` are preserved in `metadata.legacy_type`; category is best-effort matched to a seeded category (case-insensitive label), falling back to "Other".
- The legacy `/api/admin/commercial/{fees,addons,deposits}` routes and `lib/commercial/feesAddons.ts` remain temporarily for backcompat.

### Future cleanup step (deferred — do not run yet)

Once `commercial_products` is confirmed authoritative across all consumers:
1. Repoint any remaining reader of the legacy tables to `commercial_products`.
2. Remove the legacy API routes (`fees`, `addons`, `deposits`) and `lib/commercial/feesAddons.ts`.
3. Drop `commercial_fees`, `commercial_addons`, `commercial_deposits` in a dedicated destructive migration (separate PR, explicit approval).

**Guardrail:** the catalog has one source of truth after this sprint — `commercial_products`. Old tables exist only as transitional storage.

### What is deferred

Not built in this sprint; do not add until explicitly scoped:

- Tuition collapse — tuition stays Program → Offering → Variant → `commercial_tuition_rates` (matrix-priced). Long-term it may become a Commercial Product with a pricing strategy, but not now.
- Automated triggers (posting a charge when a condition fires) — Policies domain
- Family-level overrides (waiving/adjusting for a specific family) — Policies domain
- Add-on enrollment linkage (which families elected a product) — separate domain
- Refund lifecycle, deposit release, package consumption — Billing V2

## Future commercial domains (not yet built)

These domains are planned but not implemented. Do not build until explicitly scoped.

| Domain | Covers | Relationship to current model |
|---|---|---|
| **Add-On Programs** | Enrichment passes, extended care, after-school | Separate program_offerings in their own program category; billed independently |
| **Funding Sources** | Subsidies, vouchers, scholarships | Applies against tuition rates at billing time; separate domain with payer splits |
| **Billing Policies** | Sibling discounts, late fees, grace periods, proration rules | Policy engine applied at charge-generation time |
| **Accounting** | GL category mappings, revenue recognition rules | Maps from commercial rate categories → chart of accounts entries |

Current model: `commercial_tuition_rates` is private-pay tuition only. `payer_type` exists on the row to support funding source differentiation later, but no split logic is built yet.

## Color token audit (Bend Pine vs Midnight Forge)

The Commercial UI's "old blue admin" look traced to a **mislabeled brand token**, not a Commercial styling bug.

| Brand role | Correct hex | Token that holds it |
|---|---|---|
| Bend Pine (active/success/selected accent) | `#00A283` | `--color-alloy-juniper` (misnamed); now also `--color-alloy-bend-pine` (canonical) |
| Midnight Forge (structural slate) | `#273F52` | `--color-alloy-pine` (misnamed "Bend Pine"); now also `--color-alloy-midnight-forge` (canonical) |
| Alloy Blue | `#00458C` | `--color-alloy-blue` ✅ |
| Ember | `#BC4300` | `--color-alloy-ember` ✅ |
| River Stone | `#F4F6F9` | `--color-alloy-stone` ✅ |

**Defect:** `--color-alloy-pine` = `#273F52` (Midnight Forge) but its comment claimed "Bend Pine." The true Bend Pine green (`#00A283`) lives under `alloy-juniper` — confirmed by `alloyOsRuntime.css` ("Bend Pine (alloy-juniper == #00A283)"). `alloy-pine` is used across ~240 files, mostly as a slate accent (intended Midnight Forge), so its value must **not** be flipped to green.

**Correction (Phase 0, non-breaking):** added canonical, brand-honest aliases `--color-alloy-bend-pine` (`#00A283`) and `--color-alloy-midnight-forge` (`#273F52`) — same values, correct names. Corrected the misleading comments. `alloy-pine` / `alloy-juniper` retained as deprecated same-value aliases. Commercial now uses `alloy-bend-pine`. Zero visual change outside Commercial (which stays the same green).

**Migration (Phases 1–2, deferred, per-intent review):** migrate each `alloy-pine` usage to `bend-pine` (accent) or `midnight-forge` (slate) by inspection; reconcile the `--home-*` mirror; remove deprecated aliases once usage is zero. The `#18273A` deep-ink under `alloy-forge`/`alloy-midnight` (6,117 text usages) is a separate role, out of scope.

## API surface

```
GET/POST /api/admin/programs/offerings
GET/PATCH/DELETE /api/admin/programs/offerings/[id]
GET/POST /api/admin/programs/offerings/[id]/variants
PATCH/DELETE /api/admin/programs/offerings/[id]/variants/[variantId]

GET/POST /api/admin/commercial/tuition-rates        (body: { variant_id, cadence_key, … })
PATCH/DELETE /api/admin/commercial/tuition-rates/[id]

# Commercial Catalog (canonical)
GET/POST /api/admin/commercial/products             (body: { name, commercial_type, category_id, amount_cents, cadence_key, behavior, … })
PATCH/DELETE /api/admin/commercial/products/[id]     (commercial_type is immutable after create)
GET/POST /api/admin/commercial/categories           (body: { label, key?, sort_order? })
PATCH/DELETE /api/admin/commercial/categories/[id]   (DELETE soft-archives if products reference it)
# Accounting V1 — Revenue Category → GL Account
GET/POST /api/admin/commercial/revenue-categories    (body: { label, mapped_gl_account_id? })
PATCH/DELETE /api/admin/commercial/revenue-categories/[id]   (PATCH maps → gl_accounts)
GET/POST/PATCH /api/admin/financials/accounts        ← EXISTING chart of accounts (gl_accounts); reused, not rebuilt

# Legacy (transitional — do not build on)
GET/POST/PATCH/DELETE /api/admin/commercial/{fees,addons,deposits}
```

The `GET /tuition-rates` endpoint accepts `?offering_id=` for backward compatibility — it resolves the offering's variant IDs internally and returns all matching rates.
