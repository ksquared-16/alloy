# Childcare Field Catalog Inventory

**Path:** `docs/platform_convergence/childcare_field_catalog_inventory.md`  
**Date:** 2026-06-08  
**Scope:** Layout config picker (`/adminV2/settings/layouts`) — catalog only, no runtime cutover

---

## Operator entities

| Operator label | Internal load key | field_definitions entity_type |
|----------------|-------------------|--------------------------------|
| Lead | `opportunity` | `opportunity` |
| Child | `child` (+ `inquiry_child` merged) | `person` (bridge), `inquiry_child` |
| Parent / Contact | `person` | `person` |
| Household | `customer` | `customer` |
| Location | `location` | `location` |

Manifest: `web/lib/layout/childcareLayoutFieldCatalog.ts`

---

## Starter catalog by entity

### Lead (13 fields)

| Picker label | refKey | DB-backed |
|--------------|--------|-----------|
| Lead status | `opportunity.status_key` | native |
| Lead source | `opportunity.source` | native |
| Lead created date | `opportunity.created_at` | computed |
| Desired start date | `opportunity.desired_start_date` | seeded |
| Tour date | `opportunity.tour_date` | seeded |
| Tour time | `opportunity.tour_time` | seeded |
| Tour status | `opportunity.tour_status` | seeded |
| Program interest | `opportunity.program_type` | seeded |
| Schedule interest | `opportunity.schedule_type` | seeded |
| Lead notes | `opportunity.customer_notes` | native |
| Campaign | `opportunity.campaign` | seeded |
| Channel | `opportunity.channel` | seeded |

### Child (16 fields)

Profile, enrollment (`inquiry_child.*` internal), and medical fields — single **Child** picker group.

Includes: first/last/preferred name, DOB, age (computed), gender, program/schedule/start/room/location/enrollment status, allergies, medical notes, special instructions, notes.

### Parent / Contact (12 fields)

First/last name, email, phone, secondary phone, relationship to child, address, communication preference, SMS/email opt-in, employer, notes.

### Household (7 fields)

Household name, primary/secondary contact, address, family notes, household status, family number.

### Location (8 fields)

Location name, address, phone, director, capacity, programs offered, hours, status.

---

## Fields hidden from picker

- All `child_inquiry.*` (deprecated)
- Record numbers except `customer.customer_number` (shown as Family number)
- Raw `*_id` / `*_uuid` fields (except catalog-approved selects like `inquiry_child.location_id`)
- `opportunity.job_date`, `opportunity.location`, mis-grained `child.program` etc.
- `person.primary_*`, `person.person_number`, internal lifecycle/pipeline keys
- `child.name`, `child.age_band` (replaced by operator labels Age, first/last name)

Module: `CHILDCARE_HIDDEN_REF_KEYS` in `childcareLayoutFieldCatalog.ts`

---

## Missing fields created (migration)

**File:** `supabase/migrations/20260608120000_childcare_layout_field_catalog_seed.sql`

Seeds all-org `field_definitions` for: opportunity tour/enrollment fields, person contact/consent/medical fields, customer household fields, location site profile fields, and supporting option sets.

Prior partial coverage: `20260430211000_childcare_mvp_control_plane_seed.sql` (childcare-industry orgs only), `20260529160000_location_metadata_field_definitions_convergence.sql`, `20260607120000_inquiry_child_native_parity_fc15.sql`.

---

## Runtime note

Picker refKeys remain canonical for FC-3 runtime mappers (`inquiry_child.*`, `person.*`, etc.). This sprint does **not** change drawer VM, queue runtime, or LayoutDoc migration.

---

*Layout config catalog only.*
