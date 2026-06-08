# Alloy Booking + Workflows + Messaging — Current State Audit

**Focus:** Cleaning booking flow (`/services/cleaning` modal + `/book-v2`).  
**Date:** Snapshot for prioritization and launch readiness.

---

## Executive Summary

- **Quote → Refine → Slot → Confirm → Job/Schedule** is implemented end-to-end: `CleaningQuickQuoteForm` / BookV2Client → `quote-start` → `quote-refine` → `availability` → Stripe setup-intent (backend) → `confirm` → Supabase writes (contacts, customers, opportunities, jobs, schedules, discount_redemptions).
- **Customer `vertical_id`** is set/backfilled only at **confirm** (via `bookingResolver` or backfill when reusing quote IDs). **quote-start** creates customers **without** `vertical_id`; those stay null until confirm.
- **Jobs** now get `is_recurring`, `service_key`, `estimated_total_cents` (first clean), `recurring_total_cents` from confirm when `first_clean_price` / `recurring_price` are sent.
- **Workflows:** After confirm, all enabled `workflows` with `event_type = 'booking_confirmed'` and `entity_type = 'job'` are run via `executeWorkflowRun`; action `create_message` inserts into **`messages`** (status `queued`). No separate `queued_messages` table.
- **Messaging:** Backend `POST /messages/process` (cron, `x-cron-token`) reads `messages` where `status=queued`, `channel=sms`, sends via **Twilio**, updates status. **Twilio is blocked by verification** (trial/from-number restrictions); production SMS requires verified numbers or upgraded account.
- **Pricing:** Quote uses RPC **`get_quote_pricing`**; add-ons from **`addon_types`** + **`pricing_addons`** (quote-refine); labels/discounts from **`pricing_frequencies`** (optional; 500 if addon queries fail).
- **Availability** is MVP: hardcoded hours, 30-day window, conflict check against `schedules`; no calendar or resource-level rules.
- **Stripe:** SetupIntent is created by **backend** `POST /stripe/setup-intent`; webhook `setup_intent.succeeded` updates Supabase customer (payment method). Book-v2 confirm does **not** charge; it only records the booking.
- **Two resolver paths:** (1) **Next.js** `web/lib/bookingResolver.ts` used by **confirm** when not reusing quote IDs; (2) **Backend** Python `resolve_or_create_contact_and_customer` used by **setup-intent**. Both can create contacts/customers; backend path does not set `vertical_id` on customer.
- **Risks:** quote-start customer without `vertical_id` until confirm; backend setup-intent path never sets customer `vertical_id`; slot conflicts are best-effort (race between availability and confirm); workflow failures don’t fail the booking (logged only).

---

## A) System Map — Full Booking Flow

### UI → API → Supabase (arrows = data flow)

- **Services page + modal**
  - `/services/cleaning` (`web/app/services/cleaning/page.tsx`) → **Get a Quote** → `useQuoteModal()` → `QuoteModal` (`web/components/QuoteModal.tsx`) → **CleaningQuickQuoteForm** (`web/components/cleaning/CleaningQuickQuoteForm.tsx`).
  - **CleaningQuickQuoteForm** submit → `POST /api/book-v2/quote-start` (Next.js).
- **quote-start** (`web/app/api/book-v2/quote-start/route.ts`)
  - Reads: `verticals` (slug `cleaning`), `contacts` (by email/phone), `pipelines`, `pipeline_stages` (“Quote Started”).
  - Writes: **contacts** (insert or update), **customers** (insert if missing; **no `vertical_id`**), **opportunities** (insert or update with `vertical_id`, `metadata.quote_input` / `quote_output`, `source: web_quote`).
  - Returns: `contact_id`, `customer_id`, `opportunity_id`, `quote_output`. Client stores in localStorage and (optionally) redirects to `/book-v2`.
- **Book-v2 flow** (`web/app/book-v2/BookV2Client.tsx`)
  - **Quote start (inline):** Same `POST /api/book-v2/quote-start` if user starts from book-v2 without existing quote; stores IDs and quote in state + localStorage/sessionStorage.
  - **Refine step:** `POST /api/book-v2/quote-refine` with `square_footage`, `cleaning_frequency`, `add_ons`, `opportunity_id`, etc. → response `quote_output`, `available_addons`, `available_frequencies`; opportunity metadata updated.
  - **Slot step:** `GET /api/book-v2/availability?timezone=...` → SlotPicker; user picks slot.
  - **Service details + payment:** User fills address, etc.; payment step calls **backend** `POST /stripe/setup-intent` → Stripe `confirmCardSetup` on client → then **confirm**.
