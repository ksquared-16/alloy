# Book-v2 As-Built Snapshot

**Scope:** Web + API booking flow; last 10 commits touching book-v2.  
**Code refs:** `web/app/api/book-v2/*`, `web/app/book-v2/*`, backend `stripe.py` (setup-intent).

---

## 1) Files changed (last 10 commits, book-v2 related)

| Path |
|------|
| `web/app/api/book-v2/quote-start/route.ts` |
| `web/app/api/book-v2/quote-refine/route.ts` |
| `web/app/api/book-v2/confirm/route.ts` |
| `web/app/book-v2/BookV2Client.tsx` |
| `web/app/book-v2/ServiceDetailsForm.tsx` |
| `web/app/book-v2/ServiceDetailsSummary.tsx` |
| `web/lib/bookingResolver.ts` |
| `web/lib/supabase/serverServiceClient.ts` |
| `docs/audits/BOOK_V2_LAUNCH_AUDIT.md` |

**Note:** `web/app/api/book-v2/availability/route.ts` is unchanged in these commits; it is still part of the book-v2 flow and is audited below.

---

## 2) Route summary: inputs, outputs, DB tables, idempotency

### quote-start  
**Path:** `web/app/api/book-v2/quote-start/route.ts`  
**Method:** POST  

| Item | Detail |
|------|--------|
| **Inputs** | Body: `first_name`, `last_name`, `email`, `phone` (at least one of email/phone), `zip`, `square_footage`, `beds`, `baths`, `cleaning_frequency`, `vertical_id` (optional), `add_ons`, `quote_context`. Normalized: `normalizeEmail`, `normalizePhone` (E.164). |
| **Outputs** | 200: `{ ok: true, contact_id, customer_id, opportunity_id, quote_output }`. 400: missing email/phone. 500: vertical not found, ensureCustomer failed (body includes `step_failed`, `error: { code, message, details, hint }`). |
| **DB read** | `contacts` (by email/phone; cols include `org_id` with fallback if column missing), `verticals` (slug=cleaning), `organizations` (limit 1 for default org_id), `pipelines`, `pipeline_stages`, `opportunities` (dedupe), `customers` (ensureCustomer: primary_contact_id, metadata email/phone). |
| **DB write** | `contacts` (insert or update; optional `org_id`), `customers` (insert: name, vertical_id, primary_contact_id, status=active, org_id optional, metadata; or link existing), `pipeline_stages` (get-or-create "Quote Started"), `opportunities` (insert or update with metadata.quote_input/quote_output, source=web_quote). |
| **Idempotency** | Contact: dedupe by email then phone. Opportunity: reuse same contact + "Quote Started" stage + created_at within 10 min + metadata.source=web_quote; otherwise insert. No per-request idempotency key. |

---

### quote-refine  
**Path:** `web/app/api/book-v2/quote-refine/route.ts`  
**Method:** POST  

| Item | Detail |
|------|--------|
| **Inputs** | Body: `square_footage` (required), `cleaning_frequency`, `add_ons`, `opportunity_id`, `zip`, `vertical_id`. |
| **Outputs** | 200: `{ ok: true, quote_output, available_addons, available_frequencies }`. 400: missing square_footage. 500: addon/pricing load failure. |
| **DB read** | `verticals` (id or slug=cleaning), `addon_types` (vertical_id, is_active), `pricing_addons` (vertical_id, is_active), `pricing_frequencies` (vertical_id; optional, empty on error), RPC `get_quote_pricing`, `opportunities` (when opportunity_id provided). |
| **DB write** | `opportunities` (update metadata.quote_input, metadata.quote_output, estimated_price_cents, monetary_value_cents when opportunity_id provided). |
| **Idempotency** | None. Same opportunity_id + payload can overwrite metadata multiple times. |

---

### confirm  
**Path:** `web/app/api/book-v2/confirm/route.ts`  
**Method:** POST  

