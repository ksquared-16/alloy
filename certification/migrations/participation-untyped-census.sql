-- What does participation MEAN for an Assignment carrying no Assignment Type?
-- The demand engine never reads the type, so untyped assignments contribute demand today.
select 'untyped' as question_id, 'row' as kind,
  json_build_object(
    'untyped_active_total', (select count(*) from public.schedule_assignments where operational_assignment_type_id is null and status in ('planned','active','ending')),
    'untyped_child',        (select count(*) from public.schedule_assignments where operational_assignment_type_id is null and subject_type='child' and status in ('planned','active','ending')),
    'untyped_staff',        (select count(*) from public.schedule_assignments where operational_assignment_type_id is null and subject_type='staff' and status in ('planned','active','ending')),
    'typed_staff_active',   (select count(*) from public.schedule_assignments where operational_assignment_type_id is not null and subject_type='staff' and status in ('planned','active','ending')),
    'typed_child_active',   (select count(*) from public.schedule_assignments where operational_assignment_type_id is not null and subject_type='child' and status in ('planned','active','ending')),
    'staff_supply_today',   (select count(*) from public.schedule_assignments where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')),
    'staff_supply_by_type', (select coalesce(json_agg(json_build_object('type', coalesce(t.key,'(untyped)'), 'participation', coalesce(t.staffing_participation,'(none-type)'), 'n', c.n)), '[]'::json)
                             from (select sa.operational_assignment_type_id tid, count(*) n from public.schedule_assignments sa
                                   where sa.subject_type='staff' and sa.commitment_kind='committed' and sa.status in ('planned','active','ending')
                                   group by 1) c
                             left join public.operational_assignment_types t on t.id = c.tid),
    'observed_at', now()::text)::text as payload;
