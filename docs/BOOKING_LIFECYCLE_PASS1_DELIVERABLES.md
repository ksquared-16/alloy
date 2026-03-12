# Booking Lifecycle Pass 1 — Deliverables

**Goal:** Stop creating Customer at quote-start. Create/use only Contact + Opportunity at quote. Ensure/create Customer only when first needed (payment or confirm), then continue the booking flow.

---

## 1. Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20250303130000_opportunities_customer_id_nullable.sql` | **New.** Allow `opportunities.customer_id` to be NULL (quote stage has no customer). |
| `web/app/api/book-v2/quote-start/route.ts` | Removed `ensureCustomerForContact` and all call sites. Opportunity created/updated with `customer_id: null`. Response no longer returns `customer_id`. Removed unused `customerId` variable. |
| `web/components/cleaning/CleaningQuickQuoteForm.tsx` | No longer store `alloy_customer_id` from quote-start response. |
| `web/app/book-v2/BookV2Client.tsx` | No longer store `customer_id` from quote-start in localStorage (three places: handleQuoteStartSubmit, maybeCreateLeadFromPrefill, payment-identity quote-start). Confirm still sends `customer_id` when present (e.g. from SetupIntent); optional. |
| `web/app/api/book-v2/confirm/route.ts` | **useQuoteIds** requires only `opportunity_id` + `contact_id`. Verify opp by `primary_contact_id` only; allow `opp.customer_id` null. When null, call `ensureCustomerForContactInConfirm` (create customer, link contact, create `customer_persons` if contact has `person_id`), then set `customer_id` on opportunity. Else branch: when `contact_id_from_quote` provided but contact has no customer, create via same helper instead of returning 400. Added helper `ensureCustomerForContactInConfirm`. |
| `backend/app/supabase_client.py` | When contact_id provided and contact exists but has **no** customer: create customer and link (same as ensure_customer_for_contact), return `(cid, new_cust_id, "quote_id_created_customer")`. Only return `contact_no_customer` if create fails. |
| `docs/BOOKING_LIFECYCLE_PASS1_DELIVERABLES.md` | This file. |

**Not changed:** `backend/app/routes/stripe.py` — still returns 400 when resolution_path is `contact_no_customer` (create failed). No change needed; when create succeeds we return `quote_id_created_customer` with supa_customer_id.

---

## 2. DB migration required

**Yes.** Run:

- `supabase/migrations/20250303130000_opportunities_customer_id_nullable.sql`

It runs:

- `ALTER TABLE public.opportunities ALTER COLUMN customer_id DROP NOT NULL;`
- Comment on `opportunities.customer_id`.

Apply with your usual migration process (e.g. `supabase db push` or your CI migration step).

---

## 3. Manual test checklist

- [ ] **Quote-start**
  - [ ] Submit quote form (CleaningQuickQuoteForm or BookV2 quote step). Response has `contact_id`, `opportunity_id`, `quote_output` and **no** `customer_id`.
  - [ ] In DB: new opportunity has `customer_id` **null** and `primary_contact_id` set. Contact exists; contact may or may not have `customer_id` (Pass 1 does not create customer at quote).
  - [ ] localStorage after quote: `alloy_contact_id` and `alloy_opportunity_id` set; `alloy_customer_id` not set (or not updated from quote).

- [ ] **Payment (Stripe SetupIntent)**
  - [ ] With a quote that has **no** customer yet: go to payment step, enter email/phone (matching quote contact). Call SetupIntent with `contact_id` from quote (no `customer_id`).
  - [ ] Backend creates customer for that contact and returns supa_customer_id; SetupIntent succeeds; Stripe customer created/linked.
  - [ ] Optional: confirm in DB that contact now has `customer_id` and customer exists.

- [ ] **Confirm with quote (opportunity_id + contact_id, no customer_id)**
  - [ ] Complete quote → slot → service details. Do **not** run SetupIntent (so no customer created at payment). Submit confirm with only `opportunity_id` and `contact_id` (no `customer_id` in body).
  - [ ] Confirm creates customer, links to contact, sets `opportunity.customer_id`, creates job/schedule. Response success; job and schedule exist with correct `customer_id`.
  - [ ] In DB: opportunity has `customer_id` set; contact has `customer_id`; customer has `primary_contact_id`; job/schedule reference that customer.

- [ ] **Confirm with quote (opportunity_id + contact_id + customer_id from SetupIntent)**
  - [ ] Same flow but run SetupIntent first so customer exists. Submit confirm with `opportunity_id`, `contact_id`, and `customer_id` (from localStorage after SetupIntent).
  - [ ] Confirm uses existing customer; does not create a second one; opportunity updated; job/schedule created as before.

- [ ] **customer_persons**
  - [ ] If contact has `person_id`: after confirm creates customer, check that a `customer_persons` row exists for that `customer_id` and `person_id` (and org_id). If your test contact has no person_id, this is N/A for Pass 1.

- [ ] **Regression**
  - [ ] Quote → payment (SetupIntent) → confirm: full flow still succeeds.
  - [ ] Discount redemption still enforced per customer when discount applied.
  - [ ] Existing flows that already had customer at quote (e.g. old localStorage with alloy_customer_id) still work when confirm is called with all three ids.

---

## 4. Risks / edge cases deferred to Pass 2

- **Person at quote:** Pass 1 does not create or link Person at quote; only Contact is used. Person creation at quote and any contact↔person linking is out of scope.
- **Workflows / quote_started:** Payload may include opportunity with `customer_id: null`. Any workflow that assumes `opportunity.customer_id` is set at quote_started may need to be updated or documented.
- **customer_persons role:** Pass 1 inserts `customer_persons` with only `customer_id`, `person_id`, `org_id` (no role). If your schema requires `role` or other columns, add them in a follow-up.
- **Idempotency:** Confirm is idempotent by booking_attempt_id for job/schedule. Customer creation is idempotent (reuse by primary_contact_id on conflict). No change to that behavior.
- **Backfill:** Existing opportunities created before this pass may have non-null `customer_id`; no backfill to set them to null. Only new quote-start opportunities get null until confirm/payment.
