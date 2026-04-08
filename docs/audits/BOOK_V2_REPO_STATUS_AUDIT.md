# Book-v2 Repo Status Audit

**Scope:** Web + API booking flow (`/book-v2`, `web/app/api/book-v2/**`, `web/lib/bookingResolver.ts`, confirm→workflows).  
**Purpose:** Concise “what works,” known issues, risks, and test plan.

---

## 1) What works end-to-end now

- **quote-start** — POST creates/updates contact; `ensureCustomerForContact` guarantees non-null `customer_id` (lookup by primary_contact_id / metadata email/phone, or create + link). Writes: contacts, customers (vertical_id, org_id, status=active, metadata), opportunities (quote_input/quote_output, source=web_quote). Service role client; SUPABASE_SERVICE_ROLE_KEY asserted + logged.
- **quote-refine** — POST with square_footage, frequency, add_ons, opportunity_id; add-on pricing from addon_types + pricing_addons (by vertical); frequencies/discount labels from pricing_frequencies. Updates opportunity metadata and estimated_price_cents. Service role client.
- **Slot selection** — GET /api/book-v2/availability returns slots (hardcoded hours, 30-day window, conflict check vs schedules). SlotPicker confirms slot; client stores selectedSlot.
- **Service details** — Address, city, home_type, bedrooms, bathrooms, access method/notes. Persisted in localStorage; sent in confirm payload; opportunity/job metadata include home_type.
- **Payment** — Backend POST /stripe/setup-intent → client confirmCardSetup → payment method saved; no charge at confirm.
- **confirm** — With quote IDs: validates opportunity/contact/customer match (409 QUOTE_ID_MISMATCH + CLEAR_QUOTE_AND_RESTART); backfills customer.vertical_id. Without quote IDs: bookingResolver (vertical_id). Writes: opportunities (stage, job_date, job_time_window, metadata), jobs (vertical_id, is_recurring, service_key, estimated_total_cents, recurring_total_cents, metadata), schedules, discount_redemptions. Idempotent by booking_attempt_id (opportunity, job, schedule reuse). Integrity check (schedule→job→opportunity). Step 10: booking_confirmed workflows → executeWorkflowRun → workflow_runs, messages (queued).
- **Add-ons pricing** — From DB (addon_types + pricing_addons by vertical_id) in quote-refine; returned in available_addons.
- **Frequencies/discount labels** — From pricing_frequencies in quote-refine; returned in available_frequencies.
- **Customer/contact/opportunity/job/schedule writes** — All use createServiceRoleClient in quote-start, quote-refine, confirm (no RLS blocking). bookingResolver used only in confirm “no quote IDs” path; sets/backfills vertical_id.
- **Stale quote recovery** — Client on 409 QUOTE_ID_MISMATCH: clearQuoteStorage(), message “We refreshed your quote…”, redirect to refine_quote.

---

## 2) Remaining known issues (from code scan)

| Issue | Where |
|-------|--------|
| **Availability uses createAdminClient** | `web/app/api/book-v2/availability/route.ts` L204 — schedule conflict read uses admin client. If RLS blocks anon reads on `schedules`, availability may 500 or return all slots. |
| **Backend setup-intent path does not set customer.vertical_id** | Backend `stripe.py` + Python resolver create contact/customer without vertical_id; only web confirm backfills when reusing quote IDs. |
| **pricing_frequencies optional** | `quote-refine/route.ts` — loadPricingFrequencies can fail; empty list fallback; frequency labels may be hardcoded. |
| **No unique constraint on schedule (start_at, end_at)** | confirm creates schedule; two concurrent confirms can double-book same slot. |
| **Workflow failures don’t fail booking** | `confirm/route.ts` L1024–1027 — executeWorkflowRun errors caught and logged; booking still returns 200. |
| **create_message channel** | workflowRun create_message inserts messages; backend /messages/process only sends `channel=sms` (email queued but not sent). |
| **NEXT_PUBLIC_API_BASE_URL / backend URL** | BookV2Client uses `process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"` for setup-intent; production must set correct backend URL. |

---

## 3) Top 10 risks/unknowns before production launch

