# Person-First Quote Stage — Audit

**Goal:** Stop using Contact as the primary quote-stage human record. Make Person the true quote-stage record: create/find Person and Opportunity at quote; do not create Contact or Customer until booking/payment/confirm. At confirm, create Customer and customer_persons; use or create Contact only where a legacy path still requires it.

**Scope:** Audit only. No implementation in this document.

---

## 1. Exact current dependencies on contact in quote/booking lifecycle

### 1.1 Quote-start (`web/app/api/book-v2/quote-start/route.ts`)

| Dependency | How it’s used |
|------------|----------------|
| **Contact create/find** | Lookup by email then phone; insert new contact (first_name, last_name, email, phone, postal_code, contact_type "lead", org_id, **person_id**). Returns `contactId`. |
| **Opportunity** | Dedupe by `primary_contact_id` + recent time; insert with `primary_contact_id: contactId`, `customer_id: null`. |
| **Response** | Returns `contact_id`, `opportunity_id`, `quote_output`. Client stores `alloy_contact_id`, `alloy_opportunity_id`. |
| **Person** | Already implemented: `findOrCreatePerson`; contact row has `person_id`; no Contact creation would require creating only Person + Opportunity. |

So today: **Contact is required at quote** (created/found first); Opportunity is keyed by `primary_contact_id`. Person is created and linked to Contact but Contact remains the primary record.

### 1.2 Confirm (`web/app/api/book-v2/confirm/route.ts`)

| Dependency | How it’s used |
|------------|----------------|
| **Quote path (useQuoteIds)** | Validates `opp.primary_contact_id === contact_id_from_quote`; uses `contactId` for customer creation, opportunity/job/subscription updates, discount_redemption, integrity check. |
| **Contact ID** | Either from quote (`contact_id_from_quote`) or from `resolve_or_create_contact_and_customer`. |
| **ensureCustomerForContactInConfirm** | Loads contact by id; creates Customer with `primary_contact_id: contactId`; links contact to customer; if contact has `person_id`, creates `customer_persons`. |
| **Opportunity** | Updated/created with `primary_contact_id: contactId`. |
| **Job** | Created/updated with `primary_contact_id: contactId`. |
| **Customer subscription** | Created with `primary_contact_id: contactId`. |
| **Discount redemptions** | Insert with `contact_id: contactId` (NOT NULL in schema). |
| **Integrity check** | Verifies `job.primary_contact_id === contactId` and `opportunity.primary_contact_id === contactId`. |
| **Response** | Returns `contact_id` (and customer_id, opportunity_id, job_id, schedule_id). |

So at confirm, **contact_id is the thread** that ties quote → opportunity → customer → job → schedule and discount_redemption.

### 1.3 Jobs and schedules

| Table | Contact at creation | Notes |
|-------|---------------------|--------|
| **jobs** | `primary_contact_id` set on insert and update in confirm. Admin POST job validates `primary_contact_id` against contacts and customer_id. | Job requires a contact id for “primary contact.” |
| **schedules** | No `primary_contact_id` column. Schedule links to job; “primary contact” for a schedule is derived as job → `job.primary_contact_id` → contact. | Schedules do **not** need contact at creation; they need job_id. |

So: **jobs** must have a human record at creation (today: contact via `primary_contact_id`). **Schedules** only need job_id; no direct contact dependency at creation.

### 1.4 Other lifecycle touchpoints

| Area | Contact dependency |
|------|--------------------|
| **Payment (Stripe)** | Backend uses `contact_id_from_quote` and/or GHL contact; `resolve_or_create_contact_and_customer` returns Supabase contact_id + customer_id. SetupIntent requires customer; contact used for resolution and metadata. |
| **Workflows** | `quote_started` payload has opportunity (which has primary_contact_id). `send_message`: recipients resolved to `contact_id`; `ensureContactPhoneEmail` loads contact for phone/email; `messages_outbox` row has `to_contact_id`. Vendor recipients come from `vendors.primary_contact_id`. |
| **Admin UI** | Opportunities, jobs, customers, vendors, schedules (via job) show “Primary Contact” from `primary_contact_id` → contact. Entity GET for opportunity/job/customer/vendor/schedule loads contact by primary_contact_id and exposes `_primary_person_id` / name when contact has person_id. |
| **Related records** | For entity=contact: opportunities, jobs, customer_subscriptions, messages_outbox, discount_redemptions by contact id. For entity=customer: primary_contact_id used. |
| **Discount redemptions** | `contact_id` NOT NULL, FK to contacts. |
| **messages_outbox** | `to_contact_id` nullable FK to contacts; used for dedupe and display. |
| **customer_subscriptions** | `primary_contact_id` set at creation in confirm. |
| **Backend (Python)** | GHL contact_id ↔ Supabase contact_id mapping; dispatch creates opportunity with primary_contact_id; Stripe uses contact for resolution and tagging. |

