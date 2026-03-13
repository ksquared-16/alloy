# Admin UI Person-First Cleanup — Deliverables

Final UX/data-presentation pass so the admin UI reflects the person/customer model and no longer feels half-migrated. No backend schema or workflow changes.

---

## 1. Files changed

| File | Changes |
|------|--------|
| `web/lib/entityPresentation.ts` | Person-first labels and fields for customers, opportunities, jobs, vendors, contacts; Contact demoted to "Contact (compatibility)" or "Contact (compat)"; contacts table/drawer "Primary Contact" → "Primary for (customer/vendor)" / "Primary for". |
| `web/components/admin/AdminEntityDrawer.tsx` | Customer/opportunity/job/vendor/schedule drawers: Person shown first, Contact (compatibility) second; opportunity Related tab: Person section first, then Customer, Contact (compatibility), Jobs; contacts drawer: Person first, "Primary for (customer/vendor)" second; customer inline overview: Person then Contact (compatibility); vendors: Person then Contact (compatibility); schedule related: Person link when present; `personDisplayName` import and use for customer contact block. |
| `web/components/admin/RelatedRecordsTabs.tsx` | Added `rowIdKey` for tabs; "People" tab first for customer (dataKey `people`, entityType `persons`, rowIdKey `person_id`); EMPTY includes `people`. |
| `web/app/api/admin/customers/route.ts` | List response: `_primary_person_name`, `_primary_person_id` from contact’s person when available; person fetch when contacts have `person_id`. |
| `web/app/api/admin/jobs/[id]/route.ts` | GET: `_primary_person_name` from `persons` when `primary_person_id` set; `_primary_contact_name` still from contact when `primary_contact_id` set. |
| `web/app/admin/jobs/[id]/page.tsx` | Server: same person/contact resolution as job API; `initialJob` includes `_primary_person_name`, `_primary_contact_name`. |
| `web/app/admin/jobs/[id]/JobDetailClient.tsx` | Related section: single "Person" line using `_primary_person_name ?? _primary_contact_name`. |
| `web/app/admin/opportunities/page.tsx` | Select `primary_person_id`; fetch persons; rows get `_primary_person_name` (person or contact fallback). |
| `web/app/admin/opportunities/OpportunitiesClient.tsx` | Opportunity type: `_primary_person_name` added. |
| `web/lib/adminFormatters.ts` | New `personDisplayName(full_name?, first_name?, last_name?)` → full_name or first+last trimmed or "—". |

---

## 2. Drawers / pages cleaned up

- **Opportunities drawer**  
  Overview (Customer & Booking): Person first (link to persons), then Contact (compatibility). Related tab: Person section first, then Customer, Contact (compatibility), Jobs.

- **Jobs drawer**  
  Customer & Location: Person first (link to persons), then Contact (compatibility). Schedule related: Person link when job has `_primary_person_id`. Job detail page (JobDetailClient) Related: single "Person" line (person or contact fallback).

- **Schedules drawer**  
  Related: Person link when schedule data has `_primary_person_id` (from job).

- **Customers drawer**  
  Header/details: Person first (link to persons), then "Contact (compatibility)". Overview sections (entityPresentation): Account Info has Person then Contact (compatibility); "Contact Snapshot" retitled "Contact (compatibility)". List/table: Person column added; Contact (compat) kept.

- **Vendors drawer**  
  Table: Person column; Contact (compat). Overview: Person then Contact (compatibility). Inline overview: Person then Contact (compatibility).

- **Contacts drawer**  
  Person ("Canonical Person") shown first; "Primary Contact for" → "Primary for (customer/vendor)". entityPresentation: "Primary Contact" → "Primary for (customer/vendor)" in table; "Primary Contact" → "Primary for" in Association section.

- **Customer list/page**  
  Table shows Person column (and Contact (compat)); list API returns `_primary_person_name` / `_primary_person_id`.

- **Opportunities list/page**  
  Rows include `_primary_person_name` (person or contact fallback) for drawer/display.

- **RelatedRecordsTabs (customer)**  
  "People" tab added first; opens person drawer via `person_id`.

---

## 3. Legacy / compatibility items demoted

- **"Primary Contact"**  
  No longer the main concept. Replaced by **Person** as primary human; contact used only as fallback or compatibility.

