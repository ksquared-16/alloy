# Identity Model Refactor — Audit Report

**Goal:** Introduce `persons` as the canonical human record; keep `customers` and `vendors` as account/provider containers; treat `contacts` and `members` as temporary compatibility layers. No redesign of jobs, schedules, opportunities, or vendor core tables in this pass.

**Scope:** Audit only. No implementation.

---

## 1. Current State (Schema Inventory)

*Note: Base table `CREATE TABLE` statements for `customers`, `contacts`, `vendors`, `opportunities`, `jobs`, `customer_members`, `documents`, etc. were not found in the repo migrations. Schema below is inferred from API route types, `select`/`insert` usage, and migration `REFERENCES`. Confirm against actual DB or Supabase schema dump.*

### 1.1 Core container tables

| Table | Purpose today | Key columns (inferred) | Canonical / legacy / compatibility | Recommended migration action |
|-------|----------------|------------------------|-------------------------------------|------------------------------|
| **customers** | Customer/account container (household, business). | id, org_id, name, status, status_key, customer_type, **primary_contact_id**, vertical_id, metadata, stripe_customer_id, external_*, default_payment_method_*, setup_intent_id, created_at, updated_at | **Canonical** | Keep unchanged. Eventually `primary_contact_id` may point to a compatibility view or be mirrored to `person_id` for the same human. |
| **vendors** | Vendor/provider container. | id, org_id, name, company_name, email, phone, vendor_status_id, **primary_contact_id**, payout_percent, service_area_zip_codes, days_available, submitted_at, created_at, updated_at | **Canonical** | Keep unchanged. Same note as customers for `primary_contact_id`. |

### 1.2 Human-related tables (to become compatibility / replaced by persons)

| Table | Purpose today | Key columns (inferred) | Canonical / legacy / compatibility | Recommended migration action |
|-------|----------------|------------------------|-------------------------------------|------------------------------|
| **contacts** | Person record tied to a customer and/or vendor (email, phone, name). Used as job/opportunity primary contact and in vendor_contacts. | id, org_id, first_name, last_name, email, phone, company_name, notes, status, status_key, contact_type, **customer_id**, **vendor_id**, vendor_contact_role, archived_at, archived_by, timezone, address_line1, city, state, postal_code, address_source, metadata, created_at, updated_at | **Compatibility-layer candidate** | Migrate identity columns into `persons`; keep table as compatibility view or synonym keyed by contact_id → person_id. |
| **customer_members** | “Member” of a customer (e.g. household member, child). Has display name, relationship, DOB; linked to contacts via `customer_member_contacts`. | id, org_id, **customer_id**, display_name, relationship, first_name, last_name, dob, is_active, status_key, created_at, updated_at | **Compatibility-layer candidate** | Same as contacts: move human identity into `persons`; link via `customer_persons` (customer + person); keep table or view during transition. |

### 1.3 Join / link tables (customer ↔ contact/member)

| Table | Purpose today | Key columns | Canonical / legacy / compatibility | Recommended migration action |
|-------|----------------|------------|-------------------------------------|------------------------------|
| **vendor_contacts** | Many-to-many: vendors ↔ contacts. | id, vendor_id, **contact_id**, role, created_at. UNIQUE(vendor_id, contact_id). FK to contacts(id) ON DELETE CASCADE. | **Legacy** (contact-centric) | Eventually replace with vendor ↔ person link (e.g. vendor_persons or keep vendor_contacts but reference person_id once contacts are backed by persons). |
| **customer_member_contacts** | Links a customer_member to a contact (with role). | id, org_id, customer_id, **customer_member_id**, **contact_id**, role_key, is_active. | **Legacy** (contact-centric) | Replace conceptually with person_relationships or customer_persons; during migration keep and backfill from contact/member → person. |

### 1.4 Tables referencing contact_id