| Item | Detail |
|------|--------|
| **Inputs** | Body: `slot_start`, `slot_end`, `timezone`, `quote_subtotal`, `discount_amount`, `quote_total`, `discount_code_id`/`discount_code`, `contact_email`, `contact_phone`, `contact_first_name`, `contact_last_name`, `address`, `city`, `home_type`, `bedrooms`, `bathrooms`, `access_method`, `access_note`, `additional_notes`, `frequency_label`, `first_clean_price`, `recurring_price`, `quote_input`, `quote_output`, `booking_attempt_id`, `opportunity_id`, `contact_id`, `customer_id` (quote IDs optional). |
| **Outputs** | 200: `{ ok: true, contact_id, customer_id, opportunity_id, job_id, schedule_id, has_saved_payment_method, payment_method_brand, payment_method_last4, booking_attempt_id }`. 400: missing required fields / discount without code. 409: QUOTE_ID_MISMATCH or discount_already_used. 500: vertical/resolve/opportunity/job/schedule/integrity failure. |
| **DB read** | `opportunities`, `verticals`, `customers`, `discount_redemptions`, `pipelines`, `pipeline_stages`, `opportunities` (search by contact), `jobs` (by opportunity_id), `schedules` (by job_id), `customers` (payment method), `schedules` (integrity), `workflows`, `jobs`/`opportunities`/`contacts`/`customers` (workflow payload). |
| **DB write** | `customers` (vertical_id backfill), `opportunities` (update or insert: metadata includes home_type, job_date, job_time_window, etc.), `jobs` (update or insert: metadata includes home_type), `schedules` (update or insert), `discount_redemptions` (insert when discount used), `workflow_runs` / `messages` (via executeWorkflowRun). |
| **Idempotency** | Key: `booking_attempt_id`. Reuse opportunity if metadata.booking_attempt_id matches. Reuse job if metadata.booking_attempt_id matches. Reuse schedule if same job_id + start_at + end_at + timezone + metadata.booking_attempt_id. Discount: one redemption per customer per code (unique constraint). |

---

### availability  
**Path:** `web/app/api/book-v2/availability/route.ts`  
**Method:** GET  

| Item | Detail |
|------|--------|
| **Inputs** | Query: `timezone` (default America/Los_Angeles). |
| **Outputs** | 200: `{ ok: true, slots: [{ start, end, display, timeWindow, isoStart, isoEnd }], count, timezone }`. 500: generic error. |
| **DB read** | `schedules` (start_at, end_at in next 30 days) — used only to filter out conflicting slots. |
| **DB write** | None. |
| **Idempotency** | N/A (read-only). |

**Code:** L204 uses `createAdminClient()` for schedule fetch. L17–33: hardcoded working hours, 120 min slots, 30 min buffer, 48 hr lead time, 30 days.

---

### stripe/setup-intent (backend)  
**Path:** `backend/app/routes/stripe.py` — `POST /stripe/setup-intent` (L289), webhook `setup_intent.succeeded` (L496).  

| Item | Detail |
|------|--------|
| **Inputs** | Body: `phone`, `email` (required), `ghl_contact_id`, `booking_attempt_id` (optional). |
| **Outputs** | 200: `{ client_secret, supa_contact_id, supa_customer_id }`. 400: missing phone/email or resolve failed. 500: Stripe or internal error. |
| **DB (Supabase)** | Via Python `resolve_or_create_contact_and_customer`: reads/writes `contacts`, `customers` (Python resolver does **not** set `vertical_id`). After SetupIntent create: backend may update Supabase `customers` with `stripe_customer_id`, `setup_intent_id`, `booking_attempt_id`. Webhook `setup_intent.succeeded`: updates `customers` (payment method fields). |
| **Idempotency** | Resolve is by email/phone (create or reuse). Multiple calls same email/phone reuse same contact/customer; new SetupIntent each time. |

**Code refs:** L338–343 `resolve_or_create_contact_and_customer`; L406 `stripe.SetupIntent.create`; L426–436 Supabase customer link; L495+ webhook handler.

---

## 3) createAdminClient in book-v2 routes

| Route | Client | Location |
|-------|--------|----------|
| quote-start | createServiceRoleClient | `quote-start/route.ts` L347 |
| quote-refine | createServiceRoleClient | `quote-refine/route.ts` L293 |
| confirm | createServiceRoleClient | `confirm/route.ts` L169 |
| **availability** | **createAdminClient** | `availability/route.ts` L2, L204 |

**Recommendation:** Switch availability to **createServiceRoleClient** from `@/lib/supabase/serverServiceClient`.  
**Reason:** Same capability (supabaseAdmin uses SUPABASE_SERVICE_ROLE_KEY), but book-v2 stays consistent and uses the same URL fallback (SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL) and single place for service-role usage. If RLS were ever applied to anon, availability would still work with service role.

---

## 4) Schema assumptions that could break staging