- **Backend setup-intent** (`backend/app/routes/stripe.py`, `create_setup_intent`)
  - Uses Python **supabase_client** `resolve_or_create_contact_and_customer` (different from Next.js resolver). Writes **contacts**, **customers** (and Stripe customer); **does not set `customers.vertical_id`**.
  - Stripe webhook **setup_intent.succeeded** → updates Supabase **customers** (`stripe_customer_id`, `default_payment_method_id`, `payment_method_brand`, `payment_method_last4`, etc.) by matching metadata (phone/email/ghl_contact_id).
- **confirm** (`web/app/api/book-v2/confirm/route.ts`)
  - **With quote IDs:** Validates opportunity/contact/customer match; backfills **customers.vertical_id** if null; then continues to job/schedule.
  - **Without quote IDs:** Fetches vertical (cleaning) → **resolve_or_create_contact_and_customer** (Next.js `web/lib/bookingResolver.ts`) with **`vertical_id`** → contact + customer (create or reuse); **customers.vertical_id** set on create and backfilled if null.
  - Writes/updates: **opportunities** (stage, job_date, job_time_window, metadata, discount fields), **jobs** (create or update: `vertical_id`, `is_recurring`, `service_key`, `service_frequency_key`, `estimated_total_cents`, `recurring_total_cents`, metadata), **schedules** (create or update: `job_id`, `start_at`, `end_at`, `timezone`, `duration_minutes`, metadata), **discount_redemptions** (if discount used).
  - Then: **Step 10** — loads **workflows** where `enabled=true`, `event_type='booking_confirmed'`, `entity_type='job'`; for each, **executeWorkflowRun** (job, schedule, contact, customer, opportunity payload).
- **executeWorkflowRun** (`web/lib/workflowRun.ts`)
  - Inserts **workflow_runs**; evaluates **workflow_conditions**; for each **workflow_actions** (e.g. `create_message`, `update_entity`, `log`) runs action.
  - **create_message:** Inserts **messages** (`channel`, `to_value`, `body`, `status: 'queued'`, `workflow_run_id`, contact/customer/job/opportunity ids). No `queued_messages` table.
- **Message sending**
  - Backend **POST /messages/process** (`backend/app/routes/messages_sender.py`) — secured by `x-cron-token` = `INTERNAL_CRON_TOKEN` — calls **process_queued_messages** (`backend/app/services/message_sender.py`).
  - Reads **messages** where `status=queued`, `direction=outbound`, `channel=sms`, `sent_at` null; sends via **Twilio**; updates **messages** (`status=sent`/`failed`, `sent_at`, `provider`, `provider_message_id`, `error`).

### Tables written (by route)

| Route / step        | Tables written (and key fields) |
|---------------------|----------------------------------|
| **quote-start**     | **contacts** (insert/update); **customers** (insert — no vertical_id); **opportunities** (insert/update: vertical_id, primary_contact_id, customer_id, metadata.quote_input/quote_output, estimated_price_cents, monetary_value_cents) |
| **quote-refine**    | **opportunities** (metadata.quote_input, metadata.quote_output, estimated_price_cents, monetary_value_cents) |
| **confirm**         | **customers** (vertical_id backfill when reuse quote); **opportunities** (update); **jobs** (insert/update: vertical_id, is_recurring, service_key, estimated_total_cents, recurring_total_cents, metadata); **schedules** (insert/update); **discount_redemptions** (insert when discount); **workflow_runs** (insert); **messages** (insert by create_message action) |
| **Backend setup-intent** | **contacts**, **customers** (Python resolver — no vertical_id); Stripe customer linked to Supabase customer in webhook |
| **Stripe webhook**  | **customers** (stripe_customer_id, default_payment_method_id, payment_method_*) |
| **Backend /messages/process** | **messages** (update status, sent_at, provider, error) |

---

## B) Core Modules Inventory

