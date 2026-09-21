select 'coverage_lifecycle_after_correct' as question_id, 'row' as kind,
  json_build_object(
    'step', 'after_correct',
    'lineage', (select coalesce(json_agg(json_build_object(
                    'id', a.id, 'state', a.lifecycle_state, 'transition', a.transition_type,
                    'supersedes', a.supersedes_coverage_id, 'root', a.lineage_root_id,
                    'start', a.start_time::text, 'end', a.end_time::text,
                    'room', a.room_location_id, 'site', a.site_location_id,
                    'created_by', a.created_by, 'created_at', a.created_at::text,
                    'cancelled_by', a.cancelled_by, 'cancelled_at', a.cancelled_at::text,
                    'reason', a.reason_key, 'source', a.source_key) order by a.created_at, a.id),'[]'::json)
                from public.staff_coverage_allocations a
                where a.service_date = date '2027-04-01'),
    'effective_by_employment', (select coalesce(json_agg(r.id order by r.id),'[]'::json)
                from public.employments e
                cross join lateral public.staff_coverage_effective_for_employment(
                    e.org_id, e.id, date '2027-04-01', date '2027-04-01') r
                where e.id in ('14a42234-82cf-4b3e-87d4-b43175e9b06c','5abb0bdb-f986-4c8e-b70f-6b7168c62dce')),
    'effective_by_place', (select coalesce(json_agg(r.id order by r.id),'[]'::json)
                from public.staff_coverage_effective_for_site(
                    '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
                    '1a5644a7-45c4-413b-9021-5f556118b6e2'::uuid,
                    date '2027-04-01', date '2027-04-01', null) r),
    'observed_at', now()::text)::text as payload;