---

## 2. Whether opportunities need `primary_person_id`

**Conclusion: Yes, for a person-first quote stage.**

- Today: opportunities have `primary_contact_id` (and optionally customer_id). At quote we create Opportunity with `primary_contact_id` and no customer.
- Desired: at quote we create/find **Person** and **Opportunity** only; no Contact. So Opportunity must point at the lead human by **person**, not contact.
- **Schema change:** Add `primary_person_id` (nullable, FK to persons) to `opportunities`. Keep `primary_contact_id` nullable for legacy/backfill.
- **Code:** Quote-start would set `primary_person_id` from the resolved/created person and leave `primary_contact_id` null (or set it only when creating a compatibility Contact later). Confirm and admin would prefer `primary_person_id` when present, with fallback to contact (e.g. for display and integrity checks).

---

## 3. All places quote-start / booking / confirm assume `primary_contact_id`

- **quote-start:** Sets `opportunities.primary_contact_id = contactId`; dedupes by `primary_contact_id`; response returns `contact_id`.
- **confirm (useQuoteIds):** Validates `opp.primary_contact_id === contact_id_from_quote`; uses contactId for ensureCustomer, opportunity update, job create/update, customer_subscription, discount_redemption, integrity check.
- **confirm (else):** Resolver returns contact_id; new/updated opportunity and job get `primary_contact_id: contactId`.
- **Admin:** Entity GET for opportunity/job/customer/vendor/schedule loads contact by `primary_contact_id` and shows name / `_primary_person_*`. Related-record APIs filter opportunities/jobs/customer_subscriptions by `primary_contact_id` for entity=contact. Opportunities list page loads contacts by opportunity `primary_contact_id`. Jobs POST validates `primary_contact_id`; job GET/PATCH use it.
- **Workflows:** send_message resolves recipients to contact_id; messages_outbox stores `to_contact_id`. Vendor recipients use `vendors.primary_contact_id`.
- **Backend:** Dispatch creates opportunity with `primary_contact_id`; Stripe resolution uses contact.

All of these would need to accept **person** as the quote-stage identity and either use `primary_person_id` where available or resolve person → contact for legacy paths.

---

## 4. What minimum schema and code changes are needed to make quote-start person-first

### 4.1 Schema

| Change | Purpose |
|--------|---------|
| **opportunities.primary_person_id** | Nullable UUID FK to persons. Set at quote from resolved person; used as primary quote-stage human link. |
| **opportunities.primary_contact_id** | Make nullable if not already; keep for legacy and for “contact created at confirm” path. |
| **jobs.primary_person_id** | Nullable UUID FK to persons. Set at confirm from opportunity’s person (or from contact’s person_id). Prefer for display when present. |
| **jobs.primary_contact_id** | Keep; nullable for legacy. Required only when a legacy path creates a contact and we need to store it. |
| **discount_redemptions.contact_id** | Today NOT NULL. Add **person_id** (nullable FK to persons); backfill from contact’s person_id; then allow contact_id nullable for new flows (or keep NOT NULL and create a “compatibility” contact when needed). |
| **messages_outbox** | Optional: add **to_person_id** (nullable). Resolve to contact for sending when only person exists (person → phone/email from persons table). |
| **customer_subscriptions** | Optional: **primary_person_id** (nullable); keep primary_contact_id for legacy. |
| **customers** | Optional: **primary_person_id** (nullable); already have primary_contact_id. |

Minimum for “quote-start person-only, no contact”: **opportunities.primary_person_id**, **jobs.primary_person_id**, and making **opportunities.primary_contact_id** nullable (if not already). Discount redemptions and messaging can be phased (e.g. create contact at confirm for those FKs initially).

### 4.2 Code (minimum for quote-start person-first)

