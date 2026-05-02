> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Coherence Pass Before Workflow Migration — Deliverables

## 1. Files changed

| File | Change |
|------|--------|
| `web/app/admin/system/entity-labels/EntityLabelsClient.tsx` | Filter out legacy entity types from display; update empty-state copy |
| `web/components/admin/AdminLayout.tsx` | Remove Legacy (Contacts / Members) from Directory nav; remove `Directory::Legacy` expand state |
| `web/app/api/admin/customer-person-role-types/route.ts` | Default GET = effective for org industry; `?all=true` returns all configured rows |
| `web/app/api/admin/person-relationship-type-settings/route.ts` | Same as Person Roles API |
| `web/app/admin/system/customer-person-roles/CustomerPersonRolesClient.tsx` | Default effective view; add “Show all configured rows” toggle |
| `web/app/admin/system/person-relationship-types/PersonRelationshipTypesClient.tsx` | Same as Person Roles client |

---

## 2. Entity Labels: what is hidden/removed

- **Hidden from the primary table:** Rows where `entity_type` is `contacts` or `customer_members` are excluded from the displayed “effective” list.
- **Still in API:** The GET response `effective` array is unchanged; filtering is display-only in the client.
- **Primary model in UI:** The table and empty state now emphasize **persons**, **customers**, **vendors**, and other active entity types. Industry-driven labels and overrides are unchanged.

---

## 3. Nav change

- **Removed:** The “Legacy” item under Directory (with subItems: Contacts, Members) is no longer in the sidebar.
- **Directory now shows:** People, Customers, Vendors only.
- **Routes kept:** `/admin/contacts` and `/admin/customer-members` are still defined and reachable by direct URL; they are simply not linked from the primary navigation.

---

## 4. Person Roles and Relationship Types: how they resolve by selected industry

**Default (no `?all=`):**

- API uses the **current org’s `industry_id`** (from `orgs`).
- Rows returned: **industry-specific** (`industry_id = org.industry_id`) **or universal** (`industry_id IS NULL`), and **active** (`is_active = true`).
- Results are passed through **`resolveOptionsByIndustry`** so that for each key, industry-specific rows win over universal; output is de-duped by key.
- So: Childcare org sees Childcare + universal roles/relationship types only; Cleaning rows are not included.

**When org has no industry:**

- Same filter applies with no industry: only universal + active, or all active rows (no industry filter), and no resolution step.

**With `?all=true`:**

- No industry or active filter; all configured rows for the org are returned. No resolution. Used when “Show all configured rows” is checked.

---

## 5. Show-all toggle

- **Person Roles:** Checkbox “Show all configured rows” above the table. Unchecked (default) = effective for current industry; checked = fetch with `?all=true`.
- **Relationship Types:** Same checkbox and behavior.
- Default is always the effective, industry-aware view.

---

## 6. Manual test checklist

- [ ] **Entity Labels**
  - [ ] Open Admin → System → Entity Labels. Table shows only non-legacy types (e.g. persons, customers, vendors). No rows for “contacts” or “customer_members”.
  - [ ] Empty state (if applicable) does not mention “customer_members”; copy refers to People, Customers, Vendors, etc.
  - [ ] Change org industry (if possible); labels update as before.

- [ ] **Sidebar**
  - [ ] Directory has only: People, Customers, Vendors. No “Legacy” section.
  - [ ] Navigate directly to `/admin/contacts` and `/admin/customer-members`. Both pages load (routes still work).

- [ ] **Person Roles (effective by industry)**
  - [ ] Set org industry to Childcare (Entity Labels / org settings). Open Person Roles. List shows only Childcare + universal roles; no Cleaning (or other industry) rows.
  - [ ] Check “Show all configured rows”. List expands to all role types in the org; Cleaning (or other) rows appear if they exist.
  - [ ] Uncheck “Show all configured rows”. List returns to effective-only for Childcare.

- [ ] **Relationship Types (effective by industry)**
  - [ ] Same as Person Roles: default view matches org industry (Childcare + universal only); “Show all configured rows” shows every configured relationship type.

- [ ] **No regressions**
  - [ ] Checkout, payments, jobs, schedules, opportunities unchanged.
  - [ ] Legacy URLs still load; no new schema or workflow changes.
