-- REAL-CLOCK CERTIFICATION READING 4.
-- Read-only. The credential's VALUE is never selected -- only its presence is counted,
-- and the cron command is scanned for a literal bearer rather than printed.
select
  'tick4' as question_id,
  'row'     as kind,
  json_build_object(
    'credential_in_vault',   exists (select 1 from vault.secrets where name = 'scheduled_work_wake_credential'),
    'cron_active',           coalesce((select active from cron.job where jobname='scheduled-work-clock'), false),
    'cron_cmd_has_literal_bearer',
        coalesce((select command ~* 'bearer[[:space:]]+[A-Za-z0-9._-]{8,}' from cron.job where jobname='scheduled-work-clock'), false),
    'cron_cmd_reads_vault',
        coalesce((select command like '%vault.decrypted_secrets%' from cron.job where jobname='scheduled-work-clock'), false),
    'cron_runs_recorded',    (select count(*) from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='scheduled-work-clock'),
    'cron_last_run_status',  (select d.status from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='scheduled-work-clock' order by d.start_time desc limit 1),
    'cron_last_run_at',      (select d.start_time::text from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='scheduled-work-clock' order by d.start_time desc limit 1),
    'cron_last_return',      (select left(coalesce(d.return_message,''),120) from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='scheduled-work-clock' order by d.start_time desc limit 1),
    'wake_count',            (select wake_count from public.scheduled_work_clock where id='singleton'),
    'last_wake_at',          (select last_wake_at::text from public.scheduled_work_clock where id='singleton'),
    'last_worker_id',        (select last_worker_id from public.scheduled_work_clock where id='singleton'),
    'last_summary',          (select last_summary from public.scheduled_work_clock where id='singleton'),
    'probe_schedule_active', (select is_active from public.scheduled_work where label='clock_activation_certification'),
    'probe_next_due_at',     (select next_due_at::text from public.scheduled_work where label='clock_activation_certification'),
    'probe_occurrences',     (select count(*) from public.scheduled_work_occurrences o join public.scheduled_work s on s.id=o.scheduled_work_id where s.label='clock_activation_certification'),
    'probe_occ_statuses',    (select coalesce(json_agg(o.status order by o.due_at), '[]'::json) from public.scheduled_work_occurrences o join public.scheduled_work s on s.id=o.scheduled_work_id where s.label='clock_activation_certification'),
    'probe_attempts',        (select count(*) from public.scheduled_work_attempts a join public.scheduled_work_occurrences o on o.id=a.occurrence_id join public.scheduled_work s on s.id=o.scheduled_work_id where s.label='clock_activation_certification'),
    'probe_attempt_outcomes',(select coalesce(json_agg(a.outcome order by a.attempt_number), '[]'::json) from public.scheduled_work_attempts a join public.scheduled_work_occurrences o on o.id=a.occurrence_id join public.scheduled_work s on s.id=o.scheduled_work_id where s.label='clock_activation_certification'),
    'probe_diagnostic',      (select a.diagnostic from public.scheduled_work_attempts a join public.scheduled_work_occurrences o on o.id=a.occurrence_id join public.scheduled_work s on s.id=o.scheduled_work_id where s.label='clock_activation_certification' order by a.attempt_number desc limit 1),
    'net_queue_grants_app_roles', (select count(*) from information_schema.role_table_grants where table_schema='net' and table_name='http_request_queue' and grantee in ('authenticated','anon','public')),
    'vault_grants_app_roles',     (select count(*) from information_schema.role_table_grants where table_schema='vault' and grantee in ('authenticated','anon','public')),
    'observed_at',           now()::text
  )::text as payload;
