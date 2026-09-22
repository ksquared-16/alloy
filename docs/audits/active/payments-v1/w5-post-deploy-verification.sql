-- Payments V1 · W5 — deployed schema proof + REAL CLOCK Autopay certification. Read only, ONE statement.
--
-- Two questions, and the second is the one W5 exists to answer.
--
-- 1. Did the W5 schema land on the deployed primary with the guarantees it claims, and did it leave
--    W1-W4 alone?
--
-- 2. Did a REAL pg_cron tick reach the Payments handler? Not a handler invoked directly by a test —
--    the deployed clock, posting to the generic wake endpoint on its own five-minute schedule,
--    claiming an occurrence and dispatching it to `payments.autopay.evaluate`. `scheduled_work_clock`
--    is the liveness record the runtime writes on every wake whether or not it had work; the
--    occurrence and attempt rows are what prove the wake reached Payments specifically.
--
-- `autopay_attempt_outcomes` is deliberately a breakdown rather than a count: a dispatch that
-- reached the handler and failed is a different fact from one that completed, and a single number
-- could not tell them apart.
select
    'w5_post_deploy' as question_id,
    'row' as kind,
    json_build_object(
        'autopay_table_exists',        (to_regclass('public.payment_autopay_arrangements') is not null),
        'autopay_rls',                 (select relrowsecurity from pg_class where oid='public.payment_autopay_arrangements'::regclass),
        'autopay_rls_forced',          (select relforcerowsecurity from pg_class where oid='public.payment_autopay_arrangements'::regclass),
        'autopay_triggers',            (select count(*) from pg_trigger
                                          where not tgisinternal and tgname in (
                                            'trg_enforce_autopay_authorization_immutability',
                                            'trg_enforce_autopay_status_transition')),
        'autopay_one_live_index',      (select count(*) from pg_indexes
                                          where tablename='payment_autopay_arrangements'
                                            and indexname='uq_autopay_one_live_per_account'),
        'autopay_policies',            (select count(*) from pg_policy where polrelid='public.payment_autopay_arrangements'::regclass),
        'ledger_has_w5',               (select count(*) from supabase_migrations.schema_migrations where version='20261004120000'),
        'payments_intact',             (to_regclass('public.payments') is not null),
        'payment_methods_intact_w2',   (to_regclass('public.payment_methods') is not null),
        'attempts_intact_w3',          (to_regclass('public.payment_collection_attempts') is not null),
        'holds_intact_w4',             (to_regclass('public.payment_holds') is not null),
        'clock_wake_count',            (select wake_count from public.scheduled_work_clock where id='singleton'),
        'clock_last_wake_at',          (select last_wake_at::text from public.scheduled_work_clock where id='singleton'),
        'clock_seconds_since_wake',    (select round(extract(epoch from (now() - last_wake_at)))
                                          from public.scheduled_work_clock where id='singleton'),
        'autopay_schedules',           (select count(*) from public.scheduled_work where handler_key='payments.autopay.evaluate'),
        'autopay_schedules_active',    (select count(*) from public.scheduled_work where handler_key='payments.autopay.evaluate' and is_active),
        'autopay_occurrences',         (select count(*) from public.scheduled_work_occurrences where handler_key='payments.autopay.evaluate'),
        'autopay_occurrences_done',    (select count(*) from public.scheduled_work_occurrences where handler_key='payments.autopay.evaluate' and status='completed'),
        'autopay_attempts',            (select count(*) from public.scheduled_work_attempts where handler_key='payments.autopay.evaluate'),
        'autopay_attempt_outcomes',    (select json_object_agg(coalesce(outcome,'in_flight'), n) from (
                                            select outcome, count(*) as n
                                            from public.scheduled_work_attempts
                                            where handler_key='payments.autopay.evaluate'
                                            group by outcome) o),
        'autopay_last_diagnostic',     (select diagnostic::text from public.scheduled_work_attempts
                                          where handler_key='payments.autopay.evaluate'
                                          order by started_at desc limit 1),
        'autopay_arrangements_total',  (select count(*) from public.payment_autopay_arrangements),
        'autopay_arrangements_live',   (select count(*) from public.payment_autopay_arrangements where status in ('active','paused'))
    )::text as payload;

-- RE-MEASURED after the deployed probes below, to confirm nothing was created by them:
--   · GET  /api/admin/financials/autopay            -> 200 {"arrangement":null,...}
--   · POST /api/admin/actions/execute autopay.enroll -> 404 method_not_found
--   · GET  /api/admin/financials/provider            -> readiness "not_connected"
