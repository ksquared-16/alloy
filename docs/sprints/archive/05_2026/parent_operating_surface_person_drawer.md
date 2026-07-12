# Parent Operating Surface — Person Drawer

**Date:** 2026-05-29  
**Status:** Shipped — IA locked (cleanup pass 2026-05-29)

---

## Doctrine

- **Person** is identity; parent/guardian is a **role/profile**, not a separate entity or drawer system.
- Reuse AdminV2 drawer primitives (`AdminEntityDrawer`, opportunity/child visual tokens).
- **Child-first rule:** mixed-role persons keep child lifecycle chrome; parent operating chrome applies when emphasis is `guardian_communication` and the person is not a child profile.
- Person **status** (`persons.status_key`) uses `person_generic` applicability only: active, inactive, archived — not child lifecycle keys (withdrawn, graduated, future_start).

---

## Shipped surfaces

| Area | Implementation |
|------|----------------|
| Header | `PersonDrawerParentTitleRow` — name, role pill, opt-out pill, household/child context |
| Status | `personDrawerParentHeaderStatus` — filtered `status_profile=person_generic` |
| Summary | `PersonDrawerParentSummary` — first/last, email, phone, preferred contact, communication opt-out (when field defs exist) |
| BOS | `PersonDrawerParentSummaryBosPanel` — same right-column pattern as child/opportunity |
| Household | `PersonDrawerHouseholdSection` (shared with child drawer) — Guardians \| Children columns; Emergency contacts and Authorized pickups below; primary badge on guardian |
| Communication opt-out | Editable in **Parent summary** only (no duplicate Communication Preferences section) |
| Modules | `PersonDrawerParentLifecycleRail` — Documents, Communications, Activity (in-drawer tabs) |
| Address | `PersonDrawerHouseholdAddress` — **customer `locations` row** (`location_type=address`) when present; else interim person `field_values` only (documented gap) |
| Comms tab | `CommunicationsDrawerSection` (`apiEntityType=persons`) — threads/notes/tasks filtered by person_id |
| Loading | Seed from opportunity primary contact; summary on seed; household after hydrate |
| Open seed | `presentation_emphasis: guardian_communication` on lead/household adult open |

---

## Locked hierarchy (cleanup pass)

```
HEADER (left)
  Status dropdown · Record # · Back

TITLE
  Name · Parent/Guardian pill · Opt-out pill (when true)

OVERVIEW
  Parent summary + BOS
  Household
  Address
  Employee status
  [Documents / Communications / Activity via module chips → tabs]

NOT in parent chrome
  Profile / Contact / Record Info sections
  Basic / duplicate name·email·phone
  Communication Preferences duplicate section
  Enrollment activity
  Header-right Active status badge
```

---

## Address ownership (2026-05-29)

| Source | Table / field | Notes |
|--------|----------------|-------|
| **Canonical** | `locations` where `customer_id` set and `location_type = 'address'` | Household/account mailing address; projected as `_household_customer_addresses` on person GET |
| **Not on customers** | `customers` has no address columns | Use customer location rows, not customer row |
| **Interim only** | Person `field_values` (`address_line1`, `city`, …) | Shown only when no customer location address exists; labeled interim in UI |

Do not treat person-only address fields as canonical when a household location exists.

---

## Key modules

| Module | Role |
|--------|------|
| `personDrawerParentChrome.ts` | Chrome gating + profile hint |
| `personDrawerParentSummaryModel.ts` | Summary field model |
| `resolvePersonDrawerParentHouseholdModel.ts` | Household groups + header context stamp |
| `personDrawerParentRelationshipRoles.ts` | `customer_persons` role chips |
| `resolvePersonDrawerParentModuleNavModel.ts` | Module shortcuts |

---

## Relationship roles (display only)

Shown when present on `customer_persons`:

- Primary guardian (`is_primary` + parent roles)
- Parent / Guardian
- Billing responsible (`payer`, `billing`, …)
- Authorized pickup (`authorized_pickup`, `pickup`)
- Emergency contact (role only — **module not built**)

See `PERSON_DRAWER_PARENT_DEFERRED_ROLE_FIELDS` in `personDrawerParentRelationshipRoles.ts`.

---

## Deferred items

- Emergency contact **module** (reachability workflow)
- Billing **module** (ledger/account)
- Demo data reseed for parent/child households
- BOS parent insights (signal slot)
- Profile-aware `record_drawer_layouts` for parent section order
- Email/phone validity indicators (when validation metadata exists)
- Full authorized pickup workflow (notes field `authorized_pickup_notes` exists in field registry)

---

## Related

- [`child_profile_person_drawer_doctrine.md`](./child_profile_person_drawer_doctrine.md)
- [`person_relationship_child_lifecycle_foundation.md`](./person_relationship_child_lifecycle_foundation.md)
