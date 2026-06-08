> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# DB Relationships Page & System Nav Cleanup — Deliverables

## 1. Files changed

| File | Change |
|------|--------|
| `web/app/api/admin/db-relationships/route.ts` | **New.** GET handler: returns `customer_persons` and `person_relationships` for current org with enriched labels (customer name, person names, role/relationship type labels). |
| `web/app/admin/system/db-relationships/page.tsx` | Replaced Coming Soon placeholder with client component. |
| `web/app/admin/system/db-relationships/DbRelationshipsClient.tsx` | **New.** Two sections: Customer People table, Person Relationships table; clickable customer/person names open drawers. |
| `web/components/admin/AdminLayout.tsx` | System nav: added nested group **Directory Settings** with sub-items **Person Roles**, **Relationships**, **DB Relationships**. Removed long top-level labels for those three. Icon for Directory Settings = Tag. Pathname-based expand for System::Directory Settings. |

---

## 2. How DB Relationships is now exposed

- **Route:** Admin → System → Directory Settings → **DB Relationships** (same URL: `/admin/system/db-relationships`).
- **Content:**
  - **Customer People** — Table: Customer (link), Person (link), Role, Created. Data from `customer_persons` for the org; customer and person names resolved; role shown as label when available.
  - **Person Relationships** — Table: From person (link), Relationship type, To person (link), Created. Data from `person_relationships` where both persons belong to the org; type shown as label when available.
- **Interactions:** Clicking a customer name opens the Customer drawer; clicking a person name opens the Person drawer. Read-only list; no create/edit on this page (see below).

---

## 3. Actions supported vs deferred

| Action | Status |
|--------|--------|
| View all customer_persons for org | **Supported** (table with links). |
| View all person_relationships for org | **Supported** (table with links). |
| Open Customer / Person drawer from row | **Supported** (link buttons). |
| Create customer_person from this page | **Deferred.** Create is done from Customer or Person drawer (Related / People). |
| Create person_relationship from this page | **Deferred.** Create is done from Person drawer (Related). |
| Edit/delete customer_person or person_relationship from this page | **Deferred.** Manage via Customer/Person drawer. |

---

## 4. Nav labels / grouping change

- **Before:** System had flat items: Access Control, Verticals / Industries, Entity Labels, Statuses, **Customer Person Roles**, **Person Relationship Types**, Payouts, **DB Relationships** (long labels could truncate).
- **After:** Under System:
  - Same first four items (unchanged).
  - **Directory Settings** (nested group) with:
    - **Person Roles** → `/admin/system/customer-person-roles`
    - **Relationships** → `/admin/system/person-relationship-types`
    - **DB Relationships** → `/admin/system/db-relationships`
  - Payouts (unchanged).
- **Page titles:** Unchanged. “Customer Person Roles” and “Person Relationship Types” pages still show their full titles in the page header; only the sidebar labels were shortened.
- **Location:** All remain under System; nothing moved into the main Directory nav.

---

## 5. Manual test checklist

- [ ] **System nav – Directory Settings**
  - Open Admin → System. Expand System if collapsed.
  - Confirm **Directory Settings** appears with shorter sibling labels (no long “Customer Person Roles” / “Person Relationship Types” at top level).
  - Expand Directory Settings. Confirm **Person Roles**, **Relationships**, **DB Relationships** appear and are not cut off.

- [ ] **DB Relationships – load**
  - Go to System → Directory Settings → **DB Relationships**.
  - Confirm page loads without error and shows two sections: **Customer People**, **Person Relationships**.
  - If data exists: Customer People rows show customer name, person name, role, created; Person Relationships rows show from person, type, to person, created.

- [ ] **DB Relationships – open drawers**
  - On DB Relationships, click a **customer** name in Customer People. Confirm Customer drawer opens for that customer.
  - Click a **person** name in Customer People. Confirm Person drawer opens for that person.
  - Click **from** or **to** person in Person Relationships. Confirm Person drawer opens for that person.

- [ ] **Person Roles / Relationships pages**
  - Navigate to **Person Roles** and **Relationships** via Directory Settings.
  - Confirm full page titles still show (“Customer Person Roles”, “Person Relationship Types”) and that list/modal behavior is unchanged.

- [ ] **Pathname expand**
  - Navigate directly to `/admin/system/db-relationships` (or Person Roles / Relationships). Confirm System is expanded and Directory Settings is expanded so the current item is visible.
