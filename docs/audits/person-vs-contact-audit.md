# Person vs Contact audit

**Date:** 2026-05-02  
**Scope:** Repo-wide inventory of identity-related symbols (`contact_id`, `primary_contact_id`, `contacts`, person tables/fields). Focus: clarity, labeling, and preventing new contact-first implementations — **no schema deletion**, **no removal of compatibility paths**.

**Canonical rule (as-built policy):**

- **`persons`** are canonical human identity for forward CRM/booking work.
- **`customer_persons`** is the canonical customer↔person relationship table.
- **`contacts`** (and FKs like `primary_contact_id`, `messages_outbox.to_contact_id`) remain **legacy / compatibility** for messaging, documents, workflows, vendor linkage, and historical rows.
- In new application code, when both exist on a row, prefer **`primary_person_id`** over **`primary_contact_id`** for CRM semantics — **without** guessing DB-wide authority for aged rows outside code paths documented here.

Related docs: `docs/platform/core/entity-model.md`, supplemental `docs/product/crm-system.md`, `docs/platform/governance/glossary.md`, `docs/platform/foundation/product-roadmap.md`.

---

## 1. Inventory — contact-related usage

### 1.1 `contact_id` (column / payload field)

| Area | Location(s) | Role |
|------|-------------|------|
| Schema / dumps | `data.sql`, `data_public.sql`, `prod_baseline.sql`, `supabase/migrations/*.sql`, `docs/supabase/reference/*` | Table columns: `contact_tags`, `customer_member_contacts`, `discount_redemptions`, `vendor_users`, workflow payloads |
| Backend Python | `backend/app/routes/leads.py`, `lead_processing.py`, `routes/webhooks.py`, `routes/debug.py`, `routes/quote.py`, `services/activity_workflow_events.py`, `supabase_client.py`, `utils.py` | GHL + Supabase resolution, logging, webhook reconciliation |
| Web API | `web/app/api/book-v2/confirm/route.ts`, discount/redemption flows via entity APIs | Booking confirm payloads; redemption linkage |
| Admin | `web/app/api/admin/entity/[type]/[id]/route.ts`, `AdminEntityDrawer.tsx`, `entityPresentation.ts`, `deletionEligibility.ts`, `customer-member-contacts/*`, related drawer loaders | Reads/writes compatibility joins |
| Scripts | Seed/wipe scripts referencing FK integrity | Demo data |

### 1.2 `primary_contact_id`

| Area | Location(s) | Role |
|------|-------------|------|
| Schema | `customers`, `opportunities`, `jobs`, `customer_subscriptions`, `vendors` (baseline SQL / migrations) | Legacy FK to `contacts` |
| Booking | `web/lib/bookingResolver.ts`, `web/app/api/book-v2/confirm/route.ts` | Resolver ensures customer ↔ contact linkage for book-v2 compatibility |
| Admin APIs | `web/app/api/admin/jobs/route.ts`, `web/app/api/admin/jobs/[id]/route.ts`, `web/app/api/admin/related/[entity]/[id]/route.ts`, `web/app/api/admin/contacts/route.ts`, `web/app/api/admin/customers/route.ts`, `web/app/api/admin/customers/[id]/route.ts`, `web/app/api/admin/entity/[type]/[id]/route.ts` | List/filter, enrichment, PATCH |
| Leads | `web/app/api/leads/gutters/route.ts`, `backend/app/routes/leads.py`, `backend/app/supabase_client.py` | Inbound leads still stamp compatibility contact |
| UI | `web/components/admin/AdminEntityDrawer.tsx`, `web/app/admin/opportunities/OpportunitiesClient.tsx`, `entityPresentation.ts` | Forms, labels (“Contact (compatibility)”) |
| Workflow / activity | `backend/app/services/activity_workflow_events.py` | Resolves activity context via contact FK patterns |

### 1.3 Table / entity `contacts`

| Area | Location(s) | Role |
|------|-------------|------|
| Admin CRUD | `web/app/api/admin/contacts/*`, entity GET `type=contacts`, drawer UX | Operational compatibility UI |
| Booking resolver | `bookingResolver.ts`, `bookingCustomerPersonLink.ts` | Upsert/link rows; sync `contacts.person_id` when person known |
| Persons listing | `web/app/api/admin/persons/route.ts` | Still joins `contacts` for footprint counts |
| Lib helpers | `web/lib/supabase.ts` (`findContactByEmail`, `createContact`, `createOpportunity`, …) | Service-role REST helpers |

### 1.4 `to_contact_id`

