# payment_statuses table: schema and lookup

Used to resolve `payments.payment_status_id` (UUID FK) from logical status keys.

## Assumed schema

- **Table:** `public.payment_statuses`
- **Columns (minimal):**
  - `id` uuid PRIMARY KEY
  - **Lookup column:** one of `key`, `code`, or `name` (text) with values used to resolve status

## Lookup convention

- **Backend (Python):** `supabase_client.get_payment_status_id_by_key(status_key)` queries `payment_statuses` where the lookup column equals `status_key`. The lookup column is set by **`PAYMENT_STATUS_LOOKUP_COLUMN`** in `backend/app/supabase_client.py` (default: `"key"`). If your table uses `code` or `name` instead, change that constant.
- **Web (Next.js):** `POST /api/admin/payments/run` resolves status UUIDs by querying `payment_statuses` with the same convention: filter by the chosen column and values `'pending'`, `'paid'`, `'failed'`.

## Required rows

For the payments run flow and Stripe webhooks to work, `payment_statuses` must have one row per status:

| Lookup value | Use |
|--------------|-----|
| `pending` | New payment row before Stripe confirm; also used when payment requires_action. |
| `paid` | After PaymentIntent succeeds; set with `paid_at`. |
| `failed` | After PaymentIntent fails or is canceled; store error in `payments.metadata`. |

## Resolving status IDs

1. **Pending:** used when inserting a new payment and when updating to failed (no payment method, or Stripe error).
2. **Paid:** used when `payment_intent.succeeded` or when the run route gets `paymentIntent.status === 'succeeded'`.
3. **Failed:** used when `payment_intent.payment_failed`, `payment_intent.canceled`, or when the run route gets a non-succeeded status or throws.

If a required row is missing, the run route returns 500 (cannot resolve pending UUID) and the webhook logs a warning and skips the payment update.

---

## Staging test checklist

After deploying run-route and webhook changes:

1. **payment_statuses**
   - Confirm `payment_statuses` has rows with lookup values `pending`, `paid`, `failed` (and that `PAYMENT_STATUS_LOOKUP_COLUMN` in backend + run route matches the column name, e.g. `key`).

2. **Run payment (success)**
   - Call `POST /api/admin/payments/run` with a valid `job_id` (job has customer with `stripe_customer_id` and a default payment method).
   - Expect 200 and `status: "succeeded"`.
   - In Supabase, confirm the payment row has:
     - `payment_status_id` = UUID of the “paid” status (not text `"paid"`).
     - `provider` = `'stripe'`.
     - `provider_payment_id` = `pi_...`.
     - `org_id` set (from job, opportunity, or `ALLOY_PUBLIC_ORG_ID`).
     - `currency` = `'USD'`.
     - `paid_at` set.

3. **Run payment (no payment method)**
   - Use a job whose customer has no saved payment method (or no `stripe_customer_id`).
   - Expect 400 and payment row with `payment_status_id` = failed UUID, `metadata.error` ≈ “No payment method found”.

4. **Webhook: payment_intent.succeeded**
   - Trigger a success (e.g. run payment that succeeds, or Stripe CLI: `stripe trigger payment_intent.succeeded` and ensure a matching payment row exists with that `provider_payment_id`).
   - Confirm payment row is updated: `payment_status_id` = paid UUID, `paid_at` set.

5. **Webhook: payment_intent.payment_failed / canceled**
   - Trigger failure or cancel; confirm payment row gets `payment_status_id` = failed UUID and `metadata.error` (or equivalent) set.

6. **Migration**
   - Apply migration; confirm no `CREATE TABLE` runs and only indexes are created/updated. No duplicate table or constraint errors.
