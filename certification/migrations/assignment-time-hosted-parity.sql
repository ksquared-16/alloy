-- HOSTED PARITY FOR ASSIGNMENT TIME.
--
-- Local certification cannot certify this: every schedule_pattern in the certification
-- stack carries metadata = {} literally, so local parity contains ZERO known-hour
-- assignments. Staging has its own population and must prove the migration against it.
--
-- The expectation is RECONSTRUCTED, not a captured pre-migration snapshot: it is derived
-- from source the migration did not mutate -- the Assignment to pattern relationship,
-- the pattern's weekdays, and the pattern's metadata -- and compared against what was
-- materialized. Said plainly so nobody reads it as a real before-image.
--
-- Catalog-guarded: if the table is absent the whole census would fail to parse, so the
-- counts are wrapped to answer honestly either way.
select
  'hostedparity' as question_id,
  'row'          as kind,
  json_build_object(
    'table_present',            to_regclass('public.assignment_weekday_intervals') is not null,
    'ledger_has_schema',        exists (select 1 from supabase_migrations.schema_migrations where version='20261007120000'),
    'ledger_has_backfill',      exists (select 1 from supabase_migrations.schema_migrations where version='20261008120000'),
    'ledger_has_trigger',       exists (select 1 from supabase_migrations.schema_migrations where version='20261009120000'),

    'total_assignments',        (select count(*) from public.schedule_assignments),
    'child_assignments',        (select count(*) from public.schedule_assignments where subject_type='child'),
    'staff_assignments',        (select count(*) from public.schedule_assignments where subject_type='staff'),
    'with_pattern',             (select count(*) from public.schedule_assignments where schedule_pattern_id is not null),
    'without_pattern',          (select count(*) from public.schedule_assignments where schedule_pattern_id is null),

    'patterns_total',           (select count(*) from public.schedule_patterns),
    'patterns_with_weekdays',   (select count(*) from public.schedule_patterns where coalesce(cardinality(weekdays),0) > 0),
    'patterns_no_weekdays',     (select count(*) from public.schedule_patterns where coalesce(cardinality(weekdays),0) = 0),
    'patterns_hours_valid',     (select count(*) from public.schedule_patterns p where (select arrive from public.pattern_default_hours_compat(p.metadata)) is not null),
    'patterns_hours_absent',    (select count(*) from public.schedule_patterns p where p.metadata = '{}'::jsonb),
    'patterns_hours_malformed', (select count(*) from public.schedule_patterns p where p.metadata <> '{}'::jsonb and (select arrive from public.pattern_default_hours_compat(p.metadata)) is null),

    'assignments_known_hours',  (select count(*) from public.schedule_assignments sa join public.schedule_patterns p on p.id=sa.schedule_pattern_id and p.org_id=sa.org_id where (select arrive from public.pattern_default_hours_compat(p.metadata)) is not null),
    'assignments_unknown_hours',(select count(*) from public.schedule_assignments sa join public.schedule_patterns p on p.id=sa.schedule_pattern_id and p.org_id=sa.org_id where (select arrive from public.pattern_default_hours_compat(p.metadata)) is null),

    'expected_rows',            (select coalesce(sum(cardinality(p.weekdays)),0) from public.schedule_assignments sa join public.schedule_patterns p on p.id=sa.schedule_pattern_id and p.org_id=sa.org_id),
    'expected_known_rows',      (select coalesce(sum(cardinality(p.weekdays)),0) from public.schedule_assignments sa join public.schedule_patterns p on p.id=sa.schedule_pattern_id and p.org_id=sa.org_id where (select arrive from public.pattern_default_hours_compat(p.metadata)) is not null),
    'expected_unknown_rows',    (select coalesce(sum(cardinality(p.weekdays)),0) from public.schedule_assignments sa join public.schedule_patterns p on p.id=sa.schedule_pattern_id and p.org_id=sa.org_id where (select arrive from public.pattern_default_hours_compat(p.metadata)) is null),

    'actual_rows',              (select count(*) from public.assignment_weekday_intervals),
    'actual_known_rows',        (select count(*) from public.assignment_weekday_intervals where start_time is not null),
    'actual_unknown_rows',      (select count(*) from public.assignment_weekday_intervals where start_time is null),

    'orphans',                  (select count(*) from public.assignment_weekday_intervals i left join public.schedule_assignments s on s.id=i.assignment_id where s.id is null),
    'invalid_intervals',        (select count(*) from public.assignment_weekday_intervals where start_time is not null and end_time <= start_time),
    'partial_time_rows',        (select count(*) from public.assignment_weekday_intervals where (start_time is null) <> (end_time is null)),
    'hours_mismatch',           (select count(*) from public.assignment_weekday_intervals i join public.schedule_assignments sa on sa.id=i.assignment_id join public.schedule_patterns p on p.id=sa.schedule_pattern_id and p.org_id=sa.org_id where i.start_time is distinct from (select arrive from public.pattern_default_hours_compat(p.metadata))),
    'weekday_mismatch',         (select count(*) from public.assignment_weekday_intervals i join public.schedule_assignments sa on sa.id=i.assignment_id join public.schedule_patterns p on p.id=sa.schedule_pattern_id and p.org_id=sa.org_id where not (i.weekday = any(p.weekdays))),
    'observed_at',              now()::text
  )::text as payload;