| Table | Column(s) | Purpose | Migration action |
|-------|------------|---------|------------------|
| **customers** | primary_contact_id | Primary contact for the customer | Add optional person_id; backfill from contact; later UI can use person. |
| **vendors** | primary_contact_id | Primary contact for the vendor | Same as customers. |
| **opportunities** | primary_contact_id | Lead/contact for the opportunity | Add optional primary_person_id; backfill from primary_contact_id. |
| **jobs** | primary_contact_id | Primary contact for the job | Same as opportunities. |
| **customer_subscriptions** | primary_contact_id | Primary contact for the subscription | Same. |
| **discount_redemptions** | contact_id | Contact who redeemed (NOT NULL) | Add person_id; backfill; eventually require person_id or keep contact_id as FK to compatibility layer. |
| **messages_outbox** | to_contact_id | Recipient contact (nullable) | Add to_person_id; backfill; keep to_contact_id for compatibility. |
| **vendor_contacts** | contact_id | Contact linked to vendor | See above (vendor_contacts). |
| **customer_member_contacts** | contact_id | Contact linked to member | See above. |
| **documents** | owner_contact_id | Document owner (contact) | Add owner_person_id; backfill; keep owner_contact_id during transition. |

*Note: `documents` also uses (entity_type, entity_id) for other entities (customer, opportunity, job, customer_member). No change needed for those in this pass.*

### 1.5 Tables referencing member_id (customer_member)

| Table | Column(s) | Purpose | Migration action |
|-------|------------|---------|------------------|
| **customer_member_contacts** | customer_member_id | Member side of member–contact link | When members become person-backed, link via customer_persons (customer + person) and optionally person_relationships. |

No other tables in the audited code reference `customer_member_id` as a direct FK; customer_members are referenced in related-data APIs and drawer UI.

### 1.6 Auth / app user tables

| Table | Purpose today | Key columns (inferred) | Canonical / legacy / compatibility | Recommended migration action |
|-------|----------------|------------------------|-------------------------------------|------------------------------|
| **user_profiles** | Admin portal: links auth user to role (admin/ops). | id (= auth.users.id), role. Referenced in `web/lib/adminAuth.ts`. | **Canonical** for admin access | No change for identity refactor. Employee/sales rep/dispatcher can later be modeled as persons; link to app user if needed in a later pass. |
| **app_users** | Not found in codebase. | — | — | If it exists in DB, treat as out of scope or align with persons later. |

### 1.7 Employee / staff tables

No dedicated employee, staff, sales_rep, dispatcher, or teacher/tech tables were found in the repo. The audit assumes these will be modeled as **persons** (and optionally linked to org/role) in a later pass.

---

## 2. Dependencies (Codebase)

### 2.1 contact_id / primary_contact_id

| File path | Description | Severity |
|-----------|-------------|----------|
| web/app/api/admin/contacts/route.ts | GET list contacts; POST create contact; primary-for-customer/vendor derived from customers/vendors.primary_contact_id | High |
| web/app/api/admin/customers/route.ts | GET list customers; joins to contacts for primary_contact_id (name, email, phone) | High |
| web/app/api/admin/customers/[id]/route.ts | PATCH customer; preserves primary_contact_id | Medium |
| web/app/api/admin/vendors/[id]/route.ts | PATCH vendor; primary_contact_id | Medium |
| web/app/api/admin/jobs/route.ts | POST job; validates primary_contact_id against contacts + customer_id | High |
| web/app/api/admin/jobs/[id]/route.ts | GET/PATCH job; loads contact for primary_contact_id | High |
| web/app/api/admin/opportunities/[id]/route.ts | PATCH opportunity; primary_contact_id | Medium |
| web/app/api/admin/subscriptions/[id]/generate-next/route.ts | Reads customer_subscriptions.primary_contact_id | Medium |
| web/app/api/admin/related/[entity]/[id]/route.ts | For entity=contact: opportunities, jobs, customer_subscriptions, customer_member_contacts, vendor_contacts, messages_outbox, documents, discount_redemptions by contact id; for entity=customer loads contacts by customer_id and primary_contact_id; for entity=vendor loads vendor_contacts then contacts | High |
| web/app/api/admin/entity/[type]/[id]/route.ts | GET entity: jobs/opportunities/customers/schedules load contact by primary_contact_id; type=contacts full row + _contact_vendor, _primary_contact_for | High |
| web/app/api/admin/discount-redemptions/route.ts | GET list; contact_id and _contact_name | Medium |
| web/app/api/admin/customer-member-contacts/route.ts | GET/POST customer_member_contacts (contact_id, customer_member_id) | High |
| web/app/api/admin/vendors/[id]/contacts/available/route.ts | Lists contacts not already linked to vendor (vendor_contacts.contact_id) | Medium |
| web/app/api/admin/contact-options/route.ts | GET contacts for customer_id (dropdown for job primary contact) | High |
| web/app/api/book-v2/confirm/route.ts | Resolves/creates contact; sets opportunity/job primary_contact_id; discount_redemption contact_id; integrity checks primary_contact_id | High |
| web/app/api/book-v2/quote-start/route.ts | ensureCustomerForContact; contact lookup by email/phone; customer_id on contact | High |
| web/app/api/leads/gutters/route.ts | Creates contact and opportunity with primary_contact_id | Medium |
| web/app/api/vendor-application/route.ts | Creates vendor with primary_contact_id: contactId | Medium |
| web/lib/bookingResolver.ts | resolve_or_create_contact_and_customer; contacts CRUD and lookup by email/phone | High |
| web/lib/workflowRun.ts | Resolves recipients (contact_id); loads contacts for vendors by primary_contact_id; writes messages_outbox to_contact_id | High |
| web/app/admin/contacts/ContactsClient.tsx | List/drawer contacts | High |
| web/app/admin/customers/CustomersClient.tsx | primary_contact_id, _primary_contact_* in list | Medium |
| web/app/admin/vendors/VendorsClient.tsx | primary_contact_id, _primary_contact_name in list | Medium |
| web/components/admin/RelatedRecordsTabs.tsx | Customer tab: contacts + customer_members; _primary_contact_id | Medium |
| web/app/admin/messages-outbox/page.tsx, MessagingClient.tsx | to_contact_id display | Low |
| docs/ai_sources/workflow_engine/web/lib/workflowRun.ts | ResolvedRecipient contact_id | Low (reference) |
| backend (Python) | stripe.py, supabase_client.py: GHL contact_id, resolve_or_create_contact_and_customer, contact tagging | High (backend) |