| Area | Change |
|------|--------|
| **quote-start** | Stop creating/finding Contact. Create/find Person only; create/update Opportunity with `primary_person_id` and `primary_contact_id: null`. Return `person_id` and `opportunity_id` (no `contact_id`). Dedupe opportunity by `primary_person_id` (and time/source) instead of primary_contact_id. |
| **Client (quote)** | Store `alloy_person_id` and `alloy_opportunity_id`; stop requiring `alloy_contact_id` for quote→confirm handoff. |
| **confirm** | Accept `person_id` + `opportunity_id` from quote. Validate opportunity by `primary_person_id` (or primary_contact_id if still sent). Resolve “contactId” only when needed: (1) ensureCustomer: create Customer + customer_persons from person; create Contact only if a legacy path needs it (e.g. discount_redemption, messages_outbox, or existing code that expects contact_id). (2) Opportunity/job/customer_subscription: set primary_person_id; set primary_contact_id only when a contact was created. |
| **ensureCustomerForContactInConfirm** | Generalize to “ensureCustomerForPerson”: create Customer, link via customer_persons; optionally create/link a Contact for legacy and set customers.primary_contact_id then. |
| **Job create/update (confirm)** | Set `primary_person_id` from opportunity/person; set `primary_contact_id` only when a contact exists for this booking. |
| **Discount redemptions** | If schema adds person_id: set person_id when no contact; or create a “compatibility” contact from person and set contact_id (minimal change). |
| **Integrity check** | Verify job/opportunity by primary_person_id when present, else primary_contact_id. |
| **Admin entity GET** | For opportunity/job/schedule/customer/vendor: prefer primary_person_id for “primary contact” display when set; fall back to loading by primary_contact_id. |
| **Related records** | For entity=person: opportunities by primary_person_id, jobs by primary_person_id. Keep contact-based related APIs for entity=contact. |
| **Workflows** | send_message: allow recipient by person_id (resolve to phone/email from persons); optionally create/link contact for to_contact_id for legacy. |
| **Payment (Stripe)** | Resolve from person_id (or stored contact_id) to Supabase customer; create contact only if backend still requires it for tagging/metadata. |

---

## 5. Legacy compatibility paths that still require contacts

| Path | Why contact is used | How to preserve |
|------|---------------------|-----------------|
| **discount_redemptions.contact_id** | NOT NULL FK today. | Add person_id; backfill; either allow contact_id nullable and set person_id only, or create a “compatibility” contact from person at confirm and set both. |
| **messages_outbox.to_contact_id** | Recipient stored as contact; workflow loads contact for phone/email. | Add to_person_id; resolve person → phone/email for send; or create contact from person when sending and set to_contact_id. |
| **Admin “Primary Contact” links** | Many lists and drawers link to contacts by primary_contact_id. | Prefer primary_person_id for display/link when set (link to person entity); fallback to contact. |
| **Related records for contact** | Opportunities, jobs, subscriptions, messages, redemptions by contact id. | Keep for contacts that exist; add “related records for person” (opportunities/jobs by primary_person_id). |
| **Job POST (admin)** | Validates primary_contact_id against contacts and customer. | Add primary_person_id support: validate against persons and customer_persons; allow either contact or person. |
| **Stripe / GHL** | Backend tags “contact” in GHL; Stripe metadata may store contact. | Keep creating or linking a contact when we need to tag in GHL or store in Stripe metadata (e.g. at confirm), or add person_id to metadata and resolve in backend. |
| **Vendor workflows** | Vendors have primary_contact_id; workflow recipients are vendor contacts. | No change for vendors; they remain contact-based unless we add vendor_persons later. |
| **resolve_or_create_contact_and_customer** | Used when confirm doesn’t have quote ids (e.g. direct booking). | Keep; use when contact is required; optionally also create/link person from that contact. |

---

## 6. Recommended implementation order

1. **Schema (single migration)**  
   - Add `opportunities.primary_person_id` (nullable, FK persons).  
   - Add `jobs.primary_person_id` (nullable, FK persons).  
   - Ensure `opportunities.primary_contact_id` is nullable.  
   - (Optional in same or later migration: discount_redemptions.person_id, messages_outbox.to_person_id, customer_subscriptions.primary_person_id, customers.primary_person_id.)

2. **Quote-start: person-only**  
   - Remove Contact create/find from quote-start.  
   - Keep only Person find/create and Opportunity create/update with `primary_person_id`; set `primary_contact_id: null`.  
   - Dedupe opportunity by `primary_person_id` + time/source.  
   - Response: `person_id`, `opportunity_id`, `quote_output` (no `contact_id`).

3. **Client quote→confirm handoff**  
   - Use `person_id` + `opportunity_id`; stop requiring `contact_id` for the “quote path.”

4. **Confirm: person-first, contact only when needed**  
   - Accept `person_id` + `opportunity_id`; validate opportunity by `primary_person_id`.  
   - ensureCustomerForPerson: create Customer + customer_persons; create Contact only when a legacy path needs it (e.g. discount_redemption, Stripe, workflows).  
   - Set opportunity/job/customer_subscription `primary_person_id`; set `primary_contact_id` only when a contact exists.  
   - Discount redemptions: set person_id when no contact, or create compatibility contact and set contact_id.  
   - Integrity check: use primary_person_id when present.