| Assumption | Where | Risk |
|------------|--------|-----|
| **contacts.org_id** | quote-start: select `org_id`, insert when default org found; fallback retry without org_id if error message contains "org_id". | Column missing or typo: select/insert can fail or fallback; staging may not have `organizations` or `org_id`. |
| **customers.metadata** (JSONB) | quote-start ensureCustomerForContact: `.contains("metadata", { email })` / `{ phone }`. | Column or structure different: lookup by email/phone fails; create path still works. |
| **customers.vertical_id, status, primary_contact_id** | quote-start insert; confirm backfill. | Required columns; missing → insert/update fails. |
| **organizations** table | quote-start: default org_id for new contact and for customer when contact has no org_id. | Table missing: query error caught/ignored; org_id left null. |
| **verticals** (slug=cleaning, is_active) | quote-start, quote-refine, confirm. | No cleaning vertical or wrong slug → 500. |
| **pricing_frequencies.vertical_id** | quote-refine `loadPricingFrequencies`: `.eq("vertical_id", verticalId)`. | Column missing: query can 500; code treats as optional (catch, return []). L166–174. |
| **addon_types** (vertical_id, is_active, key, label, position) | quote-refine `loadCleaningAddonsFromDb`. | Missing or wrong schema → 500 (non-optional). L109–117. |
| **pricing_addons** (vertical_id, is_active, addon_key, addon_name, amount_cents, sort_order) | quote-refine. | Same as addon_types. L121–128. |
| **pipeline_stages** (pipeline_id, name, position, show_in_funnel, show_in_pie_chart) | quote-start getOrCreateStage; confirm getOrCreateBookedStage. | Missing pipeline or stage name mismatch → stage null; opportunity/job may still write. |
| **opportunities** (vertical_id, primary_contact_id, customer_id, pipeline_stage_id, metadata, org_id optional) | quote-start, confirm. | customer_id null guarded in quote-start; other columns missing → insert/update fails. |
| **jobs.metadata**, **schedules.metadata** | confirm (booking_attempt_id, home_type, etc.). | JSONB; extra keys are fine. |
| **discount_redemptions** (unique per customer_id + discount_code_id) | confirm. | Constraint name/columns differ → insert can 500 or allow duplicates. |

---

## 5) Launch checklist

### Env vars

**Vercel (Next.js)**  
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` — used by serverServiceClient (and supabaseAdmin).  
- `SUPABASE_SERVICE_ROLE_KEY` — required for quote-start (throws if missing); used by quote-start, quote-refine, confirm, and (if switched) availability.  
- `NEXT_PUBLIC_API_BASE_URL` — backend URL for Stripe setup-intent (BookV2Client L1096: `process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"`).

**Backend**  
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (webhook endpoint).  
- Supabase: same `SUPABASE_URL` and service-role (or equivalent) for Python resolver and webhook updates.  
- Twilio (if SMS): credentials; production may require verified numbers.  
- `INTERNAL_CRON_TOKEN` — for `POST /messages/process` (cron).

### Cron

- **Endpoint:** `POST <backend_base>/messages/process` with header `x-cron-token: <INTERNAL_CRON_TOKEN>`.  
- **Purpose:** Process `messages` rows (status=queued, channel=sms); send via Twilio; update status/sent_at.  
- **Suggested:** Every 1–2 minutes (e.g. Render/Vercel cron or external scheduler). Not wired inside repo.

### Logs to watch

- **quote-start:** `[QUOTE_START] using_service_role=true` (once per request). `[QUOTE_START] resolved_contact ...`. `[QUOTE_START] ensure_customer:lookup_existing|customer_insert|contact_update|contact_reselect`. On failure: `step_failed` in 500 JSON body.  
- **quote-refine:** `[QUOTE_REFINE] load add-ons failed` (500). `[QUOTE_REFINE] pricing_frequencies query failed (optional)` (warning only).  
- **confirm:** `[BOOK_V2_CONFIRM_START] ...`. `[BOOK_V2_CONFIRM_INTEGRITY_FAIL]` or `[BOOK_V2_CONFIRM_INTEGRITY_OK]`. `[BOOK_V2_CONFIRM_SUCCESS] ...`. `[BOOK_V2_CONFIRM_WORKFLOW]` / `[BOOK_V2_CONFIRM_WORKFLOW_ERROR]`.  
- **availability:** `[BOOK_V2_AVAILABILITY] Error fetching schedules` (continues without filtering).  
- **Backend:** `create_setup_intent: ...`, `stripe_webhook: setup_intent.succeeded|setup_intent.setup_failed`.

### 5 manual tests

1. **Happy path** — Incognito → /book-v2 → quote start (zip, sqft, frequency, email, phone) → Get quote → Refine (change frequency/add-ons) → Confirm quote → Pick slot → Confirm time → Service details (address, home type, bedrooms, bathrooms, access) → Confirm details → Enter card → Complete Booking. Expect 200 and confirmation screen; DB: contact, customer (vertical_id set), opportunity, job, schedule; job/schedule metadata include home_type.  
2. **Reuse contact** — Same email/phone in new incognito → quote start. Expect 200; same contact_id/customer_id reused; new opportunity or reuse within 10 min.  
3. **Stale quote (409)** — Complete quote start, then delete that opportunity (or change customer_id) in DB. Confirm booking with stored IDs. Expect 409 QUOTE_ID_MISMATCH; client clears storage and shows “We refreshed your quote…”; user on refine step.  
4. **Discount** — Apply discount at refine; complete booking. Expect 200 and one discount_redemption row. Same code same customer again → 409 discount_already_used.  
5. **Idempotent confirm** — Complete booking; copy booking_attempt_id from network; POST confirm again with same payload. Expect 200; same job_id and schedule_id (reuse); no duplicate schedule rows.
