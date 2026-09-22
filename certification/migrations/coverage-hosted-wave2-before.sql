select 'coverage_wave2_before' as question_id, 'row' as kind,
  json_build_object(
    'repair_column_present', (select count(*) from information_schema.columns
        where table_schema='public' and table_name='staff_coverage_allocations'
          and column_name='cancel_reason_key'),
    'cancel_rpc_writes_cancel_reason', (select count(*) from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='staff_coverage_cancel'
          and pg_get_functiondef(p.oid) like '%cancel_reason_key = p_reason_key%'),
    'cancel_rpc_still_clobbers_reason', (select count(*) from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='staff_coverage_cancel'
          and pg_get_functiondef(p.oid) like '%reason_key = coalesce(p_reason_key%'),
    'ledger_has_repair_version', (select count(*) from supabase_migrations.schema_migrations
        where version = '20261013120000'),
    'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
    'staff_assignments_live', (select count(*) from public.schedule_assignments
        where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')),
    'staff_assignments_supply', (select count(*) from public.schedule_assignments sa
        join public.operational_assignment_types t on t.id=sa.operational_assignment_type_id
        where sa.subject_type='staff' and sa.commitment_kind='committed'
          and sa.status in ('planned','active','ending') and t.staffing_participation='supply'),
    'child_demand_assignments', (select count(*) from public.schedule_assignments
        where subject_type='child' and status in ('planned','active','ending')),
    'assignment_weekday_intervals', (select count(*) from public.assignment_weekday_intervals),
    'availability_windows', (select count(*) from public.staff_availability_windows),
    'availability_exceptions', (select count(*) from public.staff_availability_exceptions),
    'presence_events', (select count(*) from public.staff_presence_events),
    'coverage_total', (select count(*) from public.staff_coverage_allocations),
    'coverage_effective', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'coverage_rows_on_wave2_date', (select count(*) from public.staff_coverage_allocations
        where service_date = date '2027-04-02'),
    'observed_at', now()::text)::text as payload;
