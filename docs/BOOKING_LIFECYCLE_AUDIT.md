# Booking Flow Lifecycle Audit — Quote vs Customer Creation

**Goal:** Align the booking lifecycle with the new person/customer model: create **Person** (or Contact) + **Opportunity** at quote/inquiry; create **Customer** only at actual booking/purchase/schedule confirmation.

**Scope:** Audit only. No implementation in this pass.

---

## 1. Current flow (step-by-step)

### 1.1 Quote start (form submit)

**Entry points:**
- `CleaningQuickQuoteForm.tsx` → `POST /api/book-v2/quote-start`
- `BookV2Client.tsx` → `handleQuoteStartSubmit` → `POST /api/book-v2/quote-start`
- `BookV2Client.tsx` → `maybeCreateLeadFromPrefill` (prefill) → `POST /api/book-v2/quote-start`

**Steps in `web/app/api/book-v2/quote-start/route.ts`:**

1. **Contact (legacy)**
   - Look up existing **contact** by email, else by phone (`contacts` table).
   - If not found: **create contact** (insert into `contacts`: email, phone, first_name, last_name, postal_code, contact_type "lead", org_id).
   - Result: `contactId`, optionally `customerId` if contact already had `customer_id`.

2. **Customer (current problem)**
   - Call **`ensureCustomerForContact`** (same file):
     - If contact already has `customer_id` → use it.
     - Else: lookup existing customer by `primary_contact_id`, or `metadata->email`, or `metadata->phone`.
     - If found: update `contacts.customer_id`, return that customer id.
     - If not found: **create customer** (insert into `customers`: name, vertical_id, primary_contact_id, status "active", metadata source "quote-start", org_id) and update `contacts.customer_id`.
   - Result: **customerId is always set** before opportunity creation.

3. **Opportunity**
   - Resolve vertical (e.g. cleaning), pipeline, "Quote Started" stage.
   - Compute quote (RPC `get_quote_pricing`).
   - Dedupe: reuse open "Quote Started" opportunity for this contact within 10 min (same metadata source "web_quote") or **create new opportunity** (insert into `opportunities`: vertical_id, primary_contact_id, **customer_id**, name, status "open", source "website", estimated_price_cents, metadata with quote_input/quote_output, org_id).
   - Emit `quote_started` event; run workflows (event_type `quote_started`, entity_type `opportunity`).

4. **Response**
   - Returns `contact_id`, **customer_id**, `opportunity_id`, `quote_output`.
   - Clients store these in localStorage (`alloy_contact_id`, `alloy_customer_id`, `alloy_opportunity_id`).

**Where Person is created:** **Nowhere.** The flow uses the legacy **contacts** table only. There is no creation of a **persons** row in this path. (The codebase has a `persons` table and `contacts.person_id` is used elsewhere, e.g. confirm route workflow payload; quote-start does not create or reference persons.)

**Where Opportunity is created:** In **quote-start** (step 3 above), when not reusing an existing opportunity.

**Where Customer is created:** In **quote-start** (step 2 above), inside `ensureCustomerForContact`, whenever the contact does not already have a linked customer.

---

### 1.2 Payment step (Stripe SetupIntent)

**Entry:** User on payment step; front-end calls backend to get SetupIntent (card collection).

**Backend:** `backend/app/routes/stripe.py` → `POST /stripe/setup-intent`

- Accepts `contact_id`, `customer_id` from quote (and/or email + phone).
- Calls Python **`resolve_or_create_contact_and_customer`** (`backend/app/supabase_client.py`):
  - **Quote shortcut:** If `contact_id` is provided and contact exists:
    - Uses `customer_id` from body or `contact.customer_id`.
    - If contact has no customer and no `customer_id` in body → returns **`contact_no_customer`** and does **not** create a customer.
  - Else: find/create contact by email/phone; then **ensure customer** for that contact (create if missing).
- If `resolution_path == "contact_no_customer"` → 400 "Contact has no linked customer; refresh quote and try again."
- Get/create Stripe customer for `supa_customer_id`; create SetupIntent; optionally update `customers.stripe_customer_id` / setup_intent_id.

**Dependency:** Today, **Customer must exist** before SetupIntent, because the API requires a Supabase `customer_id` for Stripe linking and returns 400 when contact has no customer.

---

### 1.3 Booking confirm