| Module | Role | Key functions / behavior |
|--------|------|---------------------------|
| **BookV2Client.tsx** | Single-page booking: quote start, refine, slot, service details, payment, confirm. | `handlePaymentSubmit`: setup-intent (backend) → confirmCardSetup → POST confirm. State: quote, selectedAddonKeys, availableAddons, availableFrequencies, refineFrequency. Persists quote + IDs to localStorage/sessionStorage. |
| **quote-start/route.ts** | Create/update contact + customer + opportunity; initial quote. | `computeQuote` via RPC `get_quote_pricing`; dedupes opportunity by contact + “Quote Started” stage; no customer.vertical_id on insert. |
| **quote-refine/route.ts** | Re-quote with frequency/add-ons; update opportunity metadata. | `resolveVerticalId`; `loadCleaningAddonsFromDb` (addon_types + pricing_addons); `loadPricingFrequencies` (optional); `computeQuote`; returns available_addons, available_frequencies; 500 if addon queries fail. |
| **confirm/route.ts** | Create/update opportunity, job, schedule; run booking_confirmed workflows. | Normalize frequency → service_frequency_key; resolve contact/customer (with vertical_id) or reuse quote IDs; job payload: is_recurring, service_key, estimated_total_cents, recurring_total_cents; Step 10: workflows → executeWorkflowRun. |
| **availability/route.ts** | Return bookable slots. | Hardcoded hours (Mon–Fri 9–17, Sat 10–14); 30 days; 120 min slots; conflict check vs schedules (buffer 30 min). |
| **bookingResolver.ts** | Next.js: resolve or create contact + customer; set/backfill vertical_id. | `resolve_or_create_contact_and_customer` (vertical_id param); `createAndLinkCustomer` sets customer.vertical_id on insert; backfills customer.vertical_id if null after resolve. |
| **workflowRun.ts** | Execute one workflow. | Inserts workflow_runs; evaluates workflow_conditions; runs workflow_actions: create_message → messages insert (queued), update_entity → Supabase update, log. |
| **Pricing** | Quote and add-on pricing. | RPC `get_quote_pricing` (quote-start, quote-refine); addon_types + pricing_addons by vertical_id (quote-refine); pricing_frequencies for labels (optional). |

---

## C) Deliverables

### 1) System Map (bullet list with arrows)

- **QuoteModal** (Get a Quote) → **CleaningQuickQuoteForm** → **POST /api/book-v2/quote-start** → **contacts**, **customers** (no vertical_id), **opportunities**.
- **BookV2Client** (refine) → **POST /api/book-v2/quote-refine** → **opportunities** (metadata), returns available_addons + available_frequencies.
- **BookV2Client** (slot) → **GET /api/book-v2/availability** → slots (no DB write).
- **BookV2Client** (payment) → **POST backend /stripe/setup-intent** → **contacts**, **customers** (Python; no vertical_id) → Stripe → **confirmCardSetup** → **POST /api/book-v2/confirm**.
- **confirm** → **bookingResolver** (if no quote IDs) or backfill **customers.vertical_id** (if quote IDs) → **opportunities**, **jobs**, **schedules**, **discount_redemptions** → **workflows** (booking_confirmed) → **executeWorkflowRun** → **workflow_runs**, **messages** (queued).
- **Cron** → **POST backend /messages/process** → read **messages** (queued, sms) → Twilio send → update **messages** (sent/failed).

### 2) What works now

- [x] Quote from `/services/cleaning` modal (CleaningQuickQuoteForm → quote-start) and from `/book-v2` inline quote start.
- [x] Refine quote (frequency + add-ons) with DB addon pricing and optional pricing_frequencies labels; opportunity metadata and estimated_price_cents updated.
- [x] Slot selection from availability API with schedule conflict filtering.
- [x] Service details step and payment step (Stripe SetupIntent via backend; confirmCardSetup on client).
- [x] Confirm creates/updates opportunity, job, schedule; idempotent by booking_attempt_id.
- [x] Jobs get is_recurring, service_key, estimated_total_cents (first clean), recurring_total_cents when client sends first_clean_price/recurring_price.
- [x] Customer vertical_id set/backfilled at confirm (Next.js path and quote-ID reuse path).
- [x] booking_confirmed workflows run after confirm; create_message inserts into messages (queued).
- [x] Workflow conditions and actions (create_message, update_entity, log) execute; workflow_runs recorded.
- [x] Backend /messages/process reads queued SMS from messages and sends via Twilio (when Twilio configured and not blocked).
- [x] Integrity check after confirm (schedule → job → opportunity linkage).
- [x] Discount redemption recorded; one redemption per customer per code enforced.

