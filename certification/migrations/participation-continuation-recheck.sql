select 'recheck' as question_id, 'row' as kind,
 json_build_object(
  'staff_capable_active', (select count(*) from public.operational_assignment_types where is_active and 'staff'=any(subject_types)),
  'staff_capable_none',   (select count(*) from public.operational_assignment_types where is_active and 'staff'=any(subject_types) and staffing_participation='none'),
  'staff_capable_supply', (select count(*) from public.operational_assignment_types where is_active and 'staff'=any(subject_types) and staffing_participation='supply'),
  'staff_capable_keys',   (select coalesce(json_agg(distinct key),'[]'::json) from public.operational_assignment_types where is_active and 'staff'=any(subject_types)),
  'staff_supply_today',   (select count(*) from public.schedule_assignments where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')),
  'untyped_staff',        (select count(*) from public.schedule_assignments where operational_assignment_type_id is null and subject_type='staff' and status in ('planned','active','ending')),
  'observed_at', now()::text)::text as payload;
