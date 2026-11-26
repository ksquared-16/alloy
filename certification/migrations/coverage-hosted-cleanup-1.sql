select 'coverage_cleanup_wave_one' as question_id, 'row' as kind,
  json_build_object(
    'effective_anywhere', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'total_rows', (select count(*) from public.staff_coverage_allocations),
    'by_state', (select coalesce(json_object_agg(s.lifecycle_state, s.n),'{}'::json)
                 from (select lifecycle_state, count(*) n from public.staff_coverage_allocations
                       group by lifecycle_state) s),
    'history_preserved', (select coalesce(json_agg(json_build_object(
                    'id', a.id, 'state', a.lifecycle_state, 'transition', a.transition_type,
                    'root', a.lineage_root_id, 'start', a.start_time::text, 'end', a.end_time::text,
                    'room', a.room_location_id, 'employment', a.employment_id,
                    'reason', a.reason_key, 'cancelled_by', a.cancelled_by) order by a.created_at),'[]'::json)
                 from public.staff_coverage_allocations a
                 where a.service_date = date '2027-04-01'),
    'shared_room_same_time', (select count(*) from public.staff_coverage_allocations a
                 join public.staff_coverage_allocations b
                   on b.service_date=a.service_date and b.room_location_id=a.room_location_id
                  and b.start_time=a.start_time and b.employment_id <> a.employment_id
                 where a.service_date = date '2027-04-01' and a.room_location_id is not null),
    'staff_assignments_live', (select count(*) from public.schedule_assignments
        where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')),
    'child_demand_assignments', (select count(*) from public.schedule_assignments
        where subject_type='child' and status in ('planned','active','ending')),
    'observed_at', now()::text)::text as payload;
