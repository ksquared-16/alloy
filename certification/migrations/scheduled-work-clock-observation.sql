-- Is there anything in staging for a wake to DO, and did any wake leave a trace?
-- Catalog-safe: the three tables were proven present by
-- governed-scheduled-work-staging-census.sql before this query was written.
select
  'clock1' as question_id,
  'row'    as kind,
  json_build_object(
    'schedules',        (select count(*) from public.scheduled_work),
    'active_schedules', (select count(*) from public.scheduled_work where is_active),
    'occurrences',      (select count(*) from public.scheduled_work_occurrences),
    'attempts',         (select count(*) from public.scheduled_work_attempts),
    'latest_attempt',   (select max(created_at)::text from public.scheduled_work_attempts),
    'observed_at',      now()::text
  )::text as payload;
