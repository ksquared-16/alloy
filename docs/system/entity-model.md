# Entity model

## Purpose

Describe the main database-backed entities and how **persons**, **customer_persons**, **contacts**, and CRM objects relate — grounded in schema and code, not old doctrine.

## Current state

- Postgres schema under **`public`** with strong **`org_id`** presence on tenant-owned tables.
- **Persons:** `persons` holds human identity fields used across booking, CRM, and admin.
- **Customer linkage:** `customer_persons` joins `person_id` ↔ `customer_id` with `role_type`, `is_primary`, optional status/dates, org-scoped uniqueness on `(org_id, customer_id, person_id, role_type)` per baseline SQL.
- **Contacts:** `contacts` table still exists; admin drawer and entity APIs include `contacts` as an entity type. Some inbound flows (e.g. lead capture) still reference contact IDs; opportunity rows may carry `primary_contact_id` depending on migration age.
- **Opportunities:** `opportunities` tie pipeline state to customers and work units; **`primary_person_id`** is the canonical identity for **new writes** (all inserts/updates normalize via `web/lib/opportunityIdentity.ts`). **`primary_contact_id`** is **legacy fallback** for compatibility (messaging, GHL, aged rows). Python/sync use **`enrich_opportunity_payload_person_first`** before PostgREST. Legacy rows may lack `primary_person_id` until backfill — see **`docs/execution/roadmap-and-gaps.md`** (working notes).
- **Jobs, schedules, payments, documents:** First-class entities with org scoping; used across workspace, billing, and communications.
- **Tour scheduling (enrollment CRM V1):** **`tour_bookings`** anchor org + opportunity + site (`location_id`) + absolute `start_at`/`end_at` + IANA `timezone` for sales tours. **`tour_availability_rules`** define recurring bookable windows (config-driven). **`public.schedules`** stays **job-attached** (`job_id` NOT NULL) for service visits — tours are **not** `schedules` rows. **`opportunities.metadata.tour_date` / `tour_time`** mirror a **confirmed** booking for queue/Needs Attention compatibility; **operator-facing tour time** in the drawer is derived from **`tour_bookings`** when an active booking exists (see **`docs/sprints/05_2026/tour_scheduling_v1.md`**).
- **Communications (canonical):** **`communication_threads`** (org + primary entity + channel + `recipient_key`) and **`communication_messages`** (inbound/outbound rows, read/unread, queue status). **`communication_provider_bindings`** selects Twilio/Resend configuration per org/channel (see **`docs/product/communications.md`**).
- **Forms (engine):** **`form_definitions`**, **`form_definition_versions`**, **`form_public_links`**, **`form_submissions`** (+ linkage/signature tables per migrations) — versioned capture separate from **`documents`** file rows (see **`docs/product/documents-and-forms.md`**).
- **Household children (enrollment / CRM compact):** **`customer_members`** stores people tied to a **`customers`** row (household/account). For queue previews and enrollment-style workflows, **active children** are rows with **`relationship = 'child'`** and **`is_active = true`**, joined from **`opportunities.customer_id` → `customer_members.customer_id`**. **`customer_persons`** is the **`person_id` ↔ `customer_id` link** with role semantics for canonical people; **`customer_members`** is the **household-member / child roster** used when list UIs need “who are the kids?” without treating opportunity JSON as truth. A future model might unify these; until then **`customer_members` is the source of truth for child names/DOB in queue enrichment**.
- **Locations (physical hierarchy):** All address, site, and room/classroom records live in **`locations`** — there is **no separate `rooms` table in V1**. See **Location semantics** below.

## Location semantics

All physical / site / room-style location records use the hierarchical **`locations`** table (`org_id`-scoped).

### Recommended taxonomy (`locations.location_type`)

| Type | Meaning | Typical use |
|------|---------|-------------|
| **`address`** | Postal / address-level container | Customer service addresses, booking destinations |
| **`site`** | Physical school, building, or center | Campus / center scope, tours, user site access |
| **`unit`** | Room, classroom, or cohort/program space under a site | Child room interest; `parent_location_id` → site row |

**Rooms are not a separate table.** Classrooms and rooms are **`locations` rows** where **`location_type = 'unit'`**, linked to a parent site via **`parent_location_id`**. Optional **`metadata`** (e.g. `semantic_kind: "classroom"`) may further describe the unit; the type CHECK allows only `address`, `site`, and `unit`.

