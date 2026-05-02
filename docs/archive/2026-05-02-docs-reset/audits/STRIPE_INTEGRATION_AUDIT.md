# Stripe Integration Audit Report

**Generated:** 2025-02-04  
**Scope:** Backend (Python/FastAPI) + Web (Next.js) Stripe usage.

---

## 1. Backend routes that interact with Stripe

All Stripe routes live in **one file**; the router is mounted with **no prefix**, so full paths are as below.

| File path | Route path | HTTP | Stripe API calls | Purpose |
|-----------|------------|------|------------------|---------|
| `backend/app/routes/stripe.py` | `/stripe/card-status` | GET | `stripe.Customer.retrieve`, `stripe.PaymentMethod.list`, `stripe.PaymentMethod.retrieve` | Check if a contact has a card on file; returns `has_card_on_file`, `customer_id`, `default_payment_method_id`, `brand`, `last4`. Resolves contact via GHL then Supabase; gets Stripe customer from Supabase `customers.stripe_customer_id`. |
| `backend/app/routes/stripe.py` | `/stripe/setup-intent` | POST | `stripe.SetupIntent.create` (and indirectly `stripe.Customer.retrieve` / `stripe.Customer.create` in `get_or_create_stripe_customer_for_customer`) | Create a SetupIntent for card-on-file (no charge). Resolves/creates Supabase contact + customer, gets/creates Stripe customer, creates SetupIntent with `usage=off_session`, returns `client_secret`. Writes `stripe_customer_id` and `setup_intent_id` to Supabase `customers` via `link_stripe_customer_to_supabase`. |
| `backend/app/routes/stripe.py` | `/stripe/webhook` | POST | `stripe.Webhook.construct_event`, `stripe.SetupIntent.retrieve`, `stripe.PaymentMethod.retrieve`, `stripe.PaymentMethod.attach`, `stripe.Customer.modify` | Handles Stripe webhook events (see Section 4). |
| `backend/app/routes/stripe.py` | `/stripe/charge` | POST | `stripe.Customer.retrieve`, `stripe.PaymentMethod.list`, `stripe.PaymentIntent.create` (with `confirm=True`, `off_session=True`) | Charge a customer’s saved payment method (off-session). Called by GHL workflow (requires `X-ALLOY-WORKFLOW-SECRET`). Creates and confirms a PaymentIntent; updates GHL (tags, notes, opportunity stage). **Does not write to any Supabase payments table.** |

**Additional backend file that uses Stripe:**

| File path | Not a route | Stripe API calls |
|-----------|-------------|------------------|
| `backend/app/supabase_client.py` | N/A | `stripe.Customer.retrieve` (to validate existing `stripe_customer_id` in current Stripe mode), `stripe.Customer.create` (in `get_or_create_stripe_customer_for_customer`) | Used by `/stripe/setup-intent` and `/stripe/charge` for customer resolution/creation. |

---

## 2. Frontend files that call Stripe-related endpoints

| File path | Endpoint(s) called | Purpose |
|-----------|--------------------|---------|
| `web/app/book-v2/BookV2Client.tsx` | `POST ${apiBaseUrl}/stripe/setup-intent` | Booking flow: create SetupIntent, then `stripe.confirmCardSetup(client_secret)` to save card; no charge at booking. |
| `web/app/payment/PaymentClient.tsx` | `GET ${apiBaseUrl}/stripe/card-status?…` | Check if user already has a card on file (skip form if yes). |
| `web/app/payment/PaymentClient.tsx` | `POST ${apiBaseUrl}/stripe/setup-intent` | Standalone payment page: create SetupIntent, then `stripe.confirmCardSetup(client_secret)` to save card. |

**Base URL:** `process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"` (backend API).

**Not called from frontend:**  
- `POST /stripe/webhook` — called only by Stripe.  
- `POST /stripe/charge` — called only by GHL workflow (backend/internal), not by web app.

---

## 3. PaymentIntent vs SetupIntent vs capturing charges

| Question | Answer |
|----------|--------|
| **Are we creating PaymentIntents anywhere?** | **Yes.** Only in **`backend/app/routes/stripe.py`** in the **`charge_customer`** handler for **`POST /stripe/charge`**. `stripe.PaymentIntent.create(..., confirm=True, off_session=True)` is used to charge a saved payment method when the GHL workflow triggers the charge (e.g. “Ready to Pay” stage). |
| **Are we capturing charges?** | **Yes, but only via the charge endpoint.** Charges are created and confirmed in one step with `PaymentIntent.create(..., confirm=True)`. There is no separate “capture” flow; the PaymentIntent is created and confirmed server-side (off-session). |
| **Are we only using SetupIntent (in the booking/payment UI)?** | **Yes for the web booking/payment flows.** Book-v2 and the standalone payment page **only** use SetupIntent (create SetupIntent → confirmCardSetup on client). They do **not** create or confirm PaymentIntents. Actual charges happen later via `/stripe/charge` (workflow-triggered). |
| **Do we have code that runs `stripe.PaymentIntent.create`?** | **Yes.** Exactly one place: **`backend/app/routes/stripe.py`**, in **`charge_customer`** (around line 1300): `payment_intent = stripe.PaymentIntent.create(customer=..., amount=..., payment_method=..., confirm=True, off_session=True, ...)`. |