| Area | Location(s) | Role |
|------|-------------|------|
| Schema | `messages_outbox` | FK for compatibility / audit |
| Workflows | `web/lib/workflowRun.ts` (`send_message` → outbox insert) | Queued sends keyed by contact |
| Admin UI | `web/app/admin/messaging/*.tsx`, `messages-outbox/*.tsx`, related API filters | Observability |

### 1.5 `owner_contact_id`

| Area | Location(s) | Role |
|------|-------------|------|
| Schema | `documents` | Document ownership compatibility |
| Admin | `web/app/api/admin/related/[entity]/[id]/route.ts`, `entityPresentation.ts` | Contact drawer documents |

### 1.6 `customer_member_contacts`

| Area | Location(s) | Role |
|------|-------------|------|
| Schema | Unique on `(org_id, customer_member_id, contact_id, role_key)` | Member ↔ contact bridge |
| API | `web/app/api/admin/customer-member-contacts/route.ts`, `[id]/route.ts` | GET/POST/PATCH admin |
| UI / eligibility | `AdminEntityDrawer.tsx`, `deletionEligibility.ts`, related loaders | UX + delete guards |

### 1.7 `vendor_users.contact_id`

| Area | Notes |
|------|--------|
| Schema / reference CSV | Present in Supabase baseline; **unique (vendor_id, contact_id)** |
| Application `web/` | **No TS usages found** in this audit — compatibility remains schema/vendor-facing only unless added elsewhere |

---

## 2. Inventory — person-related usage

### 2.1 `person_id` / `primary_person_id`

Representative locations:

- **Booking (person-first):** `web/app/api/book-v2/quote-start/route.ts`, `specialty-quote-start/route.ts`, `confirm/route.ts`
- **Person resolution helpers:** `web/lib/bookingPersonCustomerResolve.ts`, `web/lib/persons/findOrCreatePersonInOrg.ts`
- **Admin jobs:** `web/app/api/admin/jobs/route.ts`, `web/app/api/admin/jobs/[id]/route.ts`
- **Admin entity GET:** `web/app/api/admin/entity/[type]/[id]/route.ts` (opportunities, jobs, customers, vendors)
- **CRM UX:** `AdminEntityDrawer.tsx`, `entityPresentation.ts`, workspace queues (`buildOpportunityAttentionQueueItems.ts`)
- **Communications:** `drawer-recipients/route.ts`, `CommunicationsDrawerSection.tsx`, `drawerEmailRecipients.ts`
- **Backend:** Opportunity payloads may include `primary_person_id` when `contacts.person_id` is populated (`backend/app/routes/leads.py` after this sprint)

### 2.2 `customer_persons`

- Booking sync: `web/lib/bookingCustomerPersonLink.ts`, `confirm/route.ts`, `bookingPersonCustomerResolve.ts`
- Admin: `entity/[type]/[id]/route.ts` (person drawer), `related` route (customer branch), `db-relationships`, `person-options`, `executeAdminAction.ts`
- RRS / presentation: `web/lib/rrs/entities/job.ts`, `actionLinkDisplayDetails.ts`

### 2.3 `person_relationships` / `person_locations`

- Drawer / settings copy: `AdminEntityDrawer.tsx`, `RelationshipsSettingsClient.tsx`, `personTypeSettings.ts`
- Admin listing: `db-relationships/route.ts`
- Quote helpers: `quoteStartLocationHelpers.ts`, location sections in drawer

---

## 3. Compatibility-required contact usage (keep)

These paths **should retain** contact FKs until an explicit deprecation phase:

1. **Workflow `send_message`** → `messages_outbox.to_contact_id` (`workflowRun.ts`).
2. **Documents** `owner_contact_id` and entity-type document joins on contact IDs.
3. **Discount redemptions** `contact_id` (historical + reporting).
4. **Vendor / GHL** integrations that resolve or emit external contact identifiers (`backend/app/routes/leads.py`, webhooks, `supabase_client.py`).
5. **Admin “contact” drawer** and **related lists** keyed by `primary_contact_id` / `to_contact_id` for operational continuity.
6. **`customer_member_contacts`** until household modeling moves fully to person primitives.

---

## 4. Risky or incorrect patterns for **new** work

Avoid introducing:

- **Contact-only lead pipelines** without stamping `primary_person_id` when `contacts.person_id` exists or when using person-first APIs (`quote-start`).
- **New customer identity** modeled only via `customers.primary_contact_id` **without** a `customer_persons` row when a person exists.
- **New `customer_member_contacts` writes** for net-new CRM relationships — prefer `customer_persons` / `person_relationships` unless patching legacy UX.
- **New admin mutations** that set `opportunity.primary_contact_id` **without** checking populating/syncing `primary_person_id` where policy applies.

---

## 5. Writes vs reads — identity fields (high-traffic routes)

