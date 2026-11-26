-- HELD / DEPOSIT DEPLOYED LIFECYCLE CENSUS — is the authority the deployed product must reach
-- actually present on the deployed database, before anything is mutated?
--
-- The lifecycle QA that follows will drive Apply, Release, Refund and a non-refundable refusal
-- through the mounted product. Every one of those depends on database-level authority that a
-- screenshot cannot see: the atomic apply function, the four guard triggers, the disposition
-- provenance CHECKs and the captured-terms columns. If any of them is absent on deployed, a green
-- mounted run would be proving the UI, not the product.
--
-- CATALOG-ONLY. It never reads payments, payment_holds or any tenant row, so it measures the shape
-- of the schema without depending on the data the QA is about to change, and carries no financial
-- value or PII.
--
-- ONE statement, question_id | kind | payload. Object names and types only.
WITH canonical_tbl AS (
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('payments', 'payment_allocations', 'payment_holds',
                         'payment_hold_dispositions', 'payment_provider_refunds')
),
holds_terms AS (
    -- The captured terms. `refundable` and `refundable_terms` are the snapshot that governs a refund;
    -- `policy_id` is provenance only. If the snapshot columns were missing, eligibility would have
    -- to fall back to current policy, which is the one thing a deposit must never do.
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_holds'
      AND column_name IN ('amount_cents', 'payment_id', 'refundable', 'refundable_terms',
                          'policy_id', 'reason')
),
disp_cols AS (
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_hold_dispositions'
      AND column_name IN ('kind', 'amount_cents', 'allocation_id', 'refund_payment_id', 'disposed_by')
),
disp_kind_chk AS (
    -- The vocabulary itself: released / applied / refunded, enforced by the database rather than
    -- by whichever caller happens to be writing.
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'payment_hold_dispositions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%released%'
      AND pg_get_constraintdef(c.oid) LIKE '%applied%'
      AND pg_get_constraintdef(c.oid) LIKE '%refunded%'
),
disp_provenance_chk AS (
    -- An applied disposition must name its allocation, a refunded one its refund payment, and a
    -- release must name neither. These are what stop a disposition claiming a consequence that did
    -- not happen in the canonical world.
    SELECT c.conname
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'payment_hold_dispositions'
      AND c.conname IN ('payment_hold_dispositions_applied_names_allocation_chk',
                        'payment_hold_dispositions_refunded_names_payment_chk',
                        'payment_hold_dispositions_release_is_bare_chk')
),
atomic_fn AS (
    SELECT p.proname, p.pronargs,
           pg_get_function_identity_arguments(p.oid) AS ident_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_held_funds_atomic'
),
guard_fns AS (
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('enforce_payment_hold_disposition_bounds',
                        'enforce_payment_hold_within_unapplied',
                        'enforce_payment_hold_immutability',
                        'refuse_payment_hold_disposition_rewrite')
),
guard_trgs AS (
    SELECT tg.tgname FROM pg_trigger tg JOIN pg_class t ON t.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND NOT tg.tgisinternal
      AND tg.tgname IN ('trg_enforce_payment_hold_disposition_bounds',
                        'trg_enforce_payment_hold_within_unapplied',
                        'trg_enforce_payment_hold_immutability',
                        'trg_refuse_payment_hold_disposition_rewrite')
),
refund_hold AS (
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_provider_refunds'
      AND column_name = 'hold_id'
),
refund_uq AS (
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('uq_payment_hold_dispositions_one_per_refund',
                        'idx_payment_provider_refunds_hold')
)
SELECT 'hdl_canonical_tables' AS question_id, 'scalar' AS kind,
       json_build_object('found', (SELECT count(*) FROM canonical_tbl), 'expected', 5,
                         'names', (SELECT coalesce(json_agg(table_name ORDER BY table_name), '[]'::json) FROM canonical_tbl))::text AS payload
UNION ALL
SELECT 'hdl_captured_terms', 'scalar',
       json_build_object('found', (SELECT count(*) FROM holds_terms), 'expected', 6,
                         'names', (SELECT coalesce(json_agg(column_name ORDER BY column_name), '[]'::json) FROM holds_terms))::text
UNION ALL
SELECT 'hdl_disposition_columns', 'scalar',
       json_build_object('found', (SELECT count(*) FROM disp_cols), 'expected', 5,
                         'names', (SELECT coalesce(json_agg(column_name ORDER BY column_name), '[]'::json) FROM disp_cols))::text
UNION ALL
SELECT 'hdl_disposition_vocabulary', 'scalar',
       json_build_object('found', (SELECT count(*) FROM disp_kind_chk), 'expected', 1,
                         'def', (SELECT def FROM disp_kind_chk LIMIT 1))::text
UNION ALL
SELECT 'hdl_disposition_provenance', 'scalar',
       json_build_object('found', (SELECT count(*) FROM disp_provenance_chk), 'expected', 3,
                         'names', (SELECT coalesce(json_agg(conname ORDER BY conname), '[]'::json) FROM disp_provenance_chk))::text
UNION ALL
SELECT 'hdl_atomic_authority', 'scalar',
       json_build_object('found', (SELECT count(*) FROM atomic_fn), 'expected', 1,
                         'pronargs', (SELECT pronargs FROM atomic_fn LIMIT 1),
                         'expected_pronargs', 6,
                         'identity_arguments', (SELECT ident_args FROM atomic_fn LIMIT 1))::text
UNION ALL
SELECT 'hdl_guards', 'scalar',
       json_build_object('functions_found', (SELECT count(*) FROM guard_fns), 'functions_expected', 4,
                         'triggers_found', (SELECT count(*) FROM guard_trgs), 'triggers_expected', 4,
                         'trigger_names', (SELECT coalesce(json_agg(tgname ORDER BY tgname), '[]'::json) FROM guard_trgs))::text
UNION ALL
SELECT 'hdl_refund_carries_hold', 'scalar',
       json_build_object('hold_id_column', (SELECT count(*) FROM refund_hold), 'expected_column', 1,
                         'indexes_found', (SELECT count(*) FROM refund_uq), 'indexes_expected', 2,
                         'index_names', (SELECT coalesce(json_agg(indexname ORDER BY indexname), '[]'::json) FROM refund_uq))::text;
