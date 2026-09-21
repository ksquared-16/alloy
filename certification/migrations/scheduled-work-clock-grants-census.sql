-- Can the deployed app actually WRITE the clock?
-- If service_role lost EXECUTE on record_scheduled_work_wake, recordWake returns null
-- and wake_count stays 0 forever — indistinguishable from a cron that never fired,
-- which is the precise ambiguity the clock exists to remove. Rule it out in the
-- catalog rather than inferring it from a reading that stays flat.
select
  'gswgrants' as question_id,
  'row'       as kind,
  json_build_object(
    'fn_exec_service_role',  (select count(*) from information_schema.role_routine_grants g where g.routine_schema='public' and g.routine_name='record_scheduled_work_wake' and g.grantee='service_role' and g.privilege_type='EXECUTE'),
    'fn_exec_postgres',      (select count(*) from information_schema.role_routine_grants g where g.routine_schema='public' and g.routine_name='record_scheduled_work_wake' and g.grantee='postgres' and g.privilege_type='EXECUTE'),
    'fn_all_grantees',       (select coalesce(json_agg(distinct g.grantee), '[]'::json) from information_schema.role_routine_grants g where g.routine_schema='public' and g.routine_name='record_scheduled_work_wake'),
    'tbl_service_role',      (select count(*) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name='scheduled_work_clock' and g.grantee='service_role'),
    'tbl_all_grantees',      (select coalesce(json_agg(distinct g.grantee), '[]'::json) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name='scheduled_work_clock'),
    'observed_at',           now()::text
  )::text as payload;
