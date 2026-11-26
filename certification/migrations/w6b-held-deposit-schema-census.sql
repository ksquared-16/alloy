-- W6-B DEPLOYED SCHEMA CENSUS — did the staging apply actually install the objects?
--
-- `ledger: "applied"` is a LABEL the apply writes about itself. This asks the catalog.
--
-- CATALOG-ONLY, deliberately. A single FROM against a table this migration set touches would make
-- the census itself depend on the thing being censused, and a missing object would read as a query
-- failure rather than as an answer.
--
-- ONE statement, emitting question_id | kind | payload. No secrets: only object names and types.
WITH fn AS (
    SELECT pg_get_function_identity_arguments(p.oid) AS args, p.pronargs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_held_funds_atomic'
),
col AS (
    SELECT data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_provider_refunds'
      AND column_name = 'hold_id'
),
idx AS (
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'uq_payment_hold_dispositions_one_per_refund',
        'idx_payment_provider_refunds_hold'
      )
)
SELECT 'm120000_apply_fn' AS question_id, 'scalar' AS kind,
       json_build_object(
           'present', (SELECT count(*) FROM fn),
           'arity', (SELECT pronargs FROM fn),
           'takes_bigint_cents', (SELECT (args LIKE '%p_amount_cents bigint%') FROM fn),
           'identity_arguments', (SELECT args FROM fn)
       )::text AS payload
UNION ALL
SELECT 'm120000_hold_column', 'scalar',
       json_build_object(
           'present', (SELECT count(*) FROM col),
           'data_type', (SELECT data_type FROM col),
           'is_nullable', (SELECT is_nullable FROM col)
       )::text
UNION ALL
SELECT 'm120000_indexes', 'row', to_jsonb(i.*)::text FROM idx i
UNION ALL
SELECT 'm120000_index_count', 'scalar',
       json_build_object('found', (SELECT count(*) FROM idx), 'expected', 2)::text;
