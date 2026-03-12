# Person Model Implementation — Deliverables

**Pass:** Compatibility-preserving people-module refactor; person-backed reads; groundwork for consolidated drawer.

---

## 1. Files changed

| File | Change |
|------|--------|
| **web/app/api/admin/entity/[type]/[id]/route.ts** | Added `persons` to ENTITY_TYPES. Contact GET: load and expose `_person`, `_person_id`, `_person_name` when `contacts.person_id` exists. Customer_member GET: same. Customers GET: load person from primary contact and expose `_primary_person_id`, `_primary_person_name`. Jobs GET: same from primary contact. Opportunities GET: same. Schedules GET: load contact with `person_id`, expose `_primary_person_id`, `_primary_person_name` on out. Vendors GET: same from primary contact. Discount_redemptions GET: from contact expose `_person_id`, `_person_name`. New **persons** GET: load persons row, `_customer_persons`, `_person_relationships`, `_compatibility_contacts`, `_compatibility_members`. |
| **web/app/api/admin/related/[entity]/[id]/route.ts** | New **person** branch: load `customer_persons` (with customer names), `person_relationships` (with other person names), `compatibility_contacts`, `compatibility_members`. |
| **web/contexts/AdminDrawerContext.tsx** | Added `"persons"` to `AdminDrawerEntityType`. |
| **web/lib/entityPresentation.ts** | Added `"persons"` to `EntityPresentationType`. Added **persons** presentation config (table columns, drawer tabs overview + related, overviewSections, relatedModules). |
| **web/components/admin/AdminEntityDrawer.tsx** | Added `personRelatedData` / `personRelatedLoading` state; fetch related when `drawer.type === "persons"` and tab is related. Added persons to "new" prefill branch. Title: persons case ("New Person" / "Person: {name}"). Overview: "New Person" message when `_create`; config-driven overview for existing persons. Related tab: persons block (Customers, Relationships, Contact records, Member records). Contact overview: "Canonical Person" link when `_person_id` exists. Customer_member overview: same. Reset `personRelatedData` when drawer type/id cleared. |
| **web/lib/peopleHelpers.ts** | **New file.** Helpers: `getPeopleDisplayName`, `getPersonId`, `getPersonName`, `hasPersonLink` for shared display/link logic. |
| **web/app/api/book-v2/confirm/route.ts** | Optional: load `person` by `contactRow.person_id` when building booking_confirmed event payload; add `person: personRow` alongside `contact` (unchanged). |

---

## 2. What was added vs left unchanged

**Added (additive only):**

- Entity GET responses: `_person`, `_person_id`, `_person_name` on contact and customer_member; `_primary_person_id`, `_primary_person_name` on customer, job, opportunity, schedule, vendor; `_person_id`, `_person_name` on discount_redemption.
- New entity type **persons**: GET and related API; drawer type and presentation config; Person drawer (overview + related tab).
- "View person" / "Canonical Person" in Contact and Customer Member drawers when `_person_id` is present.
- Shared **peopleHelpers** for display name and person link (for use in lists/drawers as needed).
- booking_confirmed payload: optional `person` key when contact has `person_id`.

**Unchanged for compatibility:**

- All existing `contact_id`, `primary_contact_id`, `customer_member_id` fields and API contracts.
- Contact and Customer Member list pages, drawer forms, and create/edit flows.
- Jobs, schedules, opportunities: no schema or flow changes; only extra response fields.
- Workflows, messaging, send_message, documents `owner_contact_id`, contact-based recipient resolution.
- No DB schema changes; no new migrations.

---

## 3. Partial / deferred

- **Person list page:** No dedicated admin "Persons" list page; Person is opened from Contact/Member drawer or from Related (e.g. "Relationships" link to another person). Can be added later.
- **Person create:** Drawer "New Person" shows a message that creation is not available here; create via contact or member.
- **Deletion eligibility:** `persons` is not in deletion-eligibility entity types; no delete button on Person drawer (by design for this pass).
- **RelatedRecordsTabs / customer related:** Customer "Related" tab still shows Contacts and Members; no "Persons" tab that lists persons linked via customer_persons in this pass.
- **contact-options / job primary contact:** Still contact-based; no person-options or primary_person_id in job POST yet.
- **Documents/messages for person:** Person related API does not load documents or messages; only customer_persons, person_relationships, compatibility contacts/members.

---

## 4. Manual test checklist

- [ ] **Open contact and verify linked person**  
  Admin → Contacts → open a contact. In Overview, confirm "Canonical Person" with a "View person" link when the contact has a person. Click it and confirm the Person drawer opens.

- [ ] **Open customer member and verify linked person**  
  Admin → Customer Members → open a member. In Overview, confirm "Canonical Person" / "View person" when the member has a person. Click and confirm Person drawer.

- [ ] **Open person drawer directly**  
  From a Contact or Member drawer, click "View person". Confirm Person drawer shows: Overview (name, email, phone, etc.) and Related tab with Customers, Relationships, Contact records, Member records as applicable.

- [ ] **Customer–person relationships**  
  In Person drawer → Related, confirm "Customers" lists customers from customer_persons with working links to Customer drawer.

- [ ] **Person relationships**  
  In Person drawer → Related, confirm "Relationships" lists other persons with working "View person" links.

- [ ] **Old contact/member flows**  
  Create/edit contact and member as before. Confirm primary contact on job/opportunity/customer/vendor still works. Confirm contact-options for job primary contact dropdown unchanged.

- [ ] **Job/opportunity/customer responses**  
  Open a job, opportunity, customer, or vendor that has a primary contact. Confirm response includes existing fields and also `_primary_person_id` and `_primary_person_name` when the primary contact has a person.

---

## 5. Risks / decisions

- **customer_persons.org_id:** Entity and related APIs filter `customer_persons` by `org_id`. If that column is missing in your schema, the queries will fail; remove the `.eq("org_id", ctx.orgId)` for that table or add the column.
- **person_relationships:** Queried by `person_id_a` / `person_id_b` without `org_id` filter; RLS is assumed to enforce scope.
- **Opening Person from lists:** There is no "Persons" list page yet; Person is only openable from Contact/Member drawer or from Person Related (relationships). Adding a list and/or a global "Open person by id" is a follow-up.
- **Person create:** Explicitly not implemented; message in drawer explains to create via contact or member.

Build: `npm run build` in `web` completes successfully (TypeScript and Next.js build).