### 2.2 member_id / customer_member

| File path | Description | Severity |
|-----------|-------------|----------|
| web/app/api/admin/customer-members/route.ts | GET/POST customer_members (customer_id, display_name, relationship, first_name, last_name, dob, is_active) | High |
| web/app/api/admin/customer-members/[id]/route.ts | GET/PATCH customer_member | High |
| web/app/api/admin/customer-member-contacts/route.ts | GET/POST links by customer_member_id and contact_id | High |
| web/app/api/admin/related/[entity]/[id]/route.ts | entity=customer_member: customer_member_contacts (contact_id, role), documents by entity_type/entity_id | High |
| web/app/admin/customer-members/CustomerMembersClient.tsx | List/drawer customer_members | High |
| web/components/admin/RelatedRecordsTabs.tsx | Customer related: customer_members tab | Medium |
| web/components/admin/AdminEntityDrawer.tsx | Drawer type customer_members; member related data (linkedContacts, documents) | High |

### 2.3 Contact drawer / Member drawer / people module

| File path | Description | Severity |
|-----------|-------------|----------|
| web/components/admin/AdminEntityDrawer.tsx | EDITABLE_TYPES includes contacts, customer_members; drawer tabs and forms for both; contactRelatedData, memberRelatedData; documents tab for contact and customer_member | High |
| web/lib/entityPresentation.ts | ENTITY_PRESENTATION_REGISTRY for contacts and customer_members (table columns, drawer tabs) | High |
| web/contexts/AdminDrawerContext.tsx | AdminDrawerEntityType includes "contacts", "customer_members" | Medium |
| web/app/admin/contacts/ContactsClient.tsx | Contacts list page and table | High |
| web/app/admin/customer-members/CustomerMembersClient.tsx | Customer members list page and table | High |

### 2.4 Selectors / autocomplete / forms (contacts or members)

