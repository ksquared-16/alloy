# Childcare Field Catalog — Source-of-Truth Matrix

**Path:** `docs/platform_convergence/childcare_field_catalog_source_matrix.md`  
**Date:** 2026-06-08  
**Scope:** Audit / correction pass — catalog + migration **draft** updated; **no commit, no migration apply** until sign-off  
**Catalog under review:** `web/lib/layout/childcareLayoutFieldCatalog.ts`  
**Related migration (DRAFT — do not apply):** `supabase/migrations/20260608120000_childcare_layout_field_catalog_seed.sql`

---

## Executive summary

The childcare layout catalog was grouped by **operator-facing entity**, but several refKeys assume storage on the wrong table or duplicate address/contact data across Person and Household. This matrix maps each catalog field to its **actual** storage path per schema (`docs/supabase/reference/supabase_schema_columns.csv`) and active doctrine (`docs/system/entity-model.md`, `docs/platform_convergence/entity_relationship_reference_model.md`).

**Key corrections required before further seeding:**

| Issue | Impact |
|-------|--------|
| Child profile fields use `child.*` / `person.*` refKeys but durable child SoT is **`customer_members`** | Wrong storage path; FC-3 mapper must not read `persons` for child name/DOB on lead layouts |
| **`person.is_employee` / `person.employee_id` missing** from catalog | Required parent/employee fields exist natively on `persons` but are not picker-eligible |
| **`person.address_line1`** duplicates household address | Family address should resolve via **`customer` → `locations`** (household_address role), not person config |
| **`person.secondary_phone`** is not a `persons` column | Should be **relationship projection** from secondary contact person, not a person field_def |
| **`customer.primary_contact` / `secondary_contact`** seeded as text config | Should be **relationship projections** from `customers.primary_contact_id` + household persons |
| **`location.name` / `location.address_line1`** seeded as metadata | Native columns are **`locations.label`**, **`address1`/`city`/…** — migration misaligned |
| **`person.relationship_to_child`** invented in migration | Should bind to **`customer_persons.role_type`** or **`person_relationships`**, not a standalone person config key |
| Lead-level **`opportunity.desired_start_date` / program / schedule`** overlap child OCM | Case-level vs per-child enrollment — both may appear in picker but must resolve to different grains |

**Doctrine:** Field picker = operator layout context. RefKey = technical binding. Storage path = truth. A field on a Parent layout may resolve through Household or Opportunity relationships.

---

## Source type legend

| Source type | Meaning |
|-------------|---------|
| **Native column** | Physical column on authoritative table |
| **Config field** | `field_definitions` row → `field_values` (or entity `metadata` when configured) |
| **Relationship projection** | Resolved via FK/join (`primary_contact`, `customer_persons`, `person_relationships`, OCM on lead) |
| **Computed field** | Derived at read time (age, created date, display labels) |
| **Internal/system only** | Exists in schema but not for layout picker (IDs, record numbers, pipeline) |

**Editable?** = Can an operator PATCH/write today through established admin paths (not layout runtime FC-3).

**Should appear in picker?** = Recommendation after this audit (Yes / Hide / Defer FC-3 / Fix refKey first).

---

## Lead (13 fields)

| Operator Group | Display Field | RefKey | Source Type | Source Table / Relation | Storage Path | Editable? | Picker? | Notes |
|---|---|---|---|---|---|---|---|---|
| Lead | Lead status | `opportunity.status_key` | Native column | `opportunities` | `opportunities.status_key` | Yes (deferred policy) | **Yes** | Case-level pipeline status |
| Lead | Lead source | `opportunity.source` | Native column | `opportunities` | `opportunities.source` | Yes | **Yes** | Native PATCH allowlist |
| Lead | Lead created date | `opportunity.created_at` | Computed field | `opportunities` | `opportunities.created_at` | No | **Yes** | Read-only display |
| Lead | Desired start date | `opportunity.desired_start_date` | Config field | `opportunities` | `field_values` (entity_type=opportunity) and/or workflow metadata | Partial | **Defer** | Overlaps lead-level intent; per-child SoT is **`opportunity_customer_members.desired_start_date`**. Pick one grain or show both with distinct labels |
| Lead | Tour date | `opportunity.tour_date` | Config field | `opportunities` | `field_values` / tour workflow metadata | Partial | **Yes** | Seeded `field_definitions`; drawer policy = workflow/metadata |
| Lead | Tour time | `opportunity.tour_time` | Config field | `opportunities` | `field_values` / metadata | Partial | **Yes** | Seeded in `20260608120000`; no native column |
| Lead | Tour status | `opportunity.tour_status` | Config field | `opportunities` | `field_values` / metadata | Partial | **Yes** | Seeded in `20260608120000`; no native column |
| Lead | Program interest | `opportunity.program_type` | Config field | `opportunities` | `field_values` (option_set `childcare_program_type`) | Yes | **Defer** | Case-level program interest; child grain = **`inquiry_child.desired_program_type` → OCM** |
| Lead | Schedule interest | `opportunity.schedule_type` | Config field | `opportunities` | `field_values` (option_set `childcare_schedule_type`) | Yes | **Defer** | Same grain conflict as program |
| Lead | Lead notes | `opportunity.customer_notes` | Native column | `opportunities` | `opportunities.customer_notes` | Yes | **Yes** | Drawer alias to `metadata.notes` on PATCH |
| Lead | Campaign | `opportunity.campaign` | Config field | `opportunities` | `opportunities.metadata.campaign` (expected) | Partial | **Defer FC-3** | No native column; not in all-org seed — metadata convention only |
| Lead | Channel | `opportunity.channel` | Config field | `opportunities` | `opportunities.metadata.channel` (expected) | Partial | **Defer FC-3** | Same as campaign |

---

## Child (16 fields)

Split into **durable child profile**, **enrollment/participation (OCM)**, **medical config**, and **computed**.

| Operator Group | Display Field | RefKey | Source Type | Source Table / Relation | Storage Path | Editable? | Picker? | Notes |
|---|---|---|---|---|---|---|---|---|
| Child | First name | `child.first_name` | Native column | `customer_members` | `customer_members.first_name` | Yes | **Fix refKey** | Catalog maps to `person` field_def — **wrong**. Durable child ≠ person row unless `person_id` bridge |
| Child | Last name | `child.last_name` | Native column | `customer_members` | `customer_members.last_name` | Yes | **Fix refKey** | Same correction |
| Child | Preferred name | `child.preferred_name` | Config field | `customer_members` | `field_values` (entity_type=**customer_member**) | Yes | **Yes** | **Moved from `person.preferred_name`.** Not a native `customer_members` column; requires FC-CM-1 migration |
| Child | Date of birth | `child.date_of_birth` | Native column | `customer_members` | `customer_members.dob` | Yes | **Yes** | |
| Child | Age | `child.age` | Computed field | `customer_members` | Derived from `customer_members.dob` | No | **Yes** | Computed projection; blank until FC-3 |
| Child | Gender | `child.gender` | Config field | `customer_members` | `field_values` (entity_type=**customer_member**) | Yes | **Yes** | **Moved from `person.gender`.** Legacy person seed (`20260529220000`) is adult/legacy bridge only — not childcare child profile SoT |
| Child | Program interest | `inquiry_child.desired_program_type` | Native column | `opportunity_customer_members` | `opportunity_customer_members.desired_program_type` | Yes | **Yes** | Enrollment grain only — not on Lead. **Options:** org `childcare_program_type` option set (stable `item_key`); **should** filter by site offerings — audit: [`program_interest_configurable_model_audit.md`](../sprints/06_2026/program_interest_configurable_model_audit.md). FC-15 `field_definitions` missing `config.option_set_key`; forms/intake render as text today. |
| Child | Schedule interest | `inquiry_child.desired_schedule_type` | Native column | `opportunity_customer_members` | `opportunity_customer_members.desired_schedule_type` | Yes | **Yes** | **Options:** org `childcare_schedule_type` option set. Same form wiring gap as program; site-scoped schedule deferred. |
| Child | Desired start date | `inquiry_child.desired_start_date` | Native column | `opportunity_customer_members` | `opportunity_customer_members.desired_start_date` | Yes | **Yes** | Per-child; not duplicated on Lead |
| Child | Room / cohort | `inquiry_child.program_room_cohort_key` | Native column | `opportunity_customer_members` | `opportunity_customer_members.program_room_cohort_key` | Yes | **Yes** | **Options:** `locations.id` of `unit` under selected site (drawer); filter by site + optionally `metadata.category` ↔ program key. Not option_set. |
| Child | Location / school | `inquiry_child.location_id` | Native column (FK) | `opportunity_customer_members` → `locations` | `opportunity_customer_members.location_id` | Yes | **Yes** | School/site address ≠ household address. **Options:** active `locations` where `location_type = 'site'`. |
| Child | Enrollment status | `inquiry_child.outcome_status_key` | Native column | `opportunity_customer_members` | `opportunity_customer_members.outcome_status_key` | Yes | **Yes** | Per-child lifecycle SoT |
| Child | Allergies | `child.allergies` | Config field | `customer_members` | `field_values` (entity_type=**customer_member**) | Yes | **Yes** | **Moved from `person.allergies`.** Legacy MVP seed on person is deprecated for child layouts |
| Child | Medical notes | `child.medical_notes` | Config field | `customer_members` | `field_values` (entity_type=**customer_member**) | Yes | **Yes** | **Moved from `person.medical_notes`** |
| Child | Special instructions | `child.special_instructions` | Config field | `customer_members` | `field_values` (entity_type=**customer_member**) | Yes | **Yes** | Distinct from person `authorized_pickup_notes` (household pickup policy) |
| Child | Notes | `inquiry_child.notes` | Native column | `opportunity_customer_members` | `opportunity_customer_members.notes` | Yes | **Yes** | Enrollment-context notes, not durable child profile |

---

## Parent / Contact (12 fields in catalog + 2 missing)

| Operator Group | Display Field | RefKey | Source Type | Source Table / Relation | Storage Path | Editable? | Picker? | Notes |
|---|---|---|---|---|---|---|---|---|
| Parent / Contact | First name | `person.first_name` | Native column | `persons` | `persons.first_name` | Yes | **Yes** | Primary contact on lead via `opportunities.primary_person_id` |
| Parent / Contact | Last name | `person.last_name` | Native column | `persons` | `persons.last_name` | Yes | **Yes** | |
| Parent / Contact | Email | `person.email` | Native column | `persons` | `persons.email` | Yes | **Yes** | |
| Parent / Contact | Phone | `person.phone` | Native column | `persons` | `persons.phone` | Yes | **Yes** | |
| Parent / Contact | Secondary phone | `person.secondary_phone` | Relationship projection | `opportunity_persons` / secondary person | Secondary contact **`persons.phone`** | Read via relation | **Fix refKey** | **Not a persons column.** Remove person field_def; use relationship binding |
| Parent / Contact | Relationship to child | `person.relationship_to_child` | Relationship projection | `customer_persons` / `person_relationships` | `customer_persons.role_type` or edge type | Partial | **Fix refKey** | **`relationship_to_child` field_def is incorrectly seeded** — not canonical storage |
| Parent / Contact | Address | `person.address_line1` | Relationship projection | `customers` → `locations` | Household **`locations.address1`** (household_address) | Partial | **Hide — use household** | Person mailing address field_def **duplicates family address**. Doctrine: parent address on layout = **household address projection**, not person config |
| Parent / Contact | Communication preference | `person.communication_preference` | Config field | `persons` | `field_values` | Yes | **Yes** | Seeded in `20260608120000` |
| Parent / Contact | SMS opt-in | `person.sms_opt_in` | Config field | `persons` | `field_values` | Yes | **Yes** | Distinct from legacy `communication_opt_out` seed |
| Parent / Contact | Email opt-in | `person.email_opt_in` | Config field | `persons` | `field_values` | Yes | **Yes** | |
| Parent / Contact | Employer | `person.employer` | Config field | `persons` | `field_values` | Yes | **Yes** | Seeded in `20260608120000`; no native column |
| Parent / Contact | Notes | `person.contact_notes` | Config field | `persons` | `field_values` | Yes | **Yes** | Seeded in `20260608120000` |
| Parent / Contact | **Employee (checkbox)** | **`person.is_employee`** | **Native column** | **`persons`** | **`persons.is_employee`** | **Yes** | **Add — Yes** | **MISSING from catalog.** Native; rendered in PersonEmployeePlacementSection |
| Parent / Contact | **Employee ID** | **`person.employee_id`** | **Native column** | **`persons`** | **`persons.employee_id`** | **Yes** | **Add — Yes** | **MISSING from catalog.** Required when `is_employee=true` |

---

## Household (7 fields)

Household = **`customers`** table (no separate `household` table). Family address = **`locations`** rows linked to customer (`customer_id`), not a column on `customers`.

| Operator Group | Display Field | RefKey | Source Type | Source Table / Relation | Storage Path | Editable? | Picker? | Notes |
|---|---|---|---|---|---|---|---|---|
| Household | Household name | `customer.name` | Native column | `customers` | `customers.name` | Yes | **Yes** | Correct |
| Household | Primary contact | `customer.primary_contact` | Relationship projection | `customers` → `persons` | `customers.primary_contact_id` → person display name | Partial | **Fix refKey** | **Do not store as config text.** Seeded field_def in `20260608120000` is wrong pattern |
| Household | Secondary contact | `customer.secondary_contact` | Relationship projection | `customer_persons` | Non-primary household person | Partial | **Fix refKey** | Same — relationship, not config |
| Household | Address | `customer.address_line1` | Relationship projection | `customers` → `locations` | Primary household **`locations.address1`** (+ city/state/zip) | Partial | **Fix refKey** | **Do not duplicate on person.** Seeded `customer.address_line1` config is interim only |
| Household | Family notes | `customer.family_notes` | Config field | `customers` | `field_values` (entity_type=customer) | Yes | **Yes** | Childcare MVP seed |
| Household | Household status | `customer.status_key` | Native column | `customers` | **`customers.status_key`** (not config `household_status`) | Partial | **Yes** | Native SoT; hide config duplicate `household_status` |
| Household | Family number | `customer.customer_number` | Native column | `customers` | `customers.customer_number` | No | **Yes** | System-assigned record number; display OK, not editable |

---

## Location (8 fields)

Site/school address ≠ household address. Location rows use native address columns + metadata config from `20260529160000`.

| Operator Group | Display Field | RefKey | Source Type | Source Table / Relation | Storage Path | Editable? | Picker? | Notes |
|---|---|---|---|---|---|---|---|---|
| Location | Location name | `location.label` | Native column | `locations` | **`locations.label`** | Yes | **Yes** | Fixed refKey (was metadata `name`) |
| Location | Address line 1 | `location.address1` | Native column | `locations` | **`locations.address1`** | Yes | **Yes** | School/site address only |
| Location | City | `location.city` | Native column | `locations` | `locations.city` | Yes | **Yes** | |
| Location | State | `location.state` | Native column | `locations` | `locations.state` | Yes | **Yes** | |
| Location | ZIP code | `location.postal_code` | Native column | `locations` | `locations.postal_code` | Yes | **Yes** | |
| Location | Phone | `location.site_phone` | Config field | `locations` | `locations.metadata.site_phone` via field_def | Yes | **Yes** | Confirmed in `20260529160000` |
| Location | Director | `location.director_name` | Config field | `locations` | `locations.metadata.director_name` | Yes | **Yes** | |
| Location | Capacity | `location.capacity` | Config field | `locations` | `locations.metadata.capacity` | Yes | **Yes** | |
| Location | Programs offered | `location.category` | Config field | `locations` | `locations.metadata.category` (option_set) | Yes | **Yes** | Site program category — not lead program interest |
| Location | Status | `location.status_key` | Native column | `locations` | **`locations.status_key`** | Partial | **Yes** | Prefer native; hide metadata duplicate `location.status` |

---

## Address doctrine (confirmed)

| Address type | Authoritative source | Layout resolution | Catalog mistake |
|--------------|---------------------|-------------------|-----------------|
| **Household / family** | `locations` linked to **`customers`** (`customer_id`, often `is_primary`) | `customer` → household_address location | `person.address_line1` and `customer.address_line1` config duplicates |
| **Parent on lead layout** | Same household address (relationship projection) | Lead → customer → location | Should **not** use person-native/config address as SoT |
| **School / site** | `locations` where `location_type = site` | OCM `location_id` or reference field | `inquiry_child.location_id` is correct FK; display = site label |
| **Room / classroom** | `locations` where `location_type = unit` | OCM `program_room_cohort_key` | Do not conflate with site address |

Reference: `docs/platform_convergence/relationship_reference_runtime_notes.md` §4 (LocationReferenceRole: `household_address` vs `site`).

---

## Fields to hide or remove from picker (pending correction)

| RefKey | Reason | Action |
|--------|--------|--------|
| `person.address_line1` | Duplicates household address; wrong SoT | **Remove from picker**; replace with `customer` household address projection (FC-3) |
| `person.secondary_phone` | Not a persons column | **Remove**; use `person.phone` on secondary contact via relationship |
| `person.relationship_to_child` | Invented config key | **Remove** until bound to `customer_persons.role_type` |
| `customer.primary_contact` | Config text duplicate | **Remove**; use relationship projection |
| `customer.secondary_contact` | Config text duplicate | **Remove** |
| `customer.address_line1` | Config duplicate of locations | **Remove** config; resolve via `locations` |
| `location.name` | Wrong path (metadata vs `label`) | **Hide** until refKey → `location.label` |
| `location.address_line1` | Wrong path | **Hide** until refKey maps to native address columns |
| `opportunity.program_type` / `schedule_type` / `desired_start_date` | Grain overlap with OCM | **Defer** or keep with explicit “lead-level” subtitle |
| `person.gender` | Legacy person-entity child profile seed | **Remove from childcare picker**; use `child.gender` on customer_member |
| `person.allergies` | Legacy person-entity child medical seed | **Remove**; use `child.allergies` on customer_member |
| `person.medical_notes` | Legacy person-entity child medical seed | **Remove**; use `child.medical_notes` on customer_member |
| `person.preferred_name` | Native on persons but wrong grain for child profile | **Remove from Child group**; use `child.preferred_name` on customer_member |
| `person.special_instructions` | Wrong entity / overlaps pickup notes | **Remove**; use `child.special_instructions` on customer_member |

---

## Fields to add to catalog (confirmed source, not yet in manifest)

| Display Field | RefKey | Source | Picker? |
|---------------|--------|--------|---------|
| Employee | `person.is_employee` | `persons.is_employee` native | **Yes** |
| Employee ID | `person.employee_id` | `persons.employee_id` native | **Yes** |

Optional FC-3 relationship fields (do not seed as person config):

| Display Field | Suggested refKey | Source |
|---------------|------------------|--------|
| Household address (on Parent layout) | `customer.household_address` or relationship section | `customers` → `locations` |
| Primary contact (on Household layout) | `person.primary_contact_name` (projection only) | `customers.primary_contact_id` → `persons` |

---

## Migration review — `20260608120000_childcare_layout_field_catalog_seed.sql`

**Do not revert automatically.** Idempotent seeds are low-risk, but several rows **encode wrong storage assumptions**:

| Seeded field | Issue | Follow-up |
|--------------|-------|-----------|
| `person.address_line1` | Person entity config for family address | **Stop writing new values**; deprecate in favor of household location link; do not remove rows until data audit |
| `person.relationship_to_child` | Not canonical; overlaps `customer_persons.role_type` | **Do not use in forms**; follow-up migration to archive field_def or remap |
| `customer.primary_contact`, `secondary_contact`, `address_line1` | Text config instead of relationship/native | **Picker should not expose** until FC-3 bindings exist |
| `customer.household_status` | Overlaps native `customers.status` | Consolidate to one SoT |
| `location.name`, `location.address_line1` | Metadata storage vs native `label`/`address1` | **Follow-up migration** to align field_def config with native columns or remove |
| `person.sms_opt_in`, `email_opt_in` | Coexist with `communication_opt_out` | Document opt-in vs opt-out semantics before production |

**No migration apply** until product sign-off on § Final source corrections below.

---

## Final source corrections before commit

**Date:** 2026-06-08 (final pass)  
**Status:** Catalog + migration **draft** updated in working tree — **not committed, not applied**

### Doctrine applied

| Entity | Role | Layout picker group |
|--------|------|---------------------|
| `persons` | Adult/contact identity only | Parent / Contact |
| `customer_members` | Durable child profile (name, DOB, medical config) | Child |
| `opportunity_customer_members` | Per-child enrollment on a lead | Child — Enrollment details |
| `customers` | Household / family | Household |
| `locations` | School/site (and separately, household address via FK — FC-3) | Location |
| `opportunities` | Lead / case coordination | Lead |

**Child ≠ person.** Optional `customer_members.person_id` bridge exists for legacy/sync but is **not** the layout catalog storage path for child profile or medical fields.

---

### 1. Fields moved from `person.*` to `child.*` / `customer_member`

| Display label | Old refKey (wrong) | New refKey (correct) | Storage path |
|---------------|-------------------|----------------------|--------------|
| Preferred name | `child.preferred_name` → person bridge | `child.preferred_name` | `field_values` entity_type=`customer_member` |
| Gender | `person.gender` | `child.gender` | `field_values` entity_type=`customer_member` |
| Allergies | `person.allergies` | `child.allergies` | `field_values` entity_type=`customer_member` |
| Medical notes | `person.medical_notes` | `child.medical_notes` | `field_values` entity_type=`customer_member` |
| Special instructions | `person.special_instructions` | `child.special_instructions` | `field_values` entity_type=`customer_member` |

**Already correct (native `customer_members`):** `child.first_name`, `child.last_name`, `child.date_of_birth` → columns `first_name`, `last_name`, `dob`.

**Already correct (OCM):** all `inquiry_child.*` enrollment fields.

**Computed:** `child.age` from `customer_members.dob`.

---

### 2. Fields removed from picker

| RefKey | Reason |
|--------|--------|
| `person.gender`, `person.allergies`, `person.medical_notes`, `person.preferred_name`, `person.special_instructions` | Legacy person-entity child profile — superseded by `child.*` |
| `person.address_line1`, `person.secondary_phone`, `person.relationship_to_child` | Wrong grain / relationship projection |
| `customer.primary_contact`, `customer.secondary_contact`, `customer.address_line1`, `customer.household_status` | Config duplicates; use relationship or native `status_key` |
| `location.name`, `location.address_line1`, `location.status`, `location.operating_hours` | Misaligned metadata keys |
| `opportunity.program_type`, `opportunity.schedule_type`, `opportunity.desired_start_date`, `opportunity.campaign`, `opportunity.channel` | Per-child enrollment belongs on OCM only |

---

### 3. Fields deferred to FC-3 relationship projections

| Suggested refKey | Source | Notes |
|------------------|--------|-------|
| `customer.household_address` | `customers` → primary household `locations` (`location_type=address`) | **Not** person address; **not** site address |
| `customer.primary_contact_name` | `customers.primary_contact_id` → `persons` | Display projection |
| `person.secondary_contact_phone` | Secondary household person → `persons.phone` | Not a native person column on primary contact |

---

### 4. Fields requiring a future Supabase migration (FC-CM-1)

Before child config fields can persist correctly:

1. Add **`customer_member`** to `FIELD_DEFINITION_ENTITY_TYPES` allowlist (`inquiryChildFieldRegistry.ts` / admin field API).
2. Seed `field_definitions` for entity_type **`customer_member`**:
   - `preferred_name` (text)
   - `gender` (select; option_set `child_gender` or reuse `person_gender` with new entity binding)
   - `allergies` (text)
   - `medical_notes` (text)
   - `special_instructions` (text)
3. Ensure PATCH/`field_values` write path accepts `entity_type=customer_member`, `entity_id=customer_members.id`.
4. **Do not** migrate existing person-entity `field_values` automatically — data audit required for orgs that stored child medical data on linked `person_id`.

Catalog constant: `CHILDCARE_REQUIRES_CUSTOMER_MEMBER_FIELD_DEF_REF_KEYS` in `childcareLayoutFieldCatalog.ts`.

---

### 5. Fields safe to seed now (layout catalog migration draft)

| entity_type | field_key | Notes |
|-------------|-----------|-------|
| `opportunity` | `tour_date`, `tour_time`, `tour_status` | Case-level tour scheduling |
| `person` | `communication_preference`, `sms_opt_in`, `email_opt_in`, `employer`, `contact_notes` | Person/contact-level only |
| `customer` | `family_notes` | Household config |

**Native columns — no field_def seed required for picker:** `person.is_employee`, `person.employee_id`, `customer.name`, `customer.status_key`, `customer.customer_number`, all `location.label` / address columns, `location.status_key`, OCM native columns (already in `20260607120000` parity migration).

**Already seeded elsewhere — do not duplicate in layout catalog migration:** `location.site_phone`, `director_name`, `capacity`, `category` (`20260529160000`); person `allergies`/`medical_notes` on person entity from childcare MVP (`20260430211000`) — **leave for person drawer legacy; do not re-seed for layout child group**.

---

### 6. Fields not safe to seed yet

| Field | Why |
|-------|-----|
| `child.gender`, `child.allergies`, `child.medical_notes`, `child.preferred_name`, `child.special_instructions` | Need FC-CM-1 `customer_member` field_definitions + write path |
| `customer.household_address` | FC-3 relationship resolver |
| `customer.primary_contact` / `secondary_contact` | FC-3 relationship resolver |
| `person.address_line1` | FC-3 household address projection |
| `opportunity.program_type` / `schedule_type` / `desired_start_date` | Wrong grain — OCM only unless product adds explicit case-level SoT |

---

### Parent / Contact — confirmed person-owned

| Field | Storage | Picker |
|-------|---------|--------|
| `person.first_name`, `last_name`, `email`, `phone` | Native `persons` | Yes |
| `person.is_employee`, `employee_id` | Native `persons` | Yes |
| `person.communication_preference`, `sms_opt_in`, `email_opt_in` | `field_values` on person | Yes — contact consent |
| `person.employer`, `contact_notes` | `field_values` on person | Yes — adult contact context |

---

### Lead vs child enrollment — no duplication

| Field | Lead (`opportunity.*`) | Child enrollment (`inquiry_child.*`) |
|-------|------------------------|--------------------------------------|
| Program interest | **Removed** | `desired_program_type` |
| Schedule interest | **Removed** | `desired_schedule_type` |
| Desired start date | **Removed** | `desired_start_date` |

Case-level tour fields remain on Lead only.

---

### Sign-off checklist (updated)

- [x] Child medical/profile fields no longer use `person.*` refKeys in catalog
- [x] Durable child name/DOB on `customer_members` native columns
- [x] Lead enrollment duplicates removed from Lead group
- [x] Household status uses native `customer.status_key`
- [x] Location uses native address columns + confirmed metadata config
- [ ] FC-CM-1 migration authored and applied (customer_member field_definitions)
- [ ] FC-3 household address / contact projections
- [ ] Data audit for legacy person-entity child medical values

---

*Final correction pass — catalog and migration draft updated; awaiting commit approval.*