**Entry:** `BookV2Client` (or equivalent) → `POST /api/book-v2/confirm` with slot, quote totals, and either:
- **useQuoteIds:** `opportunity_id`, `contact_id`, **customer_id** from quote (localStorage), or
- Else: `contact_email`, `contact_phone`, etc. (and optionally `contact_id`/`customer_id` from quote).

**Steps in `web/app/api/book-v2/confirm/route.ts`:**

1. **If useQuoteIds** (all three ids from quote):
   - Verify opportunity exists and `opp.primary_contact_id === contact_id_from_quote` and **`opp.customer_id === customer_id_from_quote`**.
   - Use those ids; backfill `customers.vertical_id` if null; run discount redemption check; then **update** opportunity (job_date, job_time_window, quote totals, metadata, etc.), no new Customer.

2. **Else** (no full quote triplet or mismatch):
   - If `contact_id_from_quote` provided and contact has `customer_id`: use that contact + customer.
   - Else: call **`resolve_or_create_contact_and_customer`** (Node `bookingResolver.ts`), which **creates Customer** if contact exists without one (or creates contact + customer).
   - Find or create opportunity (reuse recent "Quote Started" web_quote for this contact, or **insert** new opportunity with **customer_id**, primary_contact_id, etc.).
   - Ensure customer address location (`ensureCustomerAddressLocation`).
   - Create or reuse **job** (customer_id, primary_contact_id, opportunity_id, vertical_id, …).
   - Create **schedule** (job_id, slot, timezone, …).
   - Discount redemption insert (customer_id).
   - Integrity check (job/opportunity/schedule linkage).
   - Emit `booking_confirmed` (job); run workflows; return success with ids.

**Where Customer is created in confirm:** Only in the **else** branch, when not using quote ids and the resolver creates a new contact and/or **createAndLinkCustomer** (or when contact had no customer and resolver creates one). When **useQuoteIds** is true, Customer is **not** created in confirm; it was already created at quote-start.

---

## 2. Desired lifecycle (summary)

| Stage                    | Create Person (or Contact) | Create Opportunity | Create Customer |
|--------------------------|----------------------------|---------------------|------------------|
| Quote / inquiry          | Yes                        | Yes                 | **No**           |
| Booking / purchase / confirm | —                      | Update / keep       | **Yes** (+ customer_persons, Job, Schedule) |

---

## 3. Recommended revised flow (step-by-step)

### 3.1 Quote start (revised)

- **Create/find Contact** (unchanged for legacy compatibility; if/when migrating to persons, create/find **Person** and optionally link Contact to Person).
- **Do not** call `ensureCustomerForContact`. Do **not** create or require Customer.
- **Create/update Opportunity** with:
  - `primary_contact_id` = contactId.
  - **customer_id** = **null** (or make opportunity allow null customer_id and set it null for quote stage).
- **Response:** Return `contact_id`, `opportunity_id`, `quote_output`. **Do not** return `customer_id` (or return null).
- **Clients:** Stop storing `alloy_customer_id` from quote (or store null). Keep `alloy_contact_id`, `alloy_opportunity_id`.

### 3.2 Payment step (Stripe SetupIntent) — when Customer is first needed

Customer is required for Stripe (SetupIntent, payments table, `customers.stripe_customer_id`). So Customer must exist **by the time** we run SetupIntent. Two options:

- **Option A — Create Customer at payment step:** When the user enters the payment step, call an API that “ensures” Customer for the current contact/opportunity (create if missing, link contact, set `customers.primary_contact_id`, and optionally create `customer_persons` if using persons). Then call SetupIntent with the returned `customer_id`. So Customer is created at “payment step”, not at quote.
- **Option B — Create Customer at start of confirm:** Create Customer at the beginning of `POST /api/book-v2/confirm` (before creating job/schedule), then run the rest of confirm (and do payment/Stripe after confirm if needed). Then SetupIntent would need to be called **after** confirm, or confirm would need to run before the payment step (flow change). This is a bigger UX/flow change.

**Recommendation:** Prefer **Option A**: create Customer when we first need it for payment (e.g. when front-end requests SetupIntent). So:
- Backend **SetupIntent** (or a small “ensure-booking-identity” API called before it): when `contact_id` is provided and contact has **no** `customer_id`, **create** Customer and link (and optionally create customer_persons from contact/person); then return `customer_id` and proceed with SetupIntent. No more 400 for `contact_no_customer` in that case.

### 3.3 Booking confirm (revised)