| File path | Description | Severity |
|-----------|-------------|----------|
| web/app/api/admin/contact-options/route.ts | GET contacts for customer_id (job primary contact dropdown) | High |
| web/app/admin/jobs/* (create/edit) | Primary contact selector (likely uses contact-options) | High |
| RelatedRecordsTabs + drawer | “Contacts” and “Members” tabs on customer; “Link contact” for member | High |

### 2.5 Jobs / schedules / opportunities loading linked human records

| File path | Description | Severity |
|-----------|-------------|----------|
| web/app/api/admin/entity/[type]/[id]/route.ts | jobs: loads contact by primary_contact_id for _contact_name; opportunities: same for _contact_name/_primary_contact_name; schedules: job then contact by job.primary_contact_id | High |
| web/app/api/admin/related/[entity]/[id]/route.ts | job/opportunity/schedule related data; contact ids flow from primary_contact_id | High |
| web/app/api/admin/jobs/route.ts | POST job validates primary_contact_id vs contacts; GET list enriches with customer/vendor | High |
| web/app/api/admin/schedules/route.ts | Schedules list enriched with job/customer; job has primary_contact_id | Medium |

---

## 3. RLS Audit

### 3.1 Current RLS

No RLS policies or `ENABLE ROW LEVEL SECURITY` statements were found in the repo under `supabase/migrations`. RLS may be:

- Managed in Supabase dashboard, or
- Defined in another branch/repo, or
- Not enabled (access controlled only by app-layer admin context).

**Recommendation:** Confirm in Supabase dashboard (or schema dump) whether RLS is enabled on `customers`, `contacts`, `vendors`, and what policies exist. If present, document them and mirror the pattern for new tables.

### 3.2 Recommended policy approach for new tables

Assuming org-scoped access (current pattern via `getAdminContext().orgId`):

| Table | Recommended approach |
|-------|----------------------|
| **persons** | RLS: allow read/write where `org_id = current_org()` (or equivalent). Person rows are org-scoped like contacts today. |
| **customer_persons** | RLS: allow where `org_id = current_org()`; optionally allow only if user can read the customer and the person. |
| **person_relationships** | RLS: allow where org is consistent (e.g. both persons in same org, or relationship table has org_id). |

Use the same role/function pattern as existing tables (e.g. service role for admin API, or authenticated role with org claim). Add policies when RLS is enabled so that:

- Admin/ops can only see/edit data for their org.
- New tables do not broaden visibility (e.g. no cross-org person visibility unless intended).

---

## 4. Migration Surface

### 4.1 Columns from contacts → persons

Move (canonical human identity and comms):

- id → persons.id (new UUID; contact_id retained on contact row as legacy FK)
- org_id
- first_name, last_name
- email, phone
- company_name (optional; could stay contact-scoped)
- timezone, address_line1, city, state, postal_code, address_source (optional for person)
- created_at, updated_at

Stay on contact (or compatibility layer) as link/role context:

- customer_id, vendor_id, vendor_contact_role → replaced by customer_persons / vendor–person link
- status, status_key, contact_type, notes, archived_at, archived_by, metadata → compatibility or person as needed

### 4.2 Columns from customer_members → persons

Move (human identity):

- first_name, last_name
- display_name (or derive from first/last)
- dob (person-level optional)
- Relationship to customer is link-only: customer_persons (customer_id, person_id) + optional role/relationship type.

Stay on member (or drop in favor of customer_persons):

- customer_id → customer_persons.customer_id
- relationship → could be role on customer_persons or person_relationships
- is_active, status_key → context on link or person
- created_at, updated_at

### 4.3 Overlapping vs unique

- **Overlap (contacts and customer_members):** first_name, last_name. Use a single `persons` row per human; one person can be both a “contact” (for a customer/vendor) and a “member” (for a customer) via customer_persons and vendor–person links.
- **Contacts only:** email, phone, company_name, contact_type, vendor_id/customer_id, timezone, address_*, archived_*, vendor_contact_role. Email/phone are canonical on person; the rest are link/context (customer or vendor link).
- **Members only:** display_name, relationship, dob, is_active (as member). display_name/relationship/dob can live on person or on customer_persons (e.g. relationship_type, role).

### 4.4 Tables that will need person_id bridge columns

- **contacts:** Add `person_id` (FK to persons). Backfill: one person per contact (or merge duplicates by email/phone).
- **customer_members:** Add `person_id` (FK to persons). Backfill: one person per member (or merge with existing person if same human as a contact).
- **customer_persons (new):** (customer_id, person_id, role/relationship_type, …). Replaces “contact belongs to customer” and “member belongs to customer” conceptually.
- **person_relationships (new):** (person_id_a, person_id_b, type, …). For member–contact links, optionally replace customer_member_contacts with “member person” ↔ “contact person” relationship.

Optional (for gradual rewiring):

- **opportunities:** primary_person_id (nullable); keep primary_contact_id and sync or derive.
- **jobs:** primary_person_id (nullable); keep primary_contact_id.
- **customers:** primary_person_id (nullable); keep primary_contact_id.
- **vendors:** primary_person_id (nullable); keep primary_contact_id.
- **customer_subscriptions:** primary_person_id (nullable).
- **discount_redemptions:** person_id (nullable); keep contact_id.
- **messages_outbox:** to_person_id (nullable); keep to_contact_id.
- **documents:** owner_person_id (nullable); keep owner_contact_id.

### 4.5 Current foreign keys to eventually rewire

| From table | Column | References | Eventually |
|------------|--------|------------|------------|
| customers | primary_contact_id | contacts(id) | Keep for compatibility; use person_id for new logic or dual-write. |
| vendors | primary_contact_id | contacts(id) | Same. |
| opportunities | primary_contact_id | contacts(id) | Same. |
| jobs | primary_contact_id | contacts(id) | Same. |
| customer_subscriptions | primary_contact_id | contacts(id) | Same. |
| discount_redemptions | contact_id | contacts(id) | Same; add person_id. |
| messages_outbox | to_contact_id | contacts(id) | Same. |
| vendor_contacts | contact_id | contacts(id) | Replace with vendor ↔ person (e.g. vendor_persons or contact_id → person_id mapping). |
| customer_member_contacts | contact_id, customer_member_id | contacts(id), customer_members(id) | Replace with person_relationships / customer_persons. |
| documents | owner_contact_id | contacts(id) | Add owner_person_id; keep owner_contact_id. |

---

## 5. Recommended Order (Safe Migration)

1. **Create new tables (no FKs to existing human tables yet)**  
   - `persons` (id, org_id, first_name, last_name, email, phone, … identity columns, created_at, updated_at).  
   - `customer_persons` (id, customer_id, person_id, role/relationship_type, …).  
   - `person_relationships` (id, person_id_a, person_id_b, type, …).

2. **Add bridge columns (nullable)**  
   - `contacts.person_id` (FK to persons, nullable).  
   - `customer_members.person_id` (FK to persons, nullable).  
   - Optionally add `primary_person_id` / `to_person_id` / `owner_person_id` on opportunities, jobs, customers, vendors, customer_subscriptions, discount_redemptions, messages_outbox, documents.

3. **Backfill persons from contacts**  
   - One person per contact (or merge by org + email/phone).  
   - Set `contacts.person_id`.  
   - Backfill `customer_persons` from (contact.customer_id, contact.person_id) where customer_id not null.

4. **Backfill persons from customer_members**  
   - For each member, create or match person (e.g. by customer + first/last/dob); set `customer_members.person_id`.  
   - Populate `customer_persons` for (member.customer_id, member.person_id).  
   - Optionally backfill `person_relationships` from customer_member_contacts (member.person_id ↔ contact.person_id).

5. **Preserve compatibility**  
   - Keep all existing contact_id and member_id FKs and APIs working.  
   - New code can read/write person_id where available; existing code continues to use contact_id/member_id.  
   - Optionally add DB triggers or app logic to keep primary_contact_id and primary_person_id in sync.

6. **Delay UI rewiring**  
   - Do not switch drawer or list pages to “person” until backfill is stable and verified.  
   - Then: add person-based API/views, then switch UI to persons (or to a compatibility view that still exposes contact_id/member_id for legacy calls).

7. **Later: point jobs/schedules/opportunities at persons**  
   - After data is stable, add or prefer primary_person_id in APIs and UI; eventually deprecate primary_contact_id or keep it as derived from person → contact view.

---

## 6. Risks / Unknowns

- **Schema not in repo:** Base table definitions for customers, contacts, vendors, opportunities, jobs, customer_members, documents were not found in migrations. Confirm full schema (and any RLS) in Supabase before implementing.
- **Duplicate humans:** Same person may exist as multiple contacts (e.g. different customers) or as both contact and member. Deduplication (merge by email/phone/org) is required before or during backfill; rules (e.g. prefer one person per email per org) need definition.
- **GHL / backend:** Backend (Python) and any GHL sync use contact_id and resolve_or_create_contact_and_customer. Any person model must either stay behind contact_id or expose a stable contact → person mapping so backend and sync keep working.
- **documents.owner_contact_id:** Confirmed in related API; table definition not in repo. If documents use RLS or triggers, adding owner_person_id must respect them.
- **customer_member_contacts.customer_id:** Insert in route includes customer_id (denormalized from member). customer_persons will carry this; migration must keep consistency.
- **RLS:** Unknown until Supabase is checked. New tables and policies must match current security model (org isolation).
- **Workflows:** workflowRun and messages_outbox use contact_id heavily. Backfill to_person_id and optional workflow changes should be phased to avoid breaking sends.

---

**End of audit. No implementation code; inspect DB and RLS before implementing.**
