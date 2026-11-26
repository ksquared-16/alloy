select 'assignment_time_authoring' as question_id, 'row' as kind,
  json_build_object(
    'function_present', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='set_assignment_weekday_intervals'),
    'function_replaces_week', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='set_assignment_weekday_intervals'
          and pg_get_functiondef(p.oid) like '%delete from public.assignment_weekday_intervals%'),
    'ledger_has_version', (select count(*) from supabase_migrations.schema_migrations where version='20261014120000'),
    'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
    'child_assignments_with_known_hours', (select count(distinct sa.id)
        from public.schedule_assignments sa
        join public.assignment_weekday_intervals i on i.assignment_id = sa.id
        where sa.subject_type='child' and i.start_time is not null),
    'observed_at', now()::text)::text as payload;
