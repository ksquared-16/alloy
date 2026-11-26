-- Clock reading 1 of 2 — the real-external-wake observation.
-- Two artifacts because a census dedupes within a run: a before/after needs two
-- distinct queries, not the same one filed twice.
-- The table is known present (censused post-apply), so selecting from it is safe.
select
  'reading1' as question_id,
  'row'       as kind,
  json_build_object(
    'reading',        1,
    'wake_count',     (select wake_count from public.scheduled_work_clock where id = 'singleton'),
    'first_wake_at',  (select first_wake_at::text from public.scheduled_work_clock where id = 'singleton'),
    'last_wake_at',   (select last_wake_at::text from public.scheduled_work_clock where id = 'singleton'),
    'last_worker_id', (select last_worker_id from public.scheduled_work_clock where id = 'singleton'),
    'last_summary',   (select last_summary from public.scheduled_work_clock where id = 'singleton'),
    'observed_at',    now()::text
  )::text as payload;
