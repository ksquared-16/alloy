select 'coverage_wave2_after_correct' as question_id, 'row' as kind,
  json_build_object(
    'step', 'revision_correction_refusal_battery',
    'rows_on_date', (select coalesce(json_agg(json_build_object(
                    'id', a.id, 'employment', a.employment_id, 'state', a.lifecycle_state,
                    'transition', a.transition_type, 'supersedes', a.supersedes_coverage_id,
                    'root', a.lineage_root_id, 'start', a.start_time::text, 'end', a.end_time::text,
                    'room', a.room_location_id, 'site', a.site_location_id,
                    'reason', a.reason_key, 'cancel_reason', a.cancel_reason_key,
                    'created_by', a.created_by, 'created_at', a.created_at::text) order by a.created_at, a.id),'[]'::json)
                from public.staff_coverage_allocations a
                where a.service_date = date '2027-04-02'),
    'effective_by_employment_x', (select coalesce(json_agg(r.id order by r.id),'[]'::json)
                from public.staff_coverage_effective_for_employment(
                    '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
                    '14a42234-82cf-4b3e-87d4-b43175e9b06c'::uuid,
                    date '2027-04-02', date '2027-04-02') r),
    'effective_by_employment_y', (select coalesce(json_agg(r.id order by r.id),'[]'::json)
                from public.staff_coverage_effective_for_employment(
                    '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
                    '5abb0bdb-f986-4c8e-b70f-6b7168c62dce'::uuid,
                    date '2027-04-02', date '2027-04-02') r),
    'effective_by_place', (select coalesce(json_agg(r.id order by r.id),'[]'::json)
                from public.staff_coverage_effective_for_site(
                    '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
                    '1a5644a7-45c4-413b-9021-5f556118b6e2'::uuid,
                    date '2027-04-02', date '2027-04-02', null) r),
    'effective_by_place_site_b', (select coalesce(json_agg(r.id order by r.id),'[]'::json)
                from public.staff_coverage_effective_for_site(
                    '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
                    'ae34d822-60ef-4f82-81eb-8f3513059627'::uuid,
                    date '2027-04-02', date '2027-04-02', null) r),
    'shared_room_same_time', (select count(*) from public.staff_coverage_allocations a
                join public.staff_coverage_allocations b
                  on b.service_date=a.service_date and b.room_location_id=a.room_location_id
                 and b.id<>a.id and b.employment_id<>a.employment_id
                 and b.lifecycle_state='active' and a.lifecycle_state='active'
                 and b.start_time=a.start_time
                where a.service_date = date '2027-04-02' and a.room_location_id is not null),
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
    'effective_anywhere', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'total_rows', (select count(*) from public.staff_coverage_allocations),
    'observed_at', now()::text)::text as payload;