### 3) Known gaps

- [ ] **quote-start** does not set **customers.vertical_id** when creating a customer; only confirm does (or backend never does).
- [ ] **Backend** setup-intent path (Python **resolve_or_create_contact_and_customer**) does not set or backfill **customers.vertical_id**.
- [ ] **pricing_frequencies** is optional in quote-refine (warning on failure, empty list); if table has no **vertical_id** column, query may error and labels fall back to hardcoded.
- [ ] **Availability** is MVP only: hardcoded hours, no calendar integration, no resource/contractor assignment; race between GET availability and POST confirm (double-book possible under load).
- [ ] **Twilio**: Sending blocked by verification (trial/from-number); production SMS needs verified numbers or upgraded account.
- [ ] No cron or scheduler wired in repo for **POST /messages/process**; must be triggered externally (e.g. Render cron, Vercel cron to backend).
- [ ] **Stripe webhook** and **backend setup-intent** use Python Supabase resolver; duplicate logic and no vertical_id vs Next.js resolver.
- [ ] **create_message** workflow action writes to **messages** with template rendering; channel filter in sender is **sms** only (email queued but not sent by current sender).

### 4) High-risk areas (top 5)

1. **Customer vertical_id inconsistency**  
   Customers created in **quote-start** or by **backend setup-intent** have **null vertical_id** until they go through Next.js confirm. Any reporting or segmentation by vertical will miss or misattribute these until confirm.

2. **Slot double-booking race**  
   **GET /api/book-v2/availability** returns slots by reading existing schedules; **confirm** inserts a new schedule without a unique constraint on (start_at, end_at) or a lock. Two users confirming the same slot concurrently can both succeed.

3. **Two contact/customer resolvers**  
   Next.js **bookingResolver** (confirm) and Python **resolve_or_create_contact_and_customer** (setup-intent, webhook) can both create contacts/customers. Deduplication rules (email/phone) must stay in sync; Python path never sets vertical_id.

4. **Workflow failure visibility**  
   If **executeWorkflowRun** throws (e.g. create_message insert fails), the error is caught and logged in confirm; booking still returns 200. Admins may not notice failed workflow runs or stuck queued messages.

5. **Twilio / messaging dependency**  
   Booking confirmation SMS depends on Twilio (verification, env vars) and on **/messages/process** being called (external cron). If either is missing, messages stay queued with no in-app alert.

### 5) Next 10 tasks (ordered by impact + dependency)

1. **Set customers.vertical_id in quote-start** when creating a customer (resolve vertical by slug "cleaning" and pass to insert). File: `web/app/api/book-v2/quote-start/route.ts` (customer insert block).
2. **Backfill customers.vertical_id in backend** Python resolver or in setup-intent after resolve (lookup opportunity by contact or pass vertical_id from client). Files: `backend/app/supabase_client.py` or `backend/app/routes/stripe.py`.
3. **Reduce slot double-book risk:** Add unique constraint or advisory lock around (start_at, end_at) for schedules, or “reserve slot” step before confirm; update availability to respect reservation. Files: `web/app/api/book-v2/confirm/route.ts`, `web/app/api/book-v2/availability/route.ts`.
4. **Wire cron for message processing:** Document and/or add a single cron entry (e.g. every 1–2 min) calling `POST <backend>/messages/process` with `x-cron-token`. Repo: docs or backend README.
5. **pricing_frequencies schema:** Confirm table has **vertical_id** (or adjust quote-refine to query without it). File: `web/app/api/book-v2/quote-refine/route.ts` (`loadPricingFrequencies`).
6. **Alert on workflow run failure:** When executeWorkflowRun returns ok:false in confirm, log with a distinct level or write to an admin/alert table so ops can see failed booking_confirmed runs.
7. **Admin view for queued/failed messages:** List **messages** with status queued/failed and last updated so support can see stuck or failed SMS. (Admin already has workflows/jobs; add messages or a “Messaging” section.)
8. **Document Stripe webhook URL and events:** Ensure setup_intent.succeeded (and optionally payment_intent) are configured and endpoint is stable (backend URL + secret).
9. **Email channel in message sender:** Extend backend **process_queued_messages** (or add email sender) for `channel=email` so workflow-created email messages are sent; or document that only SMS is supported for now.
10. **Availability: configurable hours and lead time:** Move working hours and minimum lead time from hardcoded constants to config (env or DB) so ops can change without deploy. File: `web/app/api/book-v2/availability/route.ts`.

