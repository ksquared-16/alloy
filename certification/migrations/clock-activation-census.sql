-- Post-apply verification of the staging clock.
-- Catalog-first: pg_cron may be available yet fail to install if it is not
-- preloaded on the hosted project, and the apply reporting ok is a label, not a
-- guarantee that the objects exist. The credential is deliberately NOT read; only
-- its presence is counted, and the cron command is scanned for a literal bearer
-- rather than printed.
select
  'clockact' as question_id,
  'row'      as kind,
  json_build_object(
    'pg_cron_installed',   exists (select 1 from pg_extension where extname='pg_cron'),
    'pg_net_installed',    exists (select 1 from pg_extension where extname='pg_net'),
    'cron_job_present',    exists (select 1 from cron.job where jobname='scheduled-work-clock'),
    'cron_schedule',       (select schedule from cron.job where jobname='scheduled-work-clock'),
    'cron_active',         (select active from cron.job where jobname='scheduled-work-clock'),
    'cron_cmd_has_literal_bearer',
        coalesce((select command ~* 'bearer[[:space:]]+[A-Za-z0-9._-]{8,}' from cron.job where jobname='scheduled-work-clock'), false),
    'cron_cmd_reads_vault',
        coalesce((select command like '%vault.decrypted_secrets%' from cron.job where jobname='scheduled-work-clock'), false),
    'credential_in_vault', exists (select 1 from vault.secrets where name='scheduled_work_wake_credential'),
    'probe_present',       exists (select 1 from public.scheduled_work where label='clock_activation_certification'),
    'probe_due_now',       exists (select 1 from public.scheduled_work where label='clock_activation_certification' and is_active and next_due_at <= now()),
    'probe_handler',       (select handler_key from public.scheduled_work where label='clock_activation_certification'),
    'clock_wake_count',    (select wake_count from public.scheduled_work_clock where id='singleton'),
    'clock_last_wake_at',  (select last_wake_at::text from public.scheduled_work_clock where id='singleton'),
    'cron_runs_recorded',  (select count(*) from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='scheduled-work-clock'),
    'observed_at',         now()::text
  )::text as payload;
