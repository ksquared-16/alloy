# Payments Table: New Migration vs Existing Schema

The **existing** `public.payments` table schema is **not** defined in this repo (it was created outside the tracked migrations). Below is what the **new** migration defines, how to compare it to your existing table, and how to avoid conflicts.

---

## 1. What the new migration defines

**File:** `supabase/migrations/20250211100000_payments_table.sql`

| Element | New migration |
|--------|----------------|
| **Table** | `CREATE TABLE IF NOT EXISTS public.payments` |
| **Columns** | `id` uuid PK, `job_id` uuid NOT NULL FK→jobs, `customer_id` uuid FK→customers, `amount_cents` bigint NOT NULL CHECK (>0), `currency` text NOT NULL DEFAULT 'usd', `payment_status_id` text NOT NULL DEFAULT 'pending' CHECK (IN ('pending','paid','failed')), `provider_payment_id` text, `paid_at` timestamptz, `metadata` jsonb DEFAULT '{}', `created_at` timestamptz NOT NULL DEFAULT now(), `updated_at` timestamptz NOT NULL DEFAULT now() |
| **payment_status_id** | **text** NOT NULL DEFAULT 'pending', CHECK (payment_status_id IN ('pending', 'paid', 'failed')) |
| **currency** | **text** NOT NULL DEFAULT **'usd'** |
| **provider_payment_id** | **text** (nullable). **Unique** index: `payments_provider_payment_id_idx` UNIQUE WHERE provider_payment_id IS NOT NULL |
| **Triggers** | **None** in this migration. Comment says: "Ledger trigger on payments.paid_at (assumed to exist elsewhere)." |
| **Indexes** | job_id, customer_id, provider_payment_id (unique partial), paid_at (partial), payment_status_id |

---

## 2. How to get your existing schema

Run in the Supabase SQL editor (or `psql`):

```sql
-- Table definition
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payments'
ORDER BY ordinal_position;

-- Constraints (including CHECK)
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.payments'::regclass;

-- Indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'payments';

-- Triggers
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid = 'public.payments'::regclass;
```

Compare the output to the “New migration” column below.

---

## 3. Differences that matter for the implementation

### payment_status_id type

| Scenario | New migration | Possible existing | Conflict? | What to do |
|----------|----------------|-------------------|-----------|------------|
| **A** | text, CHECK IN ('pending','paid','failed') | Same (text + same values) | No | None. |
| **B** | text | uuid FK to `payment_statuses(id)` | **Yes** | Code uses string status values. Either: (1) keep FK and map in code: resolve 'paid'→status row id and write that id, or (2) add a text column (e.g. `status`) for the implementation and keep `payment_status_id` as FK if needed for other uses. |
| **C** | text | text but different allowed values (e.g. 'succeeded' instead of 'paid') | **Yes** | Use your allowed values in code: web route and webhook must set only values that pass your CHECK / application rules. |

**Implementation today:**  
- **Run route** and **webhook** set `payment_status_id` to the strings `'pending'`, `'paid'`, or `'failed'`.  
- If your column is a **uuid FK**, you must resolve those strings to the correct `payment_statuses.id` and write the uuid instead.

---

### currency default

| Scenario | New migration | Possible existing | Conflict? | What to do |
|----------|----------------|-------------------|-----------|------------|
| **A** | text NOT NULL DEFAULT 'usd' | Same or no default | No | Run route inserts `currency: 'usd'`. If your column has no default, our insert still supplies it. |
| **B** | DEFAULT 'usd' | Different default (e.g. 'USD' or null) | Only if NOT NULL | If existing is NOT NULL and we don’t send `currency`, insert could fail. Our code **does** send `currency: 'usd'`, so no change needed unless you want a different default. |

**Implementation today:**  
- Run route always sends `currency: 'usd'`. No change needed for default unless you want to stop sending it and rely on the DB default.

---

### provider_payment_id constraints

| Scenario | New migration | Possible existing | Conflict? | What to do |
|----------|----------------|-------------------|-----------|------------|
| **A** | text, unique partial index WHERE NOT NULL | Same or no unique | No | None. |
| **B** | Unique partial index | No unique constraint | No | New migration would **add** uniqueness. If you want to allow duplicate Stripe PaymentIntent ids, skip creating this index in the migration (see “Recommendation” below). |
| **C** | text | Different name (e.g. `stripe_payment_intent_id`) | **Yes** | Code and webhook use column name `provider_payment_id`. Either rename your column to `provider_payment_id` or change all our code to use your column name. |

**Implementation today:**  
- All code uses the column name **`provider_payment_id`** and expects it to store the Stripe PaymentIntent id (e.g. `pi_xxx`).  
- Webhook finds the row with `WHERE provider_payment_id = eq.<pi_id>`.

---

### Triggers

| Scenario | New migration | Existing | Conflict? | What to do |
|----------|----------------|----------|-----------|------------|
| **A** | No triggers | You have e.g. trigger on `paid_at` for ledger | No | Migration doesn’t touch triggers. Our code only sets `paid_at`; your trigger keeps working. |
| **B** | No triggers | You have trigger that expects certain columns or types | No | Migration doesn’t add triggers. If our new columns/types match what the trigger expects, no change. If not, we only need to align column names/types (see above). |