- **useQuoteIds:** Require only `opportunity_id` and `contact_id` from quote. **Do not** require `customer_id` from quote.
  - Load opportunity; verify `opp.primary_contact_id === contact_id_from_quote` (and optionally that opportunity is still “Quote Started” / open).
  - **Resolve Customer:** If contact already has `customer_id` (e.g. created at payment step), use it. Else **create Customer** here and link to contact (and create customer_persons if applicable).
  - Set `customerId`; **update opportunity** with `customer_id` (and job_date, quote totals, etc.).
  - Ensure customer address location; create Job (with customer_id), Schedule; discount redemption; workflows; return success.
- **Else branch** (no quote ids): Unchanged: resolve/create contact and customer via `resolve_or_create_contact_and_customer`, then find/create opportunity, job, schedule.

---

## 4. Exact files / routes / functions to change

### 4.1 Quote-start: stop creating Customer

| File | Change |
|------|--------|
| `web/app/api/book-v2/quote-start/route.ts` | Remove the call to `ensureCustomerForContact`. Do not set `customerId` from it. When creating/updating **opportunity**, set **customer_id to null** (requires schema if currently NOT NULL). Return `contact_id`, `opportunity_id`, `quote_output`; do **not** return `customer_id` (or return null). |

**Opportunity schema:** Confirm whether `opportunities.customer_id` is NOT NULL. If it is, add a migration to allow NULL (so quote-stage opportunities can have null customer_id).

### 4.2 Quote-start: opportunity insert/update with null customer_id

| File | Change |
|------|--------|
| `web/app/api/book-v2/quote-start/route.ts` | In the “reuse existing opportunity” path: update metadata/estimated_price_cents without requiring customer_id. In the “create new opportunity” path: set `customer_id: null` in `oppInsertPayload` (and rely on schema allowing null). |

### 4.3 Clients: stop expecting customer_id from quote

| File | Change |
|------|--------|
| `web/components/cleaning/CleaningQuickQuoteForm.tsx` | Do not store `data.customer_id` in localStorage (or store only if present). |
| `web/app/book-v2/BookV2Client.tsx` | Same: do not set `alloy_customer_id` from quote-start response (or set only when present). In confirm submit, **do not** send `customer_id` from quote (send only `contact_id` and `opportunity_id`). |

### 4.4 Confirm: allow quote path without customer_id; create Customer when missing

| File | Change |
|------|--------|
| `web/app/api/book-v2/confirm/route.ts` | **useQuoteIds:** Change to require only `opportunity_id` and `contact_id` (not `customer_id`). Verify opportunity by `primary_contact_id` only; if opportunity has `customer_id` use it; else **ensure Customer** for this contact (create + link, and customer_persons if applicable), then set `customerId`. Update opportunity with `customer_id` when it was null. Rest of confirm unchanged (location, job, schedule, discount, workflows). |

### 4.5 Payment step: create Customer when contact has none (Option A)

| File | Change |
|------|--------|
| `backend/app/supabase_client.py` | In `resolve_or_create_contact_and_customer`, when **quote shortcut** is used (contact_id provided, contact exists) and contact has **no** customer_id: instead of returning `contact_no_customer`, call the same “create customer and link” logic (e.g. `ensure_customer_for_contact`) and return the new customer_id. So first use of contact at payment step creates Customer. |
| `backend/app/routes/stripe.py` | Remove or relax the check that returns 400 for `resolution_path == "contact_no_customer"` when you implement the above (or keep a fallback 400 only if create fails). |

### 4.6 Optional: Person at quote

If the product direction is to create **Person** at quote (not Contact):

| File | Change |
|------|--------|
| `web/app/api/book-v2/quote-start/route.ts` | After ensuring contact (or instead of contact), **create or find Person** (e.g. by email/phone); link Contact to Person if using both. Create **Opportunity** with a person/contact reference. Do not create Customer. |
| Schema / docs | Document that Opportunity at quote stage references Person/Contact only; Customer is created at booking/payment. |

(Exact table names and FKs depend on whether opportunities reference `person_id` or only `primary_contact_id` today; current code uses `primary_contact_id` only.)

### 4.7 customer_persons link

| File | Change |
|------|--------|
| `web/app/api/book-v2/confirm/route.ts` (and any “ensure Customer” helper) | When creating a **new** Customer from a contact (in confirm or in backend payment path), create a **customer_persons** row linking the customer to the person (if person_id is available from contact) with the appropriate role. If the codebase still uses only contacts, link customer to contact via existing fields (primary_contact_id / contact.customer_id); add customer_persons when person_id is present. |

