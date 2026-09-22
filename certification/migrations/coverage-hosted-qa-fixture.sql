select 'coverage_qa_fixture' as question_id, 'row' as kind,
  json_build_object(
    'candidate_sites', (select coalesce(json_agg(x order by x->>'site_id'),'[]'::json) from (
        select json_build_object(
          'org_id', s.org_id,
          'site_id', s.id,
          'rooms', (select coalesce(json_agg(r.id order by r.id),'[]'::json) from public.locations r
                    where r.org_id=s.org_id and r.location_type <> 'site'
                      and public.location_site_id(r.id)=s.id),
          'staff', (select coalesce(json_agg(json_build_object(
                        'employment_id', e.id, 'person_id', e.person_id,
                        'start_date', e.start_date, 'end_date', e.end_date) order by e.id),'[]'::json)
                    from public.employments e
                    where e.org_id=s.org_id and e.employment_status <> 'canceled'
                    limit 5)
        ) as x
        from public.locations s
        where s.location_type='site'
          and exists (select 1 from public.locations r where r.org_id=s.org_id and r.location_type <> 'site'
                      and public.location_site_id(r.id)=s.id)
          and exists (select 1 from public.employments e where e.org_id=s.org_id and e.employment_status <> 'canceled')
        limit 6) t),
    'existing_coverage_rows', (select count(*) from public.staff_coverage_allocations),
    'existing_effective_rows', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'observed_at', now()::text)::text as payload;
