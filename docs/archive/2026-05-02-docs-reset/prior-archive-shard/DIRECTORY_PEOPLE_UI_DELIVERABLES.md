> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Directory / People UI — Implementation Deliverables

Navigation and UI alignment so **People** is the primary human concept; Contacts and Customer Members are legacy compatibility views.

---

## 1. Files changed

### Navigation
- **web/components/admin/AdminLayout.tsx**
  - Top-level category renamed **People** → **Directory**.
  - Directory items: **People** (/admin/people), **Customers**, **Vendors**, and nested **Legacy** (Contacts, Members).
  - Icons and collapse state: Directory, Directory::Legacy; pathname effect expands Legacy when on /admin/contacts or /admin/customer-members.

### People list
- **web/app/api/admin/persons/route.ts** — New GET: list persons for org with _person_name, _customer_count, _compatibility_contacts_count, _compatibility_members_count, _updated.
- **web/app/admin/people/page.tsx** — Page wrapper.
- **web/app/admin/people/PeopleClient.tsx** — Table from persons API; row click opens Person drawer.
- **web/lib/entityPresentation.ts** — Persons table: added _customer_count column.

### Customer drawer / related
- **web/app/api/admin/related/[entity]/[id]/route.ts**
  - **customer** branch: added `people` array from customer_persons with person name, role, role_label (from customer_person_role_types).
  - **person** branch: customer_persons and person_relationships now include _role_label and _relationship_type_label from settings tables.
- **web/components/admin/AdminEntityDrawer.tsx**
  - Customer related tab: **People** section first (linked persons, open Person drawer); **Contacts (legacy)** and **Members (legacy)** sections after, with add actions unchanged.

### Person drawer as primary
- **web/app/api/admin/entity/[type]/[id]/route.ts**
  - **persons** branch: _customer_persons get _role_label from customer_person_role_types; _person_relationships get _relationship_type_label from person_relationship_type_settings.
- **web/components/admin/AdminEntityDrawer.tsx**
  - Person related tab: Customers list shows _role_label when present; Relationships show _relationship_type_label (fallback to relationship_type key).
  - Compatibility sections retitled **Contact records (legacy)** and **Member records (legacy)** with short “prefer People” copy.

### Legacy demotion
- **web/app/admin/contacts/ContactsClient.tsx** — Legacy banner above table: “Legacy view. For the canonical human record, use People” with link to /admin/people.
- **web/app/admin/customer-members/CustomerMembersClient.tsx** — Same legacy banner with link to /admin/people.

### Docs
- **docs/DIRECTORY_PEOPLE_UI_DELIVERABLES.md** — This file.

---

## 2. What UI now uses Person/People as primary

- **Directory → People** — Main human list; source is `persons`; opening a row opens the **Person** drawer.
- **Customer drawer → Related** — **People** section is first (customer_persons with role labels); Contacts and Members are under Legacy.
- **Person drawer** — Primary human record: Overview (basic info) and Related (Customers with role, Relationships with type label; compatibility contacts/members as legacy sections).
- **Role and relationship labels** — Where customer_persons or person_relationships are shown, labels come from **customer_person_role_types** and **person_relationship_type_settings** when present, with key fallback.

---

## 3. Legacy routes/pages that remain

- **/admin/contacts** — Contacts list and Contact drawer. Kept for compatibility (jobs, schedules, workflows, messaging, document ownership still reference contacts). Banner points to People.
- **/admin/customer-members** — Members list and Member drawer. Kept for compatibility. Banner points to People.
- Contact and Member drawers still show **Canonical Person / View person** when `person_id` is set, so users can jump to the Person record.

---

## 4. Blockers / schema mismatches

- **None.** All changes use existing schema: `persons`, `customer_persons`, `person_relationships`, `customer_person_role_types`, `person_relationship_type_settings`, `contacts`, `customer_members`. No DB migrations in this pass.
- **persons.org_id** — Used for scoping; list and entity APIs assume it exists (already used in entity route).

---

## 5. Manual test checklist

- [ ] **Navigation**
  - [ ] Sidebar shows **Directory** with **People**, **Customers**, **Vendors**, and **Legacy** (Contacts, Members). People is first under Directory.
  - [ ] Go to /admin/people → Directory expands. Go to /admin/contacts → Directory and Legacy expand.
- [ ] **People list**
  - [ ] Open **Directory → People**. Table loads (persons: name, email, phone, customers count, updated).
  - [ ] Click a row → Person drawer opens with that person.
- [ ] **Customer drawer**
  - [ ] Open a customer. Related tab shows **People** first (linked persons from customer_persons; role label when configured). Click a person → Person drawer.
  - [ ] Contacts (legacy) and Members (legacy) sections appear below; behavior unchanged.
- [ ] **Person drawer**
  - [ ] Open a person. Overview shows basic info. Related tab shows Customers (with role when set), Relationships (with type label when set), then Contact records (legacy) and Member records (legacy) if any.
- [ ] **Role / relationship labels**
  - [ ] With at least one customer_person_role_types and one person_relationship_type_settings row: Person and Customer related UIs show labels instead of raw keys where applicable.
- [ ] **Legacy pages**
  - [ ] Open **Directory → Legacy → Contacts**. Amber legacy banner with link to People. Open a contact with person_id → drawer shows “Canonical Person / View person”; click opens Person.
  - [ ] Same for **Members** list and member drawer with person_id.
- [ ] **No regressions**
  - [ ] Jobs, opportunities, schedules: primary contact and contact selectors still work.
  - [ ] Booking/checkout and workflow execution unchanged.
  - [ ] Document ownership by contact and messaging/outbox unchanged.
