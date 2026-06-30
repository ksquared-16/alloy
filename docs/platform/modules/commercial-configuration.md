# Commercial Configuration

**Status:** V1 — Programs & Tuition (June 2026).

---

## Purpose

Commercial Configuration is the first production consumer of the Configuration Runtime. It owns the business structure of an operator's offering: what programs they run and what they charge for them.

Commercial Configuration surfaces feel like "I am configuring my business" — not "I am configuring software."

---

## Architecture position

```
Configuration Runtime
  ↓  (scope, ownership, inheritance, config workspace patterns)
Commercial Configuration
  ↓  (program catalog, tuition rate grid)
Programs & Tuition UX
```

Commercial consumes the Configuration Runtime. It does not own runtime primitives — those belong to the Configuration Runtime and are reusable by future domains (Scheduling, Billing, Documents, etc.).

---

## Scope model

| Scope | Meaning |
|-------|---------|
| **Org default** | Applies to all locations unless overridden |
| **Location override** | Site-specific value, wins over org default |

Implemented via `lib/configRuntime/scope.ts` — `ConfigScope`, `ConfigOwner`, `resolveInherited`.

---

## Domain: Programs

**Route:** `/admin/commercial/programs`

**Storage:** `location_program_categories` (existing table, per-site).

**Ownership:** Location. Each site owns its own program list. Org-level program catalog is the union of all site programs, seeded from common defaults (Infant, Toddler, Preschool, Pre-K, School Age).

**Inheritance:** Programs are location-owned — there is no org-level override. Each site configures exactly the programs it offers.

**Operator model:** "Which programs does this location offer?" Not "which settings does this location have."

**Backend reused:** `location_program_categories` + `/api/admin/location-program-categories` (GET, POST, PATCH). No new tables.

---

## Domain: Tuition

**Route:** `/admin/commercial/tuition`

**Storage:** `commercial_tuition_rates` (new table, June 2026).

**Schema:** `(org_id, location_id, program_key, schedule_key, billing_period) → rate_cents`

- `location_id = NULL` = org default
- `location_id = <site_id>` = location override

**Ownership:** Org for defaults, Location for overrides.

**Inheritance:** The tuition grid resolves: location override → org default. If a location has no override for a cell, it inherits the org rate. Implemented in `lib/commercial/tuitionRates.ts` via `buildTuitionRateMap`.

**Grid structure:** Rows = programs (`location_program_categories.key`), Columns = schedule types (`childcare_schedule_type` option set). Each cell = a rate in cents.

**Billing periods:** weekly | biweekly | monthly | annual. Default: monthly.

**Operator model:** "What do we charge for Infant full-time at this location?" Displayed as a spreadsheet-style grid with inline editing.

---

## Configuration Runtime primitives used

| Primitive | Source | Used for |
|-----------|--------|----------|
| `ConfigScope` | `lib/configRuntime/scope.ts` | Tuition scope (org vs location) |
| `ConfigOwner` | `lib/configRuntime/scope.ts` | Ownership indicator |
| `resolveInherited` | `lib/configRuntime/scope.ts` | Rate inheritance resolution |
| `OwnershipBadge` | `components/configRuntime/OwnershipBadge.tsx` | Scope display in grid and program list |

---

## Future domains (deferred)

- **Funding Sources** — discount programs, subsidies, vouchers
- **Fees & Add-Ons** — registration fees, supply fees, activity fees
- **Billing Policies** — payment schedules, late fees, auto-billing
- **Accounting** — chart of accounts, revenue recognition
- **Simulator** — what-if tuition modeling

These are scoped out of V1. Do not build them until Programs & Tuition is stable.

---

## Backend gaps

None in V1. The backend for Programs reuses `location_program_categories`. The tuition grid adds `commercial_tuition_rates` — a genuine new domain, not a workaround.

The schedule type vocabulary (`childcare_schedule_type` option set) is an org option set today. Future work: per-location schedule offerings. This is deferred.

---

## Related docs

- `configuration-platform.md` — Configuration Runtime overview
- `../../system/configuration-workspace-v1-doctrine.md` — domain grouping
- `../../system/configuration-ownership-doctrine.md` — one owner per concept
