> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Industry-Driven Person Type Settings — Deliverables

## 1. Files changed

| File | Change |
|------|--------|
| **supabase/migrations/20250303120000_person_type_settings_industry_id.sql** | **New.** Adds `industry_id` (uuid NULL, FK to industries) to `customer_person_role_types` and `person_relationship_type_settings`; replaces unique (org_id, key) with partial uniques: (org_id, key) WHERE industry_id IS NULL and (org_id, industry_id, key) WHERE industry_id IS NOT NULL. |
| **web/lib/admin/personTypeSettings.ts** | Added `IndustryOptionRow` and `resolveOptionsByIndustry()` (filter by industry or null, de-dupe by key preferring industry-specific, sort). Documented industry as primary, vertical as secondary. Kept `resolveOptionsByVertical`. |
| **web/app/api/admin/customer-person-role-types/route.ts** | GET: added `industry_id` to type and select. Fetches org `industry_id` when active_only or industry_id param; filters by industry or null when industry present; runs `resolveOptionsByIndustry` (industry primary) or `resolveOptionsByVertical` (when vertical_id param). Optional `?industry_id=` override. |
| **web/app/api/admin/person-relationship-type-settings/route.ts** | Same: industry_id in type/select, org industry lookup, industry-first resolution, vertical when param. |
| **web/app/admin/system/customer-person-roles/CustomerPersonRolesClient.tsx** | Title "Person Roles"; subtitle says defaults driven by org industry. Added industries fetch and **Industry** column (before Vertical); empty state mentions industry. |
| **web/app/admin/system/person-relationship-types/PersonRelationshipTypesClient.tsx** | Title "Relationship Types"; subtitle industry-driven. Added industries fetch, **Industry** column, same empty state. |
| **web/app/admin/system/entity-labels/EntityLabelsClient.tsx** | Subtitle updated: "Industry drives default labels for People, Customers, Vendors, Person Roles, Relationship Types, and other entities. Override per type below." (loading/error/main). |
| **web/app/admin/system/verticals-industries/VerticalsIndustriesClient.tsx** | Subtitle: "Industries drive default vocabulary (Entity Labels, Person Roles, Relationship Types). Verticals are optional for business domains." |

---

## 2. Where industry-driven loading applies

- **GET /api/admin/customer-person-role-types**  
  When **active_only=true** (or when **industry_id** or org has industry): loads org `industry_id`, fetches active rows where `industry_id = org.industry_id OR industry_id IS NULL`, then **resolveOptionsByIndustry** (de-dupe by key, industry-specific wins), sort by sort_order then label. Optional **?industry_id=** overrides org industry; **?vertical_id=** still applies for secondary/legacy resolution when no industry.
- **GET /api/admin/person-relationship-type-settings**  
  Same: industry-driven when active_only or industry context; optional industry_id/vertical_id params.
- **Settings pages (Person Roles, Relationship Types)**  
  List view calls GET **without** active_only so admins see all rows; table shows **Industry** (Universal or industry label) and **Vertical** (— or vertical name). Copy states that options in forms follow org industry (Entity Labels).
- **Entity Labels page**  
  Copy states industry drives default vocabulary for Directory (People, Customers, Vendors), Person Roles, Relationship Types, and other entity types.
- **Verticals / Industries page**  
  Copy states industries drive default vocabulary; verticals optional.

---

## 3. What remains deferred

- **Seeded industry defaults:** No seed data added for generic/cleaning/childcare/insurance in `customer_person_role_types` or `person_relationship_type_settings`. Tables remain org-scoped; admins create rows. To get industry default *families* (e.g. predefined rows per industry), a separate seed migration or admin flow can add rows with `industry_id` set.
- **POST create with industry_id:** Create (POST) for role/relationship types does not yet accept `industry_id` in the body; new rows get `industry_id` null (universal). Can be added in a follow-up so admins can create industry-specific rows from the UI.
- **Workflows:** Unchanged; no workflow redesign.

---

## 4. Manual test checklist

- [ ] **Migration**  
  Run `supabase/migrations/20250303120000_person_type_settings_industry_id.sql`. Confirm `industry_id` exists on both tables and unique indexes are in place.

- [ ] **Org has industry**  
  In Entity Labels, set org industry (e.g. Childcare). Confirm selection persists.

- [ ] **Person Roles – list and Industry column**  
  Open System → Directory Settings → Person Roles. Confirm list loads; **Industry** column shows "Universal" or industry name; **Vertical** shows — or vertical name. Subtitle mentions industry-driven defaults.

- [ ] **Relationship Types – list and Industry column**  
  Same for Relationship Types: Industry column, subtitle, no regression.

- [ ] **Industry-resolved options**  
  Call `GET /api/admin/customer-person-role-types?active_only=true` with org that has industry_id set. Confirm response is de-duped by key (industry-specific over universal), sorted. Same for `GET /api/admin/person-relationship-type-settings?active_only=true`.

- [ ] **Optional ?industry_id=**  
  Call with `?active_only=true&industry_id=<valid-industry-uuid>`. Confirm resolved list matches that industry (and universal fallback).

- [ ] **Vertical param still works**  
  Call with `?vertical_id=<valid-vertical-uuid>`. Confirm vertical-based resolution still works (secondary).

- [ ] **Entity Labels copy**  
  Open Entity Labels; confirm subtitle mentions People, Customers, Vendors, Person Roles, Relationship Types and industry-driven defaults.

- [ ] **Verticals / Industries copy**  
  Open Verticals / Industries; confirm subtitle says industries drive vocabulary and verticals are optional.

---

## 5. DB/schema blocker (migration required)

- **Run migration before using industry-driven options:**  
  **`supabase/migrations/20250303120000_person_type_settings_industry_id.sql`** must be applied. It:
  - Adds **industry_id** (uuid NULL, REFERENCES industries(id)) to **customer_person_role_types** and **person_relationship_type_settings**.
  - Drops existing unique index on (org_id, key) and creates:
    - Unique on (org_id, key) **WHERE industry_id IS NULL** (one universal row per org+key).
    - Unique on (org_id, industry_id, key) **WHERE industry_id IS NOT NULL** (one row per org+industry+key).

- **Prerequisite:** The **industries** table must exist (with id, key, label, is_active). The migration does not create it.

- **Optional:** If **vertical_id** is not present on these tables, the API select includes `vertical_id` and may 500 until that column exists or is removed from the select. The migration in this pass adds only **industry_id**; vertical_id was assumed from a previous change.
