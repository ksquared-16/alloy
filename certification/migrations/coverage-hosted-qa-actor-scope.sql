select 'coverage_qa_actor_scope' as question_id, 'row' as kind,
  json_build_object(
    'actor_roles', (select coalesce(json_agg(json_build_object(
            'org_id', ur.org_id, 'role', ur.role) order by ur.org_id, ur.role),'[]'::json)
        from public.user_roles ur
        where ur.user_id = 'a92a0f18-6efb-40d0-b74f-52708e96fb03'::uuid),
    'actor_site_access_columns', (select coalesce(json_agg(column_name order by column_name),'[]'::json)
        from information_schema.columns
        where table_schema='public' and table_name='user_roles'),
    'orgs_with_active_employment', (select count(distinct e.org_id) from public.employments e
        where e.employment_status <> 'canceled'),
    'sites_in_org', (select coalesce(json_agg(l.id order by l.id),'[]'::json) from public.locations l
        where l.org_id='93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid and l.location_type='site'),
    'room_b1_site', (select public.location_site_id('17cf540d-6c64-4ba4-926b-f2b9644b3391'::uuid)),
    'room_a1_site', (select public.location_site_id('091eb9b7-b191-46ef-975e-a6b3972fbd86'::uuid)),
    'employment_z_window', (select json_build_object('start', e.start_date, 'end', e.end_date, 'status', e.employment_status)
        from public.employments e where e.id='978e5cda-25a2-42db-a3e9-19f3afca2c5f'::uuid),
    'observed_at', now()::text)::text as payload;
