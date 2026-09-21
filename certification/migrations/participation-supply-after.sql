-- HOSTED STAFF SUPPLY, AFTER the classification migration.
-- Same query, distinct artifact: a census dedupes within a run.
-- "Eligible today" is exactly what buildStaffSupply counts before the cutover: the
-- existing filters with no participation involvement at all.
select 'after' as question_id, 'row' as kind,
  json_build_object(
    'eligible_staff_supply',   (select count(*) from public.schedule_assignments
                                where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')),
    'would_survive_cutover',   (select count(*) from public.schedule_assignments sa
                                join public.operational_assignment_types t on t.id=sa.operational_assignment_type_id
                                where sa.subject_type='staff' and sa.commitment_kind='committed' and sa.status in ('planned','active','ending')
                                  and t.staffing_participation='supply'),
    'untyped_staff_supply',    (select count(*) from public.schedule_assignments
                                where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')
                                  and operational_assignment_type_id is null),
    'staff_supply_by_type',    (select coalesce(json_agg(json_build_object('org',t.org_id,'key',t.key,'participation',t.staffing_participation,'n',c.n)),'[]'::json)
                                from (select sa.operational_assignment_type_id tid, count(*) n from public.schedule_assignments sa
                                      where sa.subject_type='staff' and sa.commitment_kind='committed' and sa.status in ('planned','active','ending') group by 1) c
                                join public.operational_assignment_types t on t.id=c.tid),
    'child_demand_assignments',(select count(*) from public.schedule_assignments where subject_type='child' and status in ('planned','active','ending')),
    'child_untyped',           (select count(*) from public.schedule_assignments where subject_type='child' and status in ('planned','active','ending') and operational_assignment_type_id is null),
    'types_active',            (select count(*) from public.operational_assignment_types where is_active),
    'staff_capable_active',    (select count(*) from public.operational_assignment_types where is_active and 'staff'=any(subject_types)),
    'staff_capable_supply',    (select count(*) from public.operational_assignment_types where is_active and 'staff'=any(subject_types) and staffing_participation='supply'),
    'staff_capable_none',      (select count(*) from public.operational_assignment_types where is_active and 'staff'=any(subject_types) and staffing_participation='none'),
    'unresolved_supply_types', (select count(*) from public.staff_supply_participation_unresolved()),
    'untyped_staff_reported',  (select count(*) from public.staff_supply_untyped_assignments()),
    'observed_at', now()::text)::text as payload;