---

## Launch Readiness Checklist

### Must-have before going live

- [ ] **Customer vertical_id** set for all booking-created customers (quote-start + confirm + backend path).
- [ ] **Slot conflicts** mitigated (constraint, lock, or reserve-before-confirm) to avoid double-booking.
- [ ] **Cron** for **POST /messages/process** configured and running so queued SMS are sent.
- [ ] **Twilio** production-ready (verified numbers or upgraded account) so confirmation SMS can be delivered.
- [ ] **Stripe webhook** and **setup-intent** flow tested (card saved, customer updated in Supabase).
- [ ] **Integrity check** after confirm remains (schedule → job → opportunity); no silent failures in confirm response.

### Post-launch nice-to-have

- [ ] Alert or admin view for failed workflow runs and queued/failed messages.
- [ ] Single resolver strategy (e.g. call Next.js API from backend for contact/customer, or align Python resolver with vertical_id and dedupe rules).
- [ ] Availability: configurable hours, lead time, and (later) calendar/resource-aware slots.
- [ ] Email channel for workflow messages (if product needs email confirmations).
- [ ] Admin “Messaging” tab for messages table (queued/sent/failed).

---

## 1–2 Page Summary (Notion paste)

**What’s complete and working**
- Cleaning quote from `/services/cleaning` (QuoteModal → CleaningQuickQuoteForm) and `/book-v2` (inline) → `POST /api/book-v2/quote-start` → contacts, customers, opportunities (with quote in metadata).
- Refine (frequency + add-ons) → `POST /api/book-v2/quote-refine` → addon_types + pricing_addons + optional pricing_frequencies; opportunity metadata updated.
- Slot picker → `GET /api/book-v2/availability` (hardcoded hours, conflict check vs schedules).
- Payment: backend `POST /stripe/setup-intent` → Stripe confirmCardSetup → `POST /api/book-v2/confirm` → opportunity, job, schedule, discount_redemption; customer.vertical_id set/backfilled at confirm (Next.js path).
- Jobs get is_recurring, service_key, estimated_total_cents, recurring_total_cents when client sends first_clean_price/recurring_price.
- After confirm, all enabled `booking_confirmed` (entity job) workflows run; `create_message` inserts into `messages` (status=queued). Backend `POST /messages/process` sends queued SMS via Twilio (Twilio currently blocked by verification).

**Partial / missing**
- quote-start and backend setup-intent do not set customers.vertical_id (only confirm does).
- pricing_frequencies optional; if table lacks vertical_id, query can fail and labels fall back.
- Availability is MVP (no calendar, no reserve-before-confirm); possible double-book under concurrency.
- No in-repo cron for /messages/process; Twilio trial/verification blocks SMS to unverified numbers.
- Two resolvers (Next.js + Python); Python path never sets vertical_id.

**High-risk**
1. Customer vertical_id null until confirm (quote-start + backend path).  
2. Slot race: two users can confirm same slot.  
3. Two resolvers with different behavior (vertical_id, dedupe).  
4. Workflow failures only logged; booking still 200.  
5. SMS depends on Twilio + external cron; no in-app alert if messages stuck.

**Must-have before launch**
- Set/backfill customers.vertical_id in quote-start and backend path.  
- Mitigate slot double-book (constraint, lock, or reserve step).  
- Cron for /messages/process; Twilio production-ready.  
- Stripe webhook + setup-intent tested.

**Next 10 (impact order)**
1. Set customer.vertical_id in quote-start.  
2. Backend customer.vertical_id in setup-intent/resolver.  
3. Slot conflict mitigation (constraint or reserve).  
4. Wire cron for /messages/process.  
5. Confirm pricing_frequencies schema (vertical_id).  
6. Alert or log workflow run failures visibly.  
7. Admin view for queued/failed messages.  
8. Document Stripe webhook URL and events.  
9. Email channel or document SMS-only.  
10. Availability: configurable hours/lead time.

---

*End of audit. All references are to the current codebase (file paths and function names) as of the audit date.*
