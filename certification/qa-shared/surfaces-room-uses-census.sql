-- Surfaces c4 room-Uses fixture census (read only, QA Shared only). Run BEFORE ensure, AFTER ensure, AFTER reset.
-- Proves: the two ac000000- rows' presence/owner/uses, that no assignment references them (no save), and that the
-- UNMARKED existing rooms are byte-unchanged (metadata sha256, updated_at). Configuration and counts only.
-- Rows: question_id | kind | payload.
select 'fixture_rows' as question_id, 'json' as kind, jsonb_build_object(
    'category_present', exists (select 1 from public.operational_assignment_types t
        where t.org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and t.id = 'ac000000-0000-4000-8000-000000000301'),
    'room', (select jsonb_build_object('present', true, 'parent', l.parent_location_id, 'unit_role', l.unit_role,
                    'space_uses', l.metadata -> 'space_uses', 'qa_run_id', l.metadata -> 'qa_run_id', 'qa_fixture', l.metadata -> 'qa_fixture')
               from public.locations l
              where l.org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and l.id = 'ac000000-0000-4000-8000-000000000311'),
    'assignments_referencing_fixture', (select count(*) from public.schedule_assignments sa
        where sa.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'
          and (sa.room_location_id = 'ac000000-0000-4000-8000-000000000311' or sa.operational_assignment_type_id = 'ac000000-0000-4000-8000-000000000301')),
    'stray_namespace_rows', (select count(*) from public.locations l where l.org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and l.id::text like 'ac000000-%'
                                and l.id <> 'ac000000-0000-4000-8000-000000000311')
        + (select count(*) from public.operational_assignment_types t where t.org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and t.id::text like 'ac000000-%'
                                and t.id <> 'ac000000-0000-4000-8000-000000000301')
  )::text as payload
union all
select 'unmarked_rooms_untouched', 'json', coalesce(jsonb_agg(x order by x.id), '[]'::jsonb)::text from (
    select l.id, l.label, l.updated_at,
           encode(sha256(convert_to(coalesce(l.metadata, 'null'::jsonb)::text, 'UTF8')), 'hex') as metadata_sha256
      from public.locations l
     where l.org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and l.location_type = 'unit' and l.id::text not like 'ac000000-%') x
union all
select 'org_categories', 'json', jsonb_build_object(
    'total', (select count(*) from public.operational_assignment_types t where t.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'),
    'non_fixture', (select count(*) from public.operational_assignment_types t where t.org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and t.id::text not like 'ac000000-%')
  )::text;