---

## 5. Dependencies and risks

### 5.1 Schema

- **opportunities.customer_id:** If NOT NULL, any “quote only” opportunity must either store a placeholder or the column must be made nullable. Making it nullable is the cleanest for “quote has no customer yet”.
- **discount_redemptions / payments / customer_subscriptions:** All key off `customer_id`; they are used **after** Customer exists (at confirm or payment), so no change needed as long as Customer is created before discount redemption and payment creation.

### 5.2 Stripe

- **SetupIntent** currently requires a Supabase customer (for `customers.stripe_customer_id` and payment method storage). If Customer is created at payment step (Option A), ensure the “ensure customer” logic runs before or inside the SetupIntent handler so that `contact_no_customer` becomes “create customer, then proceed”.
- **Charges / PaymentIntents** use job and customer; they run after confirm/job creation, so Customer will exist.

### 5.3 Workflows

- **quote_started:** Payload currently includes opportunity (which today has customer_id). After change, opportunity may have null customer_id; workflows should not assume opportunity.customer_id is set at quote stage.
- **booking_confirmed:** Runs after confirm; by then Customer and job/schedule exist. No change needed if Customer is ensured in confirm.

### 5.4 Jobs and schedules

- **jobs.customer_id** and **schedules** (via job) require a customer. Creation happens in confirm **after** Customer is resolved/created, so no risk if confirm ensures Customer before creating the job.

### 5.5 Front-end and localStorage

- Any UI that assumes `alloy_customer_id` is always set after quote (e.g. payment step) must be updated to get customer_id only after it’s created (e.g. from a “prepare payment” or SetupIntent response that returns Supabase customer_id when created on the fly).

### 5.6 Backend Python vs Node

- **Node** `bookingResolver.resolve_or_create_contact_and_customer` already creates Customer when contact exists but has no customer (createAndLinkCustomer). So confirm’s “else” branch can keep using it.
- **Python** `resolve_or_create_contact_and_customer` currently returns `contact_no_customer` without creating; that path must be changed to create Customer when contact_id is provided but contact has no customer (to support Option A for payment).

---

## 6. One pass vs split

**Recommendation: split into two passes.**

**Pass 1 — Minimal, low-risk**
- Make **quote-start** stop creating Customer (remove `ensureCustomerForContact`; set opportunity.customer_id to null if schema allows, else keep a placeholder/dummy and document tech debt).
- Make **confirm** support “quote without customer_id”: when opportunity_id + contact_id are present but customer_id is missing, **ensure Customer** in confirm (create + link, then set on opportunity) and proceed. So quote-only users who go straight to confirm (e.g. no payment step) still get a Customer at confirm.
- **Payment step:** In Python, when contact_id is provided and contact has no customer, **create Customer** and return it (no more 400 for `contact_no_customer`). So users who hit payment step get Customer created there.
- **Clients:** Stop sending customer_id from quote in confirm when not present; optionally stop storing alloy_customer_id from quote.

**Pass 2 — Schema and Person (optional)**
- Migration: allow **opportunities.customer_id** NULL if not already.
- If desired: introduce **Person** at quote (create/find person, link to contact or replace contact in new flows); add **customer_persons** when creating Customer at confirm/payment.

Splitting allows the lifecycle fix (Customer at booking/payment, not at quote) to ship first, with minimal schema and no Person migration, then add schema and Person in a second pass.

---

## 7. Summary table

| Item | Current | Recommended |
|------|--------|-------------|
| **Person** | Not created in quote flow | Optional: create/find at quote (Pass 2). |
| **Contact** | Created/found at quote-start | Unchanged (or phased out with Person). |
| **Customer** | Created at quote-start in `ensureCustomerForContact` | **Not** at quote; created at payment step (Option A) or at start of confirm. |
| **Opportunity** | Created at quote-start with non-null customer_id | Created at quote-start with **customer_id null**; set customer_id when Customer is created (confirm or payment). |
| **Job / Schedule** | Created in confirm | Unchanged; created in confirm after Customer is ensured. |
| **Stripe SetupIntent** | Requires existing customer_id | Create Customer when contact has none (same request or prior “ensure” call). |
| **Confirm useQuoteIds** | Requires opportunity_id + contact_id + customer_id | Require opportunity_id + contact_id; resolve/create Customer in confirm when missing. |

This audit is intended to be implemented in the order and split described above, with no redesign of checkout/payments/jobs/schedules beyond what’s needed to delay Customer creation.
