> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Directory → People / Drawer Cleanup — Deliverables

This document summarizes the UI shift so that **Person/People** is the primary human concept in drawers and list pages, with Contacts/Members treated as legacy.

---

## 1. Files changed

| File | Changes |
|------|--------|
| `web/components/admin/AdminEntityDrawer.tsx` | Customer Related: removed Contacts and Members sections; only People as primary human section. Person create form for `persons` + `id === "new"`. Legacy banner for Contact/Customer Member drawers when `_person_id` is set. |
| `web/app/api/admin/persons/route.ts` | Added **POST** handler: creates a person with `org_id` from admin context and optional `first_name`, `last_name`, `email`, `phone`; returns 201 with created row. Admin-only. |
| `web/app/admin/people/PeopleClient.tsx` | **Add Person** button (opens Person drawer with `id: "new"`). Filter affordance: filter icon, dropdown with “Search (name, email, phone)”; client-side filtering over `persons`; Apply/Clear, filter dot when active. |

---

## 2. Drawer sections removed / hidden / demoted

- **Customer drawer → Related tab**
  - **Removed:** “Contacts (legacy)” and “Members (legacy)” as primary sections.
  - **Primary human section:** Only **People** (from `customer_persons`).
  - Remaining sections: People, Opportunities, Jobs, Schedules, Locations, Subscriptions, Discounts, Messages, Tags (no separate Contacts/Members).
- **Contact and Customer Member drawers**
  - No section removal; a **legacy banner** was added at the top when the record has `_person_id`, steering users to the canonical Person drawer.

---

## 3. How Add Person works

- **Entry:** People page → **Add Person** button (shown when user has mutate permission).
- **Flow:**
  1. Click **Add Person** → `openDrawer({ type: "persons", id: "new" })`.
  2. Drawer shows create form: First name, Last name, Email, Phone (all optional).
  3. User fills fields and clicks **Create person**.
  4. Client POSTs to `POST /api/admin/persons` with body `{ first_name?, last_name?, email?, phone? }`; `org_id` comes from `getAdminContext()`.
  5. On 201: drawer switches to the new person (`openDrawer({ type: "persons", id: newId })`) and list refetches.
- **Schema:** Creates a row in the canonical `persons` table only; no required linkage to customer/contact/member. Optional customer linkage can be added later.

---

## 4. Legacy drawer behavior that remains

- **Contact drawer** and **Customer Member drawer** still exist and open from:
  - Legacy links, contact-based selectors, and any code that opens `contacts` or `customer_members` by id.
- When the opened record has **`_person_id`**:
  - A prominent **amber “Legacy record”** banner appears at the top with short copy and an **“Open canonical Person”** button that opens the Person drawer for that `_person_id`.
- The rest of the Contact/Member drawer (tabs, overview, edit, archive, etc.) is **unchanged** for compatibility with jobs, schedules, opportunities, booking, workflows, and documents/messages that still reference contacts/members.
- No duplication of full overview/related UI was added to these legacy drawers; the banner is the only new content.

---

## 5. Manual test checklist

- [ ] **Customer drawer – People only**
  - Open a customer → Related tab.
  - Confirm only **People** appears as the human-related section (no Contacts or Members sections).
  - Confirm you can add/view people via the People section.

- [ ] **People page – Add Person**
  - Go to Directory → People.
  - Click **Add Person**; drawer opens with create form.
  - Submit with at least one field (e.g. first name); confirm person is created and drawer shows the new person; list refreshes.

- [ ] **People page – Filter**
  - On People page, click the filter icon; dropdown opens with search.
  - Type in search; Apply; confirm list filters by name/email/phone; filter dot appears when filter is active.
  - Clear; confirm full list returns.

- [ ] **Legacy Contact drawer – Open canonical Person**
  - Open a contact that has a linked person (`_person_id`).
  - Confirm amber “Legacy record” banner at top and **Open canonical Person** button.
  - Click button; Person drawer opens for that person.

- [ ] **Legacy Customer Member drawer – Open canonical Person**
  - Open a customer member that has a linked person.
  - Same as above: banner and button open the Person drawer.

- [ ] **Compatibility**
  - Jobs: create/edit job, select contact; job still works.
  - Schedules: schedule still shows contact/customer as expected.
  - Opportunities: opportunity contact/customer unchanged.
  - Booking/checkout: flow unchanged.
  - Workflow execution and contact-based selectors: unchanged.
  - Documents/messages using contact paths: still work.

---

*End of deliverables.*
