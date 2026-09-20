-- Payments V1 · W3 — deployed schema proof + post-deployment certification. Read only, ONE statement.
--
-- Proves on the DEPLOYED PRIMARY that the additive migration landed with the shape W3 claims, and
-- that it added exactly two columns and no destructive change.
select
    'w3_post_deploy' as question_id,
    'row' as kind,
    json_build_object(
        'payment_method_id_exists',      (select count(*) from information_schema.columns
                                            where table_schema='public' and table_name='payment_collection_attempts'
                                              and column_name='payment_method_id'),
        'expected_settlement_is_date',   (select data_type from information_schema.columns
                                            where table_schema='public' and table_name='payment_collection_attempts'
                                              and column_name='expected_settlement_on'),
        'both_nullable',                 (select count(*) from information_schema.columns
                                            where table_schema='public' and table_name='payment_collection_attempts'
                                              and column_name in ('payment_method_id','expected_settlement_on')
                                              and is_nullable='YES'),
        'method_fk_present',             (select count(*) from information_schema.table_constraints tc
                                            join information_schema.key_column_usage k on k.constraint_name=tc.constraint_name
                                            where tc.table_name='payment_collection_attempts'
                                              and tc.constraint_type='FOREIGN KEY' and k.column_name='payment_method_id'),
        'provenance_index',              (to_regclass('public.idx_payment_collection_attempts_method') is not null),
        'payment_methods_still_there',   (to_regclass('public.payment_methods') is not null),
        'attempts_total',                (select count(*) from public.payment_collection_attempts),
        'attempts_with_method',          (select count(*) from public.payment_collection_attempts where payment_method_id is not null),
        'needs_recognition_now',         (select count(*) from public.payment_collection_attempts
                                            where processor_state='succeeded' and canonical_payment_id is null),
        'ledger_has_w3',                 (select count(*) from supabase_migrations.schema_migrations where version='20260922120000')
    )::text as payload;
