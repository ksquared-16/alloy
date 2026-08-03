---
owner: modules
status: canonical
last_reviewed: 2026-07-17
supersedes: []
---

# Commercial Configuration (Compatibility Runtime)

**Status:** ✅ **Commercial Platform V1 — SHIPPED & FROZEN (2026-07-03).** **Programs** is now the operator-facing domain; Commercial remains the internal runtime/route name until a separately authorized module migration. Canonical architecture: **[Commercial Platform V1](../commercial/commercial-platform-v1.md)**.

---

## Purpose

Commercial Configuration is the first production consumer of the Configuration Runtime. It prices and financially interprets what the organization-owned Programs catalog defines; it does not own Program identity.

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

**Route:** `/organization/programs` (canonical). Legacy
`/settings/commercial/programs` and `/admin/commercial/programs` redirect here.

**Storage:** Organization identity now uses `programs` → editable
`program_drafts` → immutable `program_revisions`.
`location_program_categories` remains the stable compatibility representation
of a Location Program offering and carries its consumed revision link.

**Ownership:** Organization. Programs define a reusable service catalog. Locations choose which Programs they offer.

**Inheritance:** Program identity is organization-owned; Location participation is availability/assignment. Rooms/Delivery Resources, capacity, and schedules are not Program-owned.

**Operator model:** "Which programs does this location offer?" Not "which settings does this location have."

**Publication backend:** `/api/admin/configuration/programs` owns draft,
validation, publication, impact preview, Location assignment, history, and
retry.
`/api/admin/location-program-categories` remains the Location offering read and
local-mutation path; direct creation of Program identity there is rejected.
Assignment creates or links the stable row and advances its consumed revision
without changing Location-owned offer state, evidence, metadata, resource
relationships, or schedules.

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

These are scoped out of V1. Program-owned commercial, funding, and billing **defaults** remain declarations on the reusable service; authoritative pricing, funding, and billing behavior stays with the corresponding domain runtime.

---

## Backend gaps

Commercial V1 remains complete on its frozen substrate. Programs now has
authoritative Organization identity, immutable publication, and revision-linked
Location consumption. `location_program_categories` still carries cached
identity columns for compatibility because enrollment, placement, rules, and
resource relationships reference its stable id. Effective Program identity
resolves from the consumed revision; the compatibility row owns availability
and permitted local values, not Program identity. Deleting or renaming this
storage is deferred. The tuition grid remains in `commercial_tuition_rates`.

The schedule type vocabulary (`childcare_schedule_type` option set) is an org option set today. Future work: per-location schedule offerings. This is deferred.

**Tuition day-count commitments** (1–5 days/week via `program_offering_variants`) are likewise an interim stand-in pending Schedule Offerings evolution — see **Deferred evolution — Schedule Offerings** in `docs/platform/commercial/ownership-model.md`. Do not rebuild tuition on schedule offerings until that design lands.

---

## Related docs

- `configuration-platform.md` — Configuration Runtime overview
- `../../system/configuration-workspace-v1-doctrine.md` — domain grouping
- `../../system/configuration-ownership-doctrine.md` — one owner per concept
