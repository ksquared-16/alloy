-- Payments V1 · W4 — deployed schema proof + post-deployment certification. Read only, ONE statement.
--
-- Proves on the DEPLOYED PRIMARY that held money exists with the guarantees W4 claims, and that
-- W1-W3 and the Core money spine were not disturbed by it.
select
    'w4_post_deploy' as question_id,
    'row' as kind,
    json_build_object(
        'payment_holds_exists',        (to_regclass('public.payment_holds') is not null),
        'dispositions_exists',         (to_regclass('public.payment_hold_dispositions') is not null),
        'invariant_triggers',          (select count(*) from pg_trigger
                                          where not tgisinternal and tgname in (
                                            'trg_enforce_payment_hold_disposition_bounds',
                                            'trg_enforce_payment_hold_within_unapplied',
                                            'trg_enforce_payment_hold_immutability',
                                            'trg_refuse_payment_hold_disposition_rewrite')),
        'holds_rls',                   (select relrowsecurity from pg_class where oid='public.payment_holds'::regclass),
        'dispositions_rls',            (select relrowsecurity from pg_class where oid='public.payment_hold_dispositions'::regclass),
        -- W4 must not have disturbed anything that already existed.
        'payments_intact',             (to_regclass('public.payments') is not null),
        'allocations_intact',          (to_regclass('public.payment_allocations') is not null),
        'payment_methods_intact_w2',   (to_regclass('public.payment_methods') is not null),
        'attempts_intact_w3',          (to_regclass('public.payment_collection_attempts') is not null),
        'attempt_method_col_w3',       (select count(*) from information_schema.columns
                                          where table_schema='public' and table_name='payment_collection_attempts'
                                            and column_name='payment_method_id'),
        'payments_row_count',          (select count(*) from public.payments),
        'allocations_row_count',       (select count(*) from public.payment_allocations),
        'holds_row_count',             (select count(*) from public.payment_holds),
        'ledger_has_w4',               (select count(*) from supabase_migrations.schema_migrations where version='20260923120000')
    )::text as payload;
