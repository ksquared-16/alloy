-- Documents D9-H2: is the staging scheduled-work clock running now? (W-ES, D9-H2-HOSTED-RUN-ORDER.md section 2)
-- Read-only. One singleton row of public.scheduled_work_clock (present on staging since 20260930120000) and now().
--   CHECKS
--     d9w_clock_woke_within_15m   last_wake_at is within 15 minutes of the census (the wake runs every 5 minutes)
--   DATA d9w_clock: wake_count, first/last wake, last worker, the keys of last_summary, the age of the last wake.
select question_id, kind, payload
from (
    select 'd9w_clock_woke_within_15m'::text as question_id, 'check'::text as kind,
           'scheduled_work_clock ~ last_wake_within_15m ~ true ~ '
           || coalesce((select last_wake_at > now() - interval '15 minutes' from public.scheduled_work_clock where id = 'singleton'), false)::text as payload,
           '01'::text as sort_key
    union all
    select 'd9w_clock', 'data',
           coalesce((select json_build_object(
                        'wake_count', wake_count,
                        'first_wake_at', first_wake_at,
                        'last_wake_at', last_wake_at,
                        'last_wake_age_s', round(extract(epoch from now() - last_wake_at)),
                        'last_worker_id', last_worker_id,
                        'last_summary_keys', (select coalesce(json_agg(k order by k), '[]'::json) from jsonb_object_keys(coalesce(last_summary, '{}'::jsonb)) k),
                        'observed_at', now())
                     from public.scheduled_work_clock where id = 'singleton'), json_build_object('row', 'absent', 'observed_at', now()))::text,
           '02'
) q
order by sort_key;
