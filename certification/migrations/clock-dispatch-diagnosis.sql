-- WHY does the cron fire and the wake not arrive?
-- Reads only the RESPONSE side of pg_net plus queue depth. Request headers are never
-- selected, so the credential cannot appear in this evidence.
select
  'dispatch' as question_id,
  'row'      as kind,
  json_build_object(
    'responses_total',     (select count(*) from net._http_response),
    'recent_status_codes', (select coalesce(json_agg(json_build_object('id',id,'status',status_code,'created',created::text) order by created desc), '[]'::json)
                            from (select id, status_code, created from net._http_response order by created desc limit 8) t),
    'recent_errors',       (select coalesce(json_agg(json_build_object('id',id,'err',left(coalesce(error_msg,''),160),'created',created::text) order by created desc), '[]'::json)
                            from (select id, error_msg, created from net._http_response where error_msg is not null order by created desc limit 8) t),
    'recent_bodies',       (select coalesce(json_agg(left(coalesce(content,''),200) order by created desc), '[]'::json)
                            from (select content, created from net._http_response order by created desc limit 4) t),
    'queue_depth',         (select count(*) from net.http_request_queue),
    'cron_runs',           (select count(*) from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='scheduled-work-clock'),
    'cron_recent',         (select coalesce(json_agg(json_build_object('at',start_time::text,'status',status,'ret',left(coalesce(return_message,''),60)) order by start_time desc), '[]'::json)
                            from (select d.start_time, d.status, d.return_message from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='scheduled-work-clock' order by d.start_time desc limit 5) t),
    'wake_url_override_set', exists (select 1 from vault.secrets where name='scheduled_work_wake_url'),
    'observed_at',         now()::text
  )::text as payload;