**Implementation today:**  
- We do **not** create or drop any triggers. We only set `paid_at` and other columns; your existing “ledger trigger on payments.paid_at” is unchanged.

---

## 4. Does the new migration conflict with the existing schema?

- **If the table already exists:**  
  - `CREATE TABLE IF NOT EXISTS` will **not** recreate it, so the table definition in the migration is **not** applied.  
  - The migration still runs **CREATE INDEX IF NOT EXISTS** for each index. Those will create indexes that don’t exist yet; if an index with the same name or same definition already exists, you may get a no-op or an error depending on Postgres/Supabase behavior. So the only possible conflicts are:
  - **Index names**: if your existing indexes use the same names (`payments_job_id_idx`, `payments_customer_id_idx`, `payments_provider_payment_id_idx`, `payments_paid_at_idx`, `payments_payment_status_id_idx`), `IF NOT EXISTS` avoids duplicates.
  - **Index definitions**: if you already have a **different** unique rule on `provider_payment_id` (e.g. non-partial unique), the new **partial** unique index might still be created and could be redundant or conflicting with your constraint.

- **If the table does not exist:**  
  - The migration creates the table and indexes as defined above. No conflict with “existing” table in that case.

So: **conflict risk** is mainly (1) **payment_status_id** being a uuid FK in your schema while our code sends text, and (2) **column names** differing (e.g. no `provider_payment_id` or different name). Index/trigger conflicts are avoidable by making the migration additive (see below).

---

## 5. Recommendation: use the existing table and avoid redefining it

1. **Do not rely on the migration to define the table**  
   - Treat `public.payments` as already defined by you.  
   - Option A: **Remove** `CREATE TABLE IF NOT EXISTS ...` (and the COMMENT if it overwrites) from the migration so the file only ensures indexes (or drop the migration entirely if you manage indexes elsewhere).  
   - Option B: **Keep** `CREATE TABLE IF NOT EXISTS` so new environments get a table if they don’t have one, but in your main Supabase project the table already exists so it won’t run.

2. **Align implementation with your schema**  
   - **Column names:** Our code assumes `id`, `job_id`, `customer_id`, `amount_cents`, `currency`, `payment_status_id`, `provider_payment_id`, `paid_at`, `metadata`, `created_at`, `updated_at`. If your table uses different names (e.g. `stripe_payment_intent_id` instead of `provider_payment_id`), change:
     - **Run route:** `web/app/api/admin/payments/run/route.ts` — all `.from("payments")` inserts/updates.
     - **Webhook helper:** `backend/app/supabase_client.py` — `update_payment_by_provider_payment_id`: payload keys and the filter param `provider_payment_id`.
   - **payment_status_id:** If it’s a **uuid FK** to `payment_statuses`:
     - In the run route: after resolving job/customer, query `payment_statuses` for the row where e.g. `code = 'pending'` (or your convention), get its `id`, and use that for insert/updates.
     - In the webhook: same idea — map `'paid'` / `'failed'` to the corresponding status row ids and pass those to `update_payment_by_provider_payment_id` (which would then accept optional uuid for status and write that column).
   - **currency:** If you don’t have `currency` or use a different default, either add the column with default `'usd'` or stop sending it from the run route and rely on your default.

3. **Migration: additive-only (optional)**  
   - Replace the migration content with only **indexes** you’re missing (and that match your column names), and no triggers. For example, if your table already has `provider_payment_id` but no unique index:

   ```sql
   -- Only add indexes that don't exist. Table and trigger are owned by existing schema.
   CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_idx
     ON public.payments (provider_payment_id) WHERE provider_payment_id IS NOT NULL;
   CREATE INDEX IF NOT EXISTS payments_job_id_idx ON public.payments (job_id);
   CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON public.payments (paid_at) WHERE paid_at IS NOT NULL;
   -- etc.
   ```

   - This way the migration never redefines the table or triggers and only adds indexes if they’re missing.

---

## 6. Summary

| Topic | New migration | Action if your schema differs |
|--------|----------------|--------------------------------|
| **payment_status_id type** | text, CHECK ('pending','paid','failed') | If uuid FK: map status strings to `payment_statuses.id` in run route and webhook. |
| **currency default** | text DEFAULT 'usd' | We send `currency: 'usd'`; no change unless you need another default. |
| **provider_payment_id** | text, unique partial index | If column has another name, rename in code or in DB. If you don’t want unique, skip that index in migration. |
| **Triggers** | None | No change; your existing paid_at trigger is untouched. |
| **Conflict?** | Only if table already exists and we add conflicting indexes, or if column names/types differ. | Use existing table; make migration additive-only (indexes only); align code to your column names and payment_status_id type (text vs uuid FK). |

If you paste your current `payments` table definition (from the SQL above), the implementation can be adjusted exactly to match it (column names and payment_status_id handling).
