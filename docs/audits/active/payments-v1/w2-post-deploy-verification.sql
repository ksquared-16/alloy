-- Payments V1 · W2 — post-deployment certification, read only, ONE statement.
--
-- Proves on the DEPLOYED PRIMARY, not on the certification stack, that the promotion did what it
-- claimed: the canonical table exists with its structural guarantees, and the legacy table is gone.
--
-- Emitted as question_id | kind | payload so each answer is separable.
select
    'w2_post_deploy' as question_id,
    'row' as kind,
    json_build_object(
        'payment_methods_exists',        (to_regclass('public.payment_methods') is not null),
        'customer_payment_methods_gone', (to_regclass('public.customer_payment_methods') is null),
        'canonical_columns',             (select count(*) from information_schema.columns
                                            where table_schema='public' and table_name='payment_methods'),
        'default_index',                 (to_regclass('public.uq_payment_methods_default_account_rail') is not null),
        'provider_ref_index',            (to_regclass('public.uq_payment_methods_provider_method_ref') is not null),
        'immutability_trigger',          (select count(*) from pg_trigger
                                            where tgname='trg_enforce_payment_method_identity_immutability'),
        'atomic_default_fn',             (to_regprocedure('public.set_default_payment_method(uuid, uuid, uuid)') is not null),
        'rls_enabled',                   (select relrowsecurity from pg_class where oid='public.payment_methods'::regclass),
        'rows_stored',                   (select count(*) from public.payment_methods),
        'ledger_has_create',             (select count(*) from supabase_migrations.schema_migrations where version='20260921120000'),
        'ledger_has_drop',               (select count(*) from supabase_migrations.schema_migrations where version='20260921130000')
    )::text as payload;
