-- W6-A2 DEPLOYED SCHEMA CENSUS — did the teardown actually remove what it claimed, and keep what it promised?
--
-- `ledger: "applied"` is a label the apply writes about itself. This asks the catalog.
--
-- CATALOG-ONLY. A census that did `FROM payments` would depend on the table it is measuring, and a
-- dropped column would surface as a query failure rather than as an answer.
--
-- It asks BOTH halves deliberately. A teardown that quietly took a canonical column with it would
-- pass a census that only looked for absence, so the surviving fields are counted too.
--
-- ONE statement, question_id | kind | payload. No secrets: object names and types only.
WITH dropped_cols AS (
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name IN ('payment_status_id', 'deposit_batch_id', 'provider')
),
surviving_cols AS (
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name IN ('paid_at', 'status_key', 'provider_payment_id',
                          'posted_to_ledger_at', 'job_id', 'customer_id')
),
canonical_cols AS (
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name IN ('status', 'direction', 'amount_cents', 'processor',
                          'processor_transaction_id', 'payer_entity_type', 'payer_entity_id',
                          'billable_source_type', 'billable_source_id', 'refunds_payment_id',
                          'reversal_origin', 'idempotency_key')
),
dropped_tbl AS (
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_statuses'
),
canonical_tbl AS (
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('payment_collection_attempts', 'payment_provider_events',
                         'payment_provider_refunds', 'payment_methods', 'payment_holds',
                         'payment_hold_dispositions', 'payment_autopay_arrangements',
                         'payment_allocations')
),
perms AS (
    SELECT key FROM public.permission_definitions
    WHERE key IN ('fin.post', 'fin.read', 'fin.write', 'fin.adjust', 'fin.provider',
                  'scheduling.write', 'ops.jobs.write')
),
grants AS (
    SELECT count(*) AS n FROM public.role_permission_grants WHERE permission_key = 'fin.post'
),
guard AS (
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('enforce_childcare_payment_immutability', 'apply_held_funds_atomic')
)
SELECT 'a2_dropped_columns' AS question_id, 'scalar' AS kind,
       json_build_object('remaining', (SELECT count(*) FROM dropped_cols), 'expected', 0,
                         'names', (SELECT coalesce(json_agg(column_name), '[]'::json) FROM dropped_cols))::text AS payload
UNION ALL
SELECT 'a2_dropped_table', 'scalar',
       json_build_object('payment_statuses_remaining', (SELECT count(*) FROM dropped_tbl), 'expected', 0)::text
UNION ALL
SELECT 'a2_surviving_columns', 'scalar',
       json_build_object('found', (SELECT count(*) FROM surviving_cols), 'expected', 6,
                         'names', (SELECT coalesce(json_agg(column_name ORDER BY column_name), '[]'::json) FROM surviving_cols))::text
UNION ALL
SELECT 'a2_canonical_columns', 'scalar',
       json_build_object('found', (SELECT count(*) FROM canonical_cols), 'expected', 12)::text
UNION ALL
SELECT 'a2_canonical_tables', 'scalar',
       json_build_object('found', (SELECT count(*) FROM canonical_tbl), 'expected', 8,
                         'names', (SELECT coalesce(json_agg(table_name ORDER BY table_name), '[]'::json) FROM canonical_tbl))::text
UNION ALL
SELECT 'a2_permissions', 'scalar',
       json_build_object('fin_post_present', (SELECT count(*) FROM perms WHERE key = 'fin.post'),
                         'fin_post_expected', 0,
                         'fin_post_grants', (SELECT n FROM grants),
                         'survivors', (SELECT coalesce(json_agg(key ORDER BY key), '[]'::json) FROM perms WHERE key <> 'fin.post'),
                         'survivors_expected', 6)::text
UNION ALL
SELECT 'a2_guards', 'scalar',
       json_build_object('found', (SELECT count(*) FROM guard), 'expected', 2,
                         'names', (SELECT coalesce(json_agg(proname ORDER BY proname), '[]'::json) FROM guard))::text;
