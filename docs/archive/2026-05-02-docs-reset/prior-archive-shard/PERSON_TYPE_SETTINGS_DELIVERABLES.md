> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Person Type Settings — Implementation Deliverables

Configurable settings for **customer-person role types** and **person-to-person relationship types**, additive and compatibility-preserving. No removal of contacts/customer_members; no workflow or People UI redesign in this pass.

---

## 1. Files changed / added

### Schema
- **supabase/migrations/20250303110000_customer_person_role_types_and_relationship_type_settings.sql** — New migration: two tables, indexes, `updated_at` triggers.

### Backend API
- **web/app/api/admin/customer-person-role-types/route.ts** — GET (list), POST (create).
- **web/app/api/admin/customer-person-role-types/[id]/route.ts** — PATCH (update), DELETE (405 with message).
- **web/app/api/admin/person-relationship-type-settings/route.ts** — GET (list), POST (create).
- **web/app/api/admin/person-relationship-type-settings/[id]/route.ts** — PATCH (update), DELETE (405 with message).

### Settings UI
- **web/components/admin/AdminLayout.tsx** — Nav: added “Customer Person Roles” and “Person Relationship Types” under System (with icons).
- **web/app/admin/system/customer-person-roles/page.tsx** — Page wrapper.
- **web/app/admin/system/customer-person-roles/CustomerPersonRolesClient.tsx** — Table, add/edit modal, active/inactive, sort order, key+label, system protection.
- **web/app/admin/system/person-relationship-types/page.tsx** — Page wrapper.
- **web/app/admin/system/person-relationship-types/PersonRelationshipTypesClient.tsx** — Same pattern as role types.

### Integration prep
- **web/lib/admin/personTypeSettings.ts** — API path constants, `customerPersonRoleOptions()`, `personRelationshipTypeOptions()` for dropdowns; JSDoc for usage.

### Docs
- **docs/PERSON_TYPE_SETTINGS_DELIVERABLES.md** — This file.

---

## 2. Schema / config objects added

### Tables

**customer_person_role_types**
- `id` (uuid, PK)
- `org_id` (uuid, NOT NULL)
- `key` (text, NOT NULL) — stored in `customer_persons.role` (future use)
- `label` (text, NOT NULL)
- `description` (text, nullable)
- `sort_order` (int, default 100)
- `is_system` (boolean, default false)
- `is_active` (boolean, default true)
- `metadata` (jsonb, nullable)
- `created_at`, `updated_at`
- Unique: `(org_id, key)`

**person_relationship_type_settings**
- Same column set and semantics.
- Unique: `(org_id, key)` — key stored in `person_relationships.relationship_type` (future use).

No FKs from `customer_persons` or `person_relationships` to these tables in this pass; keys are stored as text and resolved via settings for display.

---

## 3. Intentionally deferred

- **Wiring `customer_persons.role`** to `customer_person_role_types.key` (FK or validation) — not done; current text values remain valid.
- **Wiring `person_relationships.relationship_type`** to `person_relationship_type_settings.key` — not done; same reason.
- **Hard delete** — not implemented; DELETE returns 405. Use `is_active = false` to deactivate.
- **Seeding system rows** — no seed data in migration; orgs can create their own. Optional future migration can insert system rows with `is_system = true` if desired.
- **RLS** — not added in this migration; admin APIs use service role and `org_id` scoping.
- **People UI refactor** — no change to contacts/customer_members/persons drawers or workflows; settings are ready for when that refactor happens.

---

## 4. Manual test checklist

- [ ] Run migration: `supabase db push` or apply `20250303110000_*.sql`; confirm both tables exist.
- [ ] **Customer Person Roles**
  - [ ] Open **Admin → System → Customer Person Roles**. Table loads (empty or with data).
  - [ ] **Add:** Click “Add Role Type”, enter key (e.g. `primary_contact`), label (e.g. “Primary contact”), optional description and sort order; save. Row appears.
  - [ ] **Edit:** Click “Edit” on a row; change label, description, sort order, or active; save. Table updates.
  - [ ] **Validation:** Try creating with duplicate key (same org) → 409 or error. Try invalid key (spaces, uppercase) → key normalized or error per API rules.
- [ ] **Person Relationship Types**
  - [ ] Open **Admin → System → Person Relationship Types**. Same flow: add, edit, validate key/label.
- [ ] **APIs**
  - [ ] `GET /api/admin/customer-person-role-types` → `{ items: [...] }`.
  - [ ] `GET /api/admin/customer-person-role-types?active_only=true` → only active.
  - [ ] `POST /api/admin/customer-person-role-types` with body `{ key, label }` (admin) → 201 and created row.
  - [ ] `PATCH /api/admin/customer-person-role-types/[id]` with `{ label, sort_order, is_active }` → updated row.
  - [ ] Same for `person-relationship-type-settings` list/create/update.
  - [ ] `DELETE` on either → 405 and message to use is_active.
- [ ] **Dropdown prep:** In app or console, `fetch('/api/admin/customer-person-role-types?active_only=true')` then use `customerPersonRoleOptions(json.items)` from `@/lib/admin/personTypeSettings` → array of `{ value, label }`.

---

## 5. Naming and compatibility decisions

- **Table names:** Kept as specified: `customer_person_role_types`, `person_relationship_type_settings`. Aligns with “types/settings” naming used elsewhere (e.g. status_definitions, location_types). Alternative shorter names (e.g. `customer_person_roles`) were not used to stay consistent with the requested names.
- **Key format:** Same as status_definitions: 2–64 chars, `[a-z0-9_]`, stored normalized (lowercase, invalid chars → underscore). Protects future FK or lookups.
- **Delete behavior:** No hard delete; 405 with message. Existing records may reference keys in `customer_persons.role` or `person_relationships.relationship_type`; deactivating via `is_active` is safe.
- **System types:** `is_system` is stored and exposed. API does not allow changing `key` on PATCH (only label, description, sort_order, is_active). In the UI, key is read-only when editing (for all rows) to avoid implying key can be changed. No seed of system rows in this pass; can be added later.
- **Compatibility:** Current text values in `customer_persons.role` and `person_relationships.relationship_type` remain valid; forms can continue to use free text or switch to dropdowns backed by these settings when ready.