---

## 4. Webhook implementation

| Item | Detail |
|------|--------|
| **Webhook route path** | **`POST /stripe/webhook`** (same backend base URL as other Stripe routes). |
| **Events handled** | 1. **`setup_intent.succeeded`** — full handling (see below). 2. **`setup_intent.setup_failed`** — log only (no DB writes). 3. **All other event types** — ignored (return 200). There is **no** handler for `payment_intent.succeeded`, `payment_intent.payment_failed`, or any other PaymentIntent event. |
| **Per-event behavior** | **`setup_intent.succeeded`:** (1) Resolve contact (GHL by metadata `ghl_contact_id`, or search by phone/email). (2) **GHL:** add tag `card_on_file:collected`; optionally sync `stripe_customer_id` to GHL custom field. (3) **Stripe:** `PaymentMethod.retrieve`, attach to customer if needed, `Customer.modify` (set default payment method). (4) **Supabase:** `link_stripe_customer_to_supabase` — upserts **`customers`** (and updates **`contacts`**): writes `stripe_customer_id`, `setup_intent_id`, `default_payment_method_id`, `payment_method_brand`, `payment_method_last4`, and optionally address. **No `payments` table is written to.** |

---

## 5. Payments table and PaymentIntent linking

| Question | Answer |
|----------|--------|
| **Do we have a `payments` table in Supabase?** | **No.** Checked `supabase/migrations` and repo: there is **no** `payments` (or similarly named) table. Existing tables include e.g. `action_links`, `customer_subscriptions`, `assignments`, `messages_outbox`, `vendor_contacts`, `vendor_statuses`, `discount_redemptions` — none are a payments ledger. |
| **Any backend code writing to a payments table?** | **No.** No code writes to a `payments` table. Charge outcome is reflected only in GHL (tags, notes, opportunity stage) and in Stripe (PaymentIntent status). |
| **Any logic linking Stripe PaymentIntent IDs to Supabase records?** | **No.** PaymentIntent IDs are returned in the JSON response of `POST /stripe/charge` and are logged and stored in GHL notes. They are **not** stored in Supabase. The **`customers`** table stores `stripe_customer_id`, `setup_intent_id`, `default_payment_method_id`, `payment_method_brand`, `payment_method_last4` — i.e. SetupIntent/card-on-file linkage only, not PaymentIntent/charge linkage. |

---

## 6. Summary: implemented vs partial vs not present

### Implemented

- **SetupIntent flow (card on file)**  
  - Backend: `POST /stripe/setup-intent` creates SetupIntent (and optionally Stripe customer); writes to Supabase `customers` (and `contacts`) via `link_stripe_customer_to_supabase`.  
  - Frontend: Book-v2 and standalone payment page call `POST /stripe/setup-intent`, then `stripe.confirmCardSetup(client_secret)`.  
  - Webhook: `setup_intent.succeeded` updates GHL (tag, optional Stripe customer ID sync) and Supabase `customers` (payment method details, `setup_intent_id`).

- **Card status check**  
  - Backend: `GET /stripe/card-status` uses Stripe Customer + PaymentMethod APIs.  
  - Frontend: Payment page calls it to decide whether to show the card form.

- **Off-session charging**  
  - Backend: `POST /stripe/charge` creates and confirms a PaymentIntent for a saved payment method; updates GHL (tags, notes, opportunity stage).  
  - Not called from frontend; triggered by GHL workflow (e.g. when opportunity moves to “Ready to Pay”).

- **Stripe customer lifecycle**  
  - Resolve/create in `get_or_create_stripe_customer_for_customer` (Supabase-first); validate existing `stripe_customer_id` in current Stripe mode (test vs live) and clear/create new if invalid.

### Partially implemented

- **Webhook coverage**  
  - Only SetupIntent events are handled. PaymentIntent events (`payment_intent.succeeded`, `payment_intent.payment_failed`, etc.) are not handled; charge outcomes are not persisted in Supabase.

- **Payment audit trail in our DB**  
  - Charges are only in Stripe and GHL. There is no Supabase table (e.g. `payments`) storing PaymentIntent IDs, amounts, or status for reporting or reconciliation.

### Not present

- **`payments` (or equivalent) table in Supabase** — does not exist.
- **Backend writes to a payments table** — none.
- **Linking PaymentIntent IDs to Supabase records** — no such logic.
- **Frontend-triggered PaymentIntent creation** — booking/payment UIs only use SetupIntent; no PaymentIntent creation or confirmation on the client.
- **Webhook handlers for PaymentIntent events** — none.

---

## Quick reference: Stripe-related files

| Role | Path |
|------|------|
| Backend Stripe routes | `backend/app/routes/stripe.py` |
| Backend Stripe customer resolution / Supabase link | `backend/app/supabase_client.py` |
| Backend app (router mount) | `backend/app/server.py` |
| Book-v2 payment (SetupIntent) | `web/app/book-v2/BookV2Client.tsx` |
| Standalone payment page (card-status + SetupIntent) | `web/app/payment/PaymentClient.tsx` |
