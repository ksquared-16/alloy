-- SLICE 2 PHASE 0B — every Assignment Type, not only the seeded defaults.
-- Read-only. Establishes whether classification is safe and where ambiguity lives.
select
  'ptcensus' as question_id,
  'row'      as kind,
  json_build_object(
    'types', (
      select coalesce(json_agg(json_build_object(
        'org', t.org_id,
        'key', t.key,
        'label', t.label,
        'subject_types', t.subject_types,
        'active', t.is_active,
        'participation', t.staffing_participation,
        'billing', t.billing_participation,
        'attendance', t.attendance_participation,
        'assignments_total', (select count(*) from public.schedule_assignments sa where sa.operational_assignment_type_id = t.id),
        'assignments_child', (select count(*) from public.schedule_assignments sa where sa.operational_assignment_type_id = t.id and sa.subject_type='child'),
        'assignments_staff', (select count(*) from public.schedule_assignments sa where sa.operational_assignment_type_id = t.id and sa.subject_type='staff'),
        'assignments_active', (select count(*) from public.schedule_assignments sa where sa.operational_assignment_type_id = t.id and sa.status in ('planned','active','ending')),
        'staff_capable', 'staff' = any(t.subject_types),
        'child_capable', 'child' = any(t.subject_types)
      ) order by t.key), '[]'::json)
      from public.operational_assignment_types t
    ),
    'totals', json_build_object(
      'types_total',              (select count(*) from public.operational_assignment_types),
      'types_active',             (select count(*) from public.operational_assignment_types where is_active),
      'staff_capable_active',     (select count(*) from public.operational_assignment_types where is_active and 'staff' = any(subject_types)),
      'staff_capable_none',       (select count(*) from public.operational_assignment_types where is_active and 'staff' = any(subject_types) and staffing_participation='none'),
      'staff_capable_supply',     (select count(*) from public.operational_assignment_types where is_active and 'staff' = any(subject_types) and staffing_participation='supply'),
      'child_capable_active',     (select count(*) from public.operational_assignment_types where is_active and 'child' = any(subject_types)),
      'child_capable_demand',     (select count(*) from public.operational_assignment_types where is_active and 'child' = any(subject_types) and staffing_participation='demand'),
      'child_capable_none',       (select count(*) from public.operational_assignment_types where is_active and 'child' = any(subject_types) and staffing_participation='none'),
      'mixed_subject_types',      (select count(*) from public.operational_assignment_types where is_active and cardinality(subject_types) > 1),
      'orgs_with_types',          (select count(distinct org_id) from public.operational_assignment_types)
    ),
    -- The demand-side hazard: child assignments on a 'none' type contribute demand TODAY,
    -- because the expectation engine never reads the type. Cutover would remove them.
    'child_assignments_on_none_types', (
      select count(*) from public.schedule_assignments sa
      join public.operational_assignment_types t on t.id = sa.operational_assignment_type_id
      where sa.subject_type='child' and t.staffing_participation='none' and sa.status in ('planned','active','ending')
    ),
    'staff_assignments_on_none_types', (
      select count(*) from public.schedule_assignments sa
      join public.operational_assignment_types t on t.id = sa.operational_assignment_type_id
      where sa.subject_type='staff' and t.staffing_participation='none' and sa.status in ('planned','active','ending')
    ),
    'assignments_without_type', (
      select count(*) from public.schedule_assignments where operational_assignment_type_id is null and status in ('planned','active','ending')
    ),
    'observed_at', now()::text
  )::text as payload;