### Writes (create/update identity-ish columns)

| Route / module | Fields | Notes |
|----------------|--------|-------|
| `web/app/api/book-v2/quote-start/route.ts` | `opportunities.primary_person_id`, `primary_contact_id: null` | Person-first quote |
| `web/app/api/book-v2/specialty-quote-start/route.ts` | Same pattern | Specialty funnel |
| `web/app/api/book-v2/confirm/route.ts` | `opportunities.primary_person_id`, jobs, `customer_persons`, contact linkage | Mixed compatibility + person-first integrity checks |
| `web/lib/bookingResolver.ts` | `customers.primary_contact_id`, `contacts.customer_id` | LEGACY_COMPAT booking |
| `web/lib/bookingCustomerPersonLink.ts` | `contacts.person_id`, `customer_persons` | Canonical relationship writes |
| `web/app/api/leads/gutters/route.ts` | `primary_contact_id` + optional `primary_person_id` | Compatibility + person when linked |
| `web/app/api/admin/jobs/route.ts` POST | `primary_contact_id`, `primary_person_id` (derived from contact when missing) | Person-first enrichment |
| `web/lib/supabase.ts` `createOpportunity` | Accepts both FKs | Lead/helper callers |
| `backend/app/routes/leads.py` | Opportunity payload with `primary_contact_id` + optional `primary_person_id` | GHL cleaning lead |
| `backend/app/supabase_client.py` | Opportunity/customer/contact REST writes | Broad compatibility surface |

### Reads (resolve/display)

| Route / module | Behavior |
|----------------|----------|
| `web/app/api/admin/entity/[type]/[id]/route.ts` | Prefer person fields for opportunities; fall back to contact for labels |
| `web/app/api/admin/related/[entity]/[id]/route.ts` | Contact-centric queries for compatibility tabs |
| `web/app/api/admin/customers/route.ts` | Joins contact → derives `_primary_person_id` |
| `web/lib/workflowRun.ts` | Contact-based recipient resolution |
| `AdminEntityDrawer.tsx` | Dual display (person + contact compatibility) |

---

## 6. Code changes in this sprint (summary)

- **Comments / labels:** `LEGACY_COMPAT` (or equivalent guardrail prose) added at booking resolver, booking↔person linker, workflow outbox insert, admin related-contact branch, admin opportunity PATCH allowlist, customer-member-contacts routes, entity opportunity enrichment branch, backend `create_opportunity` docstring.
- **Person-first writes where safe:**
  - Gutters lead: `fetchContactIdentityById` + optional `primary_person_id` on opportunity create (`web/lib/supabase.ts`, gutters route).
  - Admin job POST: optional `primary_person_id` body + auto-fill from `contacts.person_id` when `primary_contact_id` provided.
  - Backend cleaning lead: opportunity payload adds `primary_person_id` when upserted contact exposes `person_id`.

---

## 7. Recommended follow-up cards (exact backlog candidates)

1. **Inbound parity audit:** Enumerate every route that inserts `contacts` without ensuring `person_id` + `customer_persons` (excluding intentional vendor-only contacts).
2. **Backend opportunity helper:** Centralize Python opportunity creation to always mirror TS policy: set `primary_person_id` whenever Supabase contact has `person_id`.
3. **`messages_outbox` evolution:** Add nullable `to_person_id`, dual-write from `contacts.person_id`, keep `to_contact_id` until send pipeline migrated.
4. **Documents:** Add person-backed ownership (`owner_person_id` or equivalent) **alongside** `owner_contact_id`; migrate readers incrementally.
5. **`vendor_users.contact_id`:** If product needs vendor staff as persons, design additive FK (`person_id`) without breaking unique `(vendor_id, contact_id)` semantics short term.
6. **`customer_member_contacts` deprecation plan:** UX for household members → person graph (`customer_persons` + `person_relationships`) with read shim over legacy table.
7. **Production metrics:** Dashboard share of opportunities with `primary_person_id` vs `primary_contact_id`-only (requires DB query).
8. **Admin opportunity/job PATCH:** Explicit allowlist rules for identity FK updates with validation (today partially routed via drawer/entity endpoints).

---

## 8. Smoke / typecheck

- TypeScript: `cd web && npx tsc --noEmit` (pass after changes).

---

## 9. References (non-exhaustive grep anchors)

Use ripgrep for drift detection:

- `contact_id`, `primary_contact_id`, `to_contact_id`, `owner_contact_id`, `customer_member_contacts`, `vendor_users`
- `person_id`, `primary_person_id`, `customer_persons`, `person_relationships`, `person_locations`

Archived audits under `docs/archive/` may repeat themes; **`docs/system/entity-model.md`** and this file should win for current policy.