1. **Data integrity — customer_id null** — Mitigated by ensureCustomerForContact and service role; remaining risk: customers table constraints or triggers rejecting insert (step logs + 500 JSON show step_failed).
2. **Duplicate contacts/customers** — Two resolvers (Next.js bookingResolver in confirm; Python in setup-intent). Dedupe by email/phone must stay in sync; Python path never sets vertical_id.
3. **ID mismatches / stale quote** — Confirm rejects mismatched opportunity/contact/customer with 409; client clears storage and goes to refine_quote. Risk: user re-submits old quote from another tab.
4. **RLS** — quote-start, quote-refine, confirm use service role (bypass RLS). **Availability** uses createAdminClient (service role in supabaseAdmin); if that’s the same key, OK; if ever switched to anon, schedule read could fail.
5. **Env vars** — Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (quote-start throws if missing). Backend: Stripe keys, Twilio, INTERNAL_CRON_TOKEN for /messages/process. NEXT_PUBLIC_API_BASE_URL for setup-intent from web.
6. **Stripe edge cases** — setup-intent created by backend; confirmCardSetup on client. Webhook setup_intent.succeeded updates Supabase customer. Risk: webhook delay/failure leaves customer without payment method metadata; retries can create multiple setup intents.
7. **Retries / idempotency** — Confirm is idempotent by booking_attempt_id (opportunity, job, schedule reused). Quote-start/refine are not explicitly idempotent (dedupe by contact + “Quote Started” within 10 min). Double submit on quote-start can create two opportunities.
8. **Slot double-book** — No advisory lock or reserve-before-confirm; race between GET availability and POST confirm.
9. **Discount redemption** — One per customer per code (uniq); 409 returned; client shows message. Risk: same code on two tabs / retries.
10. **Workflow / messaging** — executeWorkflowRun can throw; only logged. Queued messages require external cron to POST /messages/process; Twilio verification can block SMS.

---

## 4) Output summary

### Completed

- quote-start: service role, ensureCustomerForContact, vertical_id/org_id on customer, structured step logs, 500 with step_failed + error fields.
- quote-refine: service role, add-ons/frequencies from DB, opportunity metadata update.
- confirm: service role, QUOTE_ID_MISMATCH 409, idempotency by booking_attempt_id, integrity check, discount redemption, workflow run.
- Client: single-column layout, home_type in Service Details, QUOTE_ID_MISMATCH handling (clear storage, message, refine_quote), frequency buttons non-truncating, payment summary (this job total + scheduled time).
- No opportunity created with customer_id null (guard in quote-start + ensure helper).

### In progress / flaky

- **Availability schedule read** — `availability/route.ts` uses createAdminClient (not serverServiceClient). If env or RLS differs from other routes, could fail for unauthenticated users. **Recommendation:** Switch to createServiceRoleClient for consistency.
- **Backend customer.vertical_id** — Setup-intent path (Python) does not set vertical_id. **Location:** backend resolver / stripe.py.
- **pricing_frequencies** — Optional; schema (e.g. vertical_id) may not match. **Location:** quote-refine loadPricingFrequencies.
- **Workflow run failures** — Only logged; no alert or admin visibility. **Location:** confirm/route.ts around executeWorkflowRun.

### Missing

- **Slot double-book mitigation** — No unique constraint or reserve step. Recommend: DB unique (job_id, start_at, end_at) or short-lived “reserve” before confirm.
- **Cron for /messages/process** — Not wired in repo; must be configured externally (e.g. Vercel cron → backend).
- **Twilio production** — Verification/from-number limits; production SMS needs verified numbers or upgraded account.
- **Admin view for messages/workflow runs** — No UI for queued/failed messages or failed workflow runs.
- **Stripe webhook docs** — URL, events (setup_intent.succeeded), and secret not documented in repo.
- **Configurable availability** — Hours and lead time are hardcoded in availability/route.ts.

### Test plan

**Manual (happy path)**  
1. Incognito → /book-v2 → quote start (zip, sqft, frequency, email/phone) → 200, contact + customer + opportunity created.  
2. Refine quote (change frequency/add-ons) → 200, opportunity metadata and quote updated.  
3. Select slot → confirm time → fill service details (address, home type, bedrooms, bathrooms, access) → confirm details.  
4. Payment: enter card → Complete Booking → 200, schedule + job + opportunity updated; confirm screen shows.  
5. Same email/phone again (new incognito): quote-start reuses contact/customer; no duplicate.  
6. Trigger 409: e.g. delete opportunity in DB, keep localStorage IDs → confirm → 409 → client clears storage and shows “We refreshed your quote…”.

**Manual (edge)**  
- Discount: apply code at refine; confirm with discount_code_id → redemption row; same code again → 409 “already used.”  
- Double submit: confirm twice with same booking_attempt_id → second request reuses same job/schedule (idempotent).

**SQL checks**  
- `contacts.customer_id` not null for any contact used in a book-v2 opportunity.  
- `opportunities.customer_id` not null.  
- `customers.vertical_id` set for customers created via quote-start (cleaning vertical).  
- `jobs.metadata.home_type` present when service details included home_type.  
- `schedules` for a job_id: start_at/end_at/timezone consistent with confirm payload.  
- `discount_redemptions`: one row per (customer_id, discount_code_id) per booking.

**Env**  
- Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_API_BASE_URL (backend).  
- Backend: Stripe keys, webhook secret, Twilio (if SMS), INTERNAL_CRON_TOKEN for message processing.
