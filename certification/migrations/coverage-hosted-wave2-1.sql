select 'coverage_wave2_after_create' as question_id, 'row' as kind,
  json_build_object(
    'step', 'create_adjacency_overlap_refusal',
    'rows_on_date', (select coalesce(json_agg(json_build_object(
                    'id', a.id, 'employment', a.employment_id, 'state', a.lifecycle_state,
                    'transition', a.transition_type, 'supersedes', a.supersedes_coverage_id,
                    'root', a.lineage_root_id, 'start', a.start_time::text, 'end', a.end_time::text,
                    'room', a.room_location_id, 'site', a.site_location_id,
                    'reason', a.reason_key, 'cancel_reason', a.cancel_reason_key,
                    'created_at', a.created_at::text) order by a.created_at, a.id),'[]'::json)
                from public.staff_coverage_allocations a
                where a.service_date = date '2027-04-02'),
    'effective_by_employment', (select coalesce(json_agg(r.id order by r.id),'[]'::json)
                from public.staff_coverage_effective_for_employment(
                    '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
                    '14a42234-82cf-4b3e-87d4-b43175e9b06c'::uuid,
                    date '2027-04-02', date '2027-04-02') r),
    'effective_by_place', (select coalesce(json_agg(r.id order by r.id),'[]'::json)
                from public.staff_coverage_effective_for_site(
                    '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
                    '1a5644a7-45c4-413b-9021-5f556118b6e2'::uuid,
                    date '2027-04-02', date '2027-04-02', null) r),
    'rows_on_date_count', (select count(*) from public.staff_coverage_allocations
                where service_date = date '2027-04-02'),
    'effective_anywhere', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'total_rows', (select count(*) from public.staff_coverage_allocations),
    'observed_at', now()::text)::text as payload;