5. **Admin and related APIs**  
   - Entity GET: prefer primary_person_id for “primary contact” display; fall back to primary_contact_id.  
   - Related records: add person-based (opportunities/jobs by primary_person_id).  
   - Job POST: add primary_person_id option.

6. **Workflows and messaging**  
   - send_message: support recipient by person_id; resolve to phone/email from persons; optionally create/link contact for to_contact_id.

7. **Payment/Stripe**  
   - Resolve customer from person_id (and existing customer_persons); create or link contact only when backend/Stripe requires it.

---

## 7. One pass vs two

- **One pass:** Schema + quote-start person-only + confirm person-first + minimal contact creation at confirm (e.g. for discount_redemption and Stripe) + admin/entity display and related APIs. Delivers the full new lifecycle in one release; higher risk and larger change set.
- **Two pass:**  
  - **Pass A:** Schema + quote-start person-only + response `person_id`/`opportunity_id`; confirm still requires `contact_id` but we **create a compatibility contact from person** at confirm when coming from quote (so quote path creates no contact until confirm, and confirm creates contact only for that path). Opportunity and job get both primary_person_id and primary_contact_id.  
  - **Pass B:** Confirm and admin prefer person everywhere; stop creating contact for quote-originated bookings where not strictly required; discount_redemptions/messages_outbox/Stripe use person_id where possible.

**Recommendation:** **Two passes.** Pass A gets schema and quote-start to person-only and keeps confirm working by creating a contact at confirm when the quote path is used (so all existing FKs and workflows still have a contact). Pass B then removes redundant contact creation and switches display and logic to person-first where possible, reducing legacy contact usage over time.

---

## 8. Risks (Stripe, workflows, messaging, admin UI)

| Area | Risk | Mitigation |
|------|------|------------|
| **Stripe** | SetupIntent and webhooks assume contact/customer resolution; missing contact_id could break resolution or tagging. | Pass A: create contact at confirm from person and pass contact_id where backend expects it. Pass B: add person_id to metadata and resolve customer from person_id + customer_persons; keep contact creation only where backend still needs it. |
| **Workflows** | send_message and create_message use contact_id; quote_started payload has opportunity (with primary_contact_id). | Pass A: ensure opportunity has primary_contact_id (from compatibility contact created at confirm) or keep sending contact in payload when present. Pass B: resolve recipients from person_id (persons.phone/email); optionally to_person_id in messages_outbox. |
| **Messaging** | messages_outbox.to_contact_id; Twilio/sender may key off contact. | Pass A: create contact at confirm so outbox can still use to_contact_id when we send to that person. Pass B: add to_person_id and resolve phone/email from persons when sending. |
| **Admin UI** | Lists and drawers show “Primary Contact” and link to contact; opportunity/job/schedule detail load contact by primary_contact_id. | Entity GET: when primary_person_id is set, load person and show as primary; link to person entity or keep contact link if primary_contact_id set. No breaking change if we keep both and prefer person when set. |
| **Related records** | “Contact” tab shows opportunities/jobs by primary_contact_id. | Add “Person” entity and related opportunities/jobs by primary_person_id. Contact tab remains for contacts that exist. |
| **Discount redemptions** | contact_id NOT NULL. | Pass A: create compatibility contact at confirm and set contact_id. Pass B: add person_id, allow contact_id nullable, set person_id when no contact. |
| **GHL / backend** | Dispatch and Stripe tag “contact” in GHL. | Pass A: compatibility contact at confirm gives a contact to tag. Pass B: optional person_id in webhooks/metadata; backend can create or find contact for tagging when needed. |

---

## 9. Summary

- **Current:** Quote-start and confirm are contact-centric; Opportunity and Job use `primary_contact_id`; schedules use job only; discount_redemptions and messages_outbox require or use contact.
- **Schema:** Add `primary_person_id` to opportunities and jobs; keep `primary_contact_id` nullable for legacy; optionally add person_id to discount_redemptions, messages_outbox, customer_subscriptions, customers.
- **Quote-start:** Create/find Person and Opportunity only; no Contact; return person_id + opportunity_id.
- **Confirm:** Resolve from person_id + opportunity_id; create Customer and customer_persons; create Contact only where legacy paths require it; set primary_person_id (and primary_contact_id when contact exists) on opportunity, job, customer_subscription.
- **Order:** Schema → quote-start person-only → confirm person-first with optional contact creation → admin/entity/related → workflows/messaging/Stripe.
- **Phasing:** Two passes recommended: Pass A (person-first quote + compatibility contact at confirm), then Pass B (prefer person everywhere and reduce contact creation).
- **Risks:** Stripe, workflows, messaging, and admin UI can be kept safe by creating a compatibility contact at confirm in Pass A and by resolving from person_id in Pass B where supported.
