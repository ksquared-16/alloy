-- Payments V1 · W5 — DOES THE DEPLOYED PLATFORM HAVE A CLOCK? Read only, ONE statement.
--
-- W5's gate asks whether a generic governed scheduling primitive already exists, to be reused
-- rather than duplicated. Source inventory says the platform has AUTHENTICATION for a clock
-- (isInternalCronAuthorized on three endpoints) and no clock: no `crons` key in web/vercel.json,
-- no pg_cron, no scheduled GitHub Actions workflow for the app, no in-process scheduler in the
-- Python backend. That is an argument from absence, and absence is the one thing a source grep
-- proves least well.
--
-- So this measures the deployed primary instead. `communication_scheduled_sends` is the platform's
-- only working due-queue: rows are written with a future `scheduled_for` and a `process-due`
-- endpoint claims them (pending -> claimed -> queued -> sent). If a clock runs anywhere, rows go
-- past `scheduled_for` and then LEAVE 'pending'. Rows sitting pending long after their due time,
-- with nothing ever having been claimed, is positive evidence that nothing wakes this platform.
--
-- `recurrence_plans` is the only table in the schema carrying `next_run_at`; source shows no
-- reader and no advancer. Overdue rows there measure the same absence a second way.
select
    'w5_platform_clock' as question_id,
    'row' as kind,
    json_build_object(
        -- THE DUE-QUEUE: does anything drain it?
        'sched_sends_table_exists',    (to_regclass('public.communication_scheduled_sends') is not null),
        'sched_sends_total',           (select count(*) from public.communication_scheduled_sends),
        'sched_sends_pending',         (select count(*) from public.communication_scheduled_sends where status='pending'),
        'sched_sends_pending_overdue', (select count(*) from public.communication_scheduled_sends where status='pending' and scheduled_for < now()),
        'sched_sends_ever_claimed',    (select count(*) from public.communication_scheduled_sends where claimed_at is not null),
        'sched_sends_ever_left_pending',(select count(*) from public.communication_scheduled_sends where status <> 'pending'),
        'sched_sends_oldest_overdue_days', (select round(extract(epoch from (now() - min(scheduled_for)))/86400.0, 1)
                                              from public.communication_scheduled_sends where status='pending' and scheduled_for < now()),
        -- THE ONLY RECURRENCE TABLE: is next_run_at ever advanced?
        'recurrence_plans_exists',     (to_regclass('public.recurrence_plans') is not null),
        'recurrence_plans_total',      (select count(*) from public.recurrence_plans),
        'recurrence_plans_active',     (select count(*) from public.recurrence_plans where status='active'),
        'recurrence_plans_overdue',    (select count(*) from public.recurrence_plans where next_run_at is not null and next_run_at < now()),
        -- W5 has mutated nothing: no autopay object may exist yet.
        'autopay_table_absent',        (to_regclass('public.payment_autopay_arrangements') is null),
        -- The W1-W4 spine, unchanged.
        'payments_intact',             (to_regclass('public.payments') is not null),
        'payment_methods_intact_w2',   (to_regclass('public.payment_methods') is not null),
        'attempts_intact_w3',          (to_regclass('public.payment_collection_attempts') is not null),
        'holds_intact_w4',             (to_regclass('public.payment_holds') is not null)
    )::text as payload;
