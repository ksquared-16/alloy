with qa(id) as (values
  ('ba05df72-53db-4e56-89aa-d45d62a01027'::uuid),('92207313-d1cc-4141-b56b-118b3c3bc644'::uuid),
  ('50bceb7d-fed5-418d-9550-faa2fe5a549e'::uuid),('7e78c696-c93c-41fc-9373-12c24d76f50e'::uuid),
  ('62a8916c-de49-43dd-8bce-2dd5441a1651'::uuid),('db53757a-9eab-44de-a2df-fd1466ea4957'::uuid),
  ('6056e4f3-125a-46e4-94a5-01a4b00244b1'::uuid),('1d15889a-f6d4-4f03-9284-894def33c72a'::uuid),
  ('e54a9d97-3c68-4a57-9ea3-530688f30eaf'::uuid),('1a1ad289-7d15-4178-8fb6-737e888f4211'::uuid),
  ('88bdec35-446a-4115-9f02-57135baad1f8'::uuid))
select 'qa_space_disposability' as question_id, 'row' as kind,
  json_build_object(
    'business_history_per_space', (
      select coalesce(json_agg(json_build_object(
          'label', l.label,
          'attendance_room', (select count(*) from public.child_attendance_events e
              where e.room_location_id=q.id or e.from_room_location_id=q.id or e.to_room_location_id=q.id),
          'placements', (select count(*) from public.child_placements p where p.room_location_id=q.id),
          'schedule_assignments', (select count(*) from public.schedule_assignments a where a.room_location_id=q.id),
          'staff_presence', (select count(*) from public.staff_presence_events s where s.room_location_id=q.id),
          'coverage', (select count(*) from public.staff_coverage_allocations c where c.room_location_id=q.id),
          'capacity_rules', (select count(*) from public.childcare_capacity_rules r where r.room_location_id=q.id),
          'ratio_rules', (select count(*) from public.childcare_ratio_rules r where r.room_location_id=q.id),
          'operating_windows', (select count(*) from public.childcare_operating_windows r where r.room_location_id=q.id),
          'schedule_rules', (select count(*) from public.childcare_schedule_rules r where r.room_location_id=q.id),
          'rate_plans', (select count(*) from public.childcare_rate_plans r where r.room_location_id=q.id),
          'program_categories', (select count(*) from public.location_program_categories c where c.location_id=q.id),
          'location_tags', (select count(*) from public.location_tags t where t.location_id=q.id),
          'person_locations', (select count(*) from public.person_locations p where p.location_id=q.id),
          'employments', (select count(*) from public.employments e where e.primary_location_id=q.id),
          'jobs', (select count(*) from public.jobs j where j.location_id=q.id),
          'schedules', (select count(*) from public.schedules s where s.location_id=q.id),
          'child_locations', (select count(*) from public.locations c where c.parent_location_id=q.id))
        order by l.label),'[]'::json)
      from qa q join public.locations l on l.id = q.id),
    'observed_at', now()::text)::text as payload;