- **Labels**  
  - "Primary Contact" → **"Person"** (primary) and **"Contact (compatibility)"** or **"Contact (compat)"** (secondary) where both exist.  
  - Contacts: "Primary Contact" (table) → **"Primary for (customer/vendor)"**; "Primary Contact" (drawer Association) → **"Primary for"**.  
  - Customer "Contact Snapshot" → **"Contact (compatibility)"**; sub-labels "Primary Contact Email/Phone" → "Contact email/phone".

- **Order**  
  Person (or "People" tab/section) first; Customer; Contact (compatibility) last or collapsed.

- **Vendors**  
  Same pattern: Person first, Contact (compatibility) second in table and drawer.

---

## 4. Places still deferred

- **Discount redemptions**  
  Drawer still shows Contact and other links as-is; no change to entity model or labels in this pass.

- **Workflows / automation UI**  
  No change; may still reference `primary_contact_id` in payload/path labels (e.g. "customer.primary_contact_id") for compatibility.

- **Job create/edit form**  
  Still uses "Primary Contact" dropdown (contact-based); no person picker in this pass.

- **Bulk or list actions**  
  No change to filters or bulk actions that might reference "contact".

- **Full replacement of every `[first_name, last_name].filter(Boolean).join(" ")`**  
  Only `personDisplayName` added and used in the customer contact details block; other spots left as-is to limit scope.

---

## 5. Manual QA checklist

Use this to verify the person-first cleanup.

### Opportunities

- [ ] **List**  
  Rows load; no errors. (Person column only if added to table config; otherwise drawer only.)

- [ ] **Drawer – Overview**  
  Open an opportunity with `primary_person_id` set. In "Customer & Booking", **Person** appears first with correct name and link to Persons drawer; **Contact (compatibility)** appears second when `primary_contact_id` set.

- [ ] **Drawer – Related**  
  "Person" section first (when person exists), then Customer, "Contact (compatibility)", then Jobs. Person row opens Persons drawer.

- [ ] **Drawer – no person**  
  Opportunity with only `primary_contact_id`: Contact (compatibility) still shown; no broken Person link.

### Jobs

- [ ] **Job detail page**  
  "Related" shows **Person** line (value = `_primary_person_name` or `_primary_contact_name` fallback). No blank when contact has name.

- [ ] **Job drawer – Overview**  
  "Customer & Location": **Person** first (link to persons), **Contact (compatibility)** second when present.

- [ ] **Job with person only**  
  Person shows; contact line absent or compatibility-only when contact exists.

### Schedules

- [ ] **Drawer – Related**  
  When job has `primary_person_id`, **Person** link appears (e.g. after Customer). Click opens Persons drawer.

### Customers

- [ ] **List**  
  Table shows **Person** column (and optionally Contact (compat)); values match linked person/contact.

- [ ] **Drawer – details / header**  
  **Person** first (link to persons), **Contact (compatibility)** second. No "Primary Contact" as main label.

- [ ] **Drawer – Overview**  
  Account Info: **Person** then **Contact (compatibility)**. "Contact (compatibility)" section (formerly Contact Snapshot): contact-only fields; labels use "Contact" not "Primary Contact".

- [ ] **Drawer – Related**  
  **People** section first (unchanged from prior behavior); then Opportunities, Jobs, etc. Customer **page** RelatedRecordsTabs: **People** tab is first; tab opens Persons drawer by `person_id`.

### Vendors

- [ ] **List**  
  **Person** column (and Contact (compat)) when API returns them.

- [ ] **Drawer**  
  Overview: **Person** first, **Contact (compatibility)** second. Inline overview: same order.

### Contacts

- [ ] **Drawer**  
  **Person** ("Person: …") appears before "Primary for (customer/vendor)". Table: "Primary for (customer/vendor)" not "Primary Contact". Association: "Primary for" not "Primary Contact".

### Persons

- [ ] **Drawer**  
  No regression; overview and related (Customers, Relationships) unchanged.

### General

- [ ] **Name fallback**  
  Where person/contact has no `full_name` but has first/last, name shows as first + last (or "—"); no blank names in updated blocks.

- [ ] **No schema/workflow changes**  
  No DB migrations; no change to booking or ensure-customer flow.

- [ ] **Compatibility**  
  Entities with only `primary_contact_id` still show a name (contact) where expected; no broken links.