**Programs and cohorts (enrollment):** Childcare **program** bands are org option-set keys (`childcare_program_type`), not location rows. **Room/cohort interest** on a child inquiry is stored as **`program_room_cohort_key`** (text), usually the **`locations.id`** of a `unit` row. Waitlist grain uses **`placement_candidates.site_id`** + **`program_room_cohort_key`**.

### Child vs opportunity location authority

| Grain | Source of truth | Column |
|-------|-----------------|--------|
| **Child site / location** | **`opportunity_customer_members`** | `location_id` → `locations` (`site`) |
| **Child room** | **`opportunity_customer_members`** | `program_room_cohort_key` → unit `locations.id` |
| **Case / opportunity location** | **`opportunities`** | `location_id` |

**`opportunities.location_id` is fallback and display convenience only** — not canonical child placement truth. Placement backfill may use it when a child OCM row has no `location_id`; operators should set child-level location in the inquiry children grid.

**Opportunity display rule:** When all children on an opportunity resolve to the same site, opportunity surfaces may show that site. When children resolve to different sites, show **“Multiple locations”** and prefer child-level location badges/labels in inquiry and queue previews.

**Key files:** `web/lib/admin/drawer/inquiryChildPlacementScope.ts`, `web/lib/recordChrome/locationDrawerLayoutTarget.ts`, `web/lib/entityPresentation.ts` (`locations` drawer — code-defined today).

## How it works

- **Identity resolution:** Server helpers resolve booking/customer context using persons + `customer_persons` where implemented (`web/lib/bookingPersonCustomerResolve.ts`, `web/lib/bookingCustomerPersonLink.ts`).
- **Role types:** Org-configurable role labels/keys via `customer_person_role_types` and admin helpers (`web/lib/admin/personTypeSettings.ts`).
- **Admin presentation:** `AdminEntityDrawer` loads related `customer_persons` arrays when viewing a person; opportunities and customers show linked people/contacts per current UI.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Baseline tables | `supabase/migrations/`, `prod_baseline.sql` |
| Admin entity GET (many types) | `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Person type / role settings | `web/lib/admin/personTypeSettings.ts` |
| Drawer UI | `web/components/admin/AdminEntityDrawer.tsx` |
| Opportunity row identity rules | `web/lib/opportunityIdentity.ts` |

## Guardrails

- **Canonical identity:** **`persons`** + **`customer_persons`** model people and customer relationships for new CRM/booking features.
- **Compatibility:** **`contacts`** and FKs such as **`primary_contact_id`**, **`messages_outbox.to_contact_id`**, and **`documents.owner_contact_id`** remain required for messaging, workflows, documents, vendor/GHL integrations, and aged rows — **do not delete** in application code without an explicit deprecation project.
- **Precedence in new code:** When both `primary_contact_id` and `primary_person_id` exist on an entity row, **`primary_person_id` wins** for CRM semantics **when populated**; never assume `primary_contact_id` alone is sufficient for new relationship modeling.
- **Opportunity writes:** Do not bypass **`normalizeOpportunityWritePayload`** (or Python **`enrich_opportunity_payload_person_first`**) on new code paths that touch `opportunities` identity columns. Plain `.mjs` demo seeds that are person-first by construction may document a **normalization bypass** inline when TypeScript helpers are unavailable.
- **Child / household member facts:** Do **not** treat **`opportunities.metadata`** as the source of truth for child names or DOB. Use **`customer_members`** (see **Household children** under **Current state**) or entity/drawer payloads that hydrate from the same tables.
- **Do not** design new CRM features that treat **`contacts`** as the long-term source of truth for people.

## Known gaps / risks

- **Needs verification:** Production share of **`opportunities`** rows with **`primary_person_id`** populated vs **`primary_contact_id`**-only (see `docs/audits/person-vs-contact-audit.md`).
- **Needs verification:** Complete mapping of inbound APIs that still create **`contacts`** without threading **`person_id`** / **`customer_persons`** where applicable.

## When this doc must be updated

New entity types, FK migrations on `opportunities`/`customers`, retirement of `contacts` from APIs/UI, changes to **`customer_members`** vs opportunity-metadata child modeling, changes to **tour** tables vs **`schedules`** / opportunity metadata mirror rules, or changes to **location hierarchy** / child placement authority (`opportunity_customer_members.location_id`).
