-- THREAD 8 — PAYMENTS: what does the DEPLOYED database actually hold?
--
-- Thread 1's readout states `payments.job_id is NOT NULL` and that payments were never generalized
-- to `billable_source_*`. The migration tree disagrees with the first half: `20260329210000`
-- executes `ALTER TABLE public.payments ALTER COLUMN job_id DROP NOT NULL`. Reading a migration is
-- not the same as reading the database it was supposed to reach, and Thread 8's entire plan turns on
-- which of the two is true. Six questions, one row per fact, no customer data.

-- Q1 — the nullability of the columns that decide whether a childcare payment is REPRESENTABLE.
select
    'payments_column_nullability'                   as question_id,
    c.column_name                                   as name,
    c.is_nullable || ':' || c.data_type             as detail
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'payments'
  and c.column_name in ('job_id', 'customer_id', 'org_id', 'amount_cents', 'currency', 'status', 'direction', 'payment_method', 'received_at', 'posted_at', 'created_by', 'payer_entity_type', 'payer_entity_id', 'processor', 'processor_transaction_id')

union all

-- Q2 — has payments been given the generic billable-source dimension that charges,
--      ledger_transactions and gl_journal_lines all carry?
select
    'payments_billable_source_columns'              as question_id,
    c.column_name                                   as name,
    c.is_nullable || ':' || c.data_type             as detail
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'payments'
  and c.column_name in ('billable_source_type', 'billable_source_id', 'idempotency_key')

union all

-- Q3 — does payment_allocations exist, and does it carry the charge-level seam?
select
    'payment_allocations_columns'                   as question_id,
    c.column_name                                   as name,
    c.is_nullable || ':' || c.data_type             as detail
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'payment_allocations'
  and c.column_name in ('charge_id', 'target_entity_type', 'target_entity_id', 'allocated_amount_cents', 'status', 'allocation_type', 'reversed_at', 'created_by')

union all

-- Q4 — every CHECK/UNIQUE constraint on payments and payment_allocations. This is what says whether
--      a duplicate provider event can duplicate money, and whether an over-application is refused by
--      the database or only by application code.
select
    'money_table_constraints'                       as question_id,
    con.conrelid::regclass::text || '.' || con.conname as name,
    con.contype::text                               as detail
from pg_constraint con
where con.conrelid in ('public.payments'::regclass, 'public.payment_allocations'::regclass)
  and con.contype in ('c', 'u', 'p')

union all

-- Q5 — unique indexes on the two money tables (idempotency lives here or nowhere).
select
    'money_table_unique_indexes'                    as question_id,
    i.indexrelid::regclass::text                    as name,
    case when i.indisunique then 'unique' else 'non_unique' end as detail
from pg_index i
where i.indrelid in ('public.payments'::regclass, 'public.payment_allocations'::regclass)
  and i.indisunique

union all

-- Q6 — the shape of what is actually stored: how many payments have no job, and how many
--      allocations point at a charge rather than a job. Counts only; no identifiers.
select
    'payments_population'                           as question_id,
    'payments_total'                                as name,
    count(*)::text                                  as detail
from public.payments

union all

select
    'payments_population'                           as question_id,
    'payments_with_null_job_id'                     as name,
    count(*)::text                                  as detail
from public.payments
where job_id is null

union all

select
    'payments_population'                           as question_id,
    'allocations_total'                             as name,
    count(*)::text                                  as detail
from public.payment_allocations

union all

select
    'payments_population'                           as question_id,
    'allocations_with_charge_id'                    as name,
    count(*)::text                                  as detail
from public.payment_allocations
where charge_id is not null

union all

select
    'payments_population'                           as question_id,
    'charges_childcare_posted'                      as name,
    count(*)::text                                  as detail
from public.charges
where billable_source_type in ('enrollment_agreement', 'customer')
  and status <> 'draft'

order by question_id, name;
