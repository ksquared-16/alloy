-- Surfaces c4 (OPWORK_FAACCA6079AD_SPRINT_6E76007E732B) — run-owned room-Uses fixture ENSURE (QA Shared only).
-- Creates exactly two rows in the ac000000- namespace:
--   one child assignment category (a use distinct from the org's existing category), and
--   one classroom under the permanent QA North site whose configured space_uses names that category.
-- The observation reads them through the product with NO assignment save. Existing rooms are never touched.
-- Runner owns :org and :qa_run_id. Never assigns them here.
\if :{?org}
\else
do $$ begin
  raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>. It does not choose a tenant for itself.';
end $$;
\endif
\if :{?qa_run_id}
\else
do $$ begin
  raise exception 'this fixture requires psql -v qa_run_id=<qar_…>. Cross-run contamination is refused.';
end $$;
\endif
select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared \gset
\if :is_qa_shared
\else
do $$ begin
  raise exception 'the Surfaces room-Uses fixture is applied in QA Shared only';
end $$;
\endif

\set fx_category 'ac000000-0000-4000-8000-000000000301'
\set fx_room 'ac000000-0000-4000-8000-000000000311'
\set qa_north '21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'

-- The permanent QA North site must exist: the fixture hangs under it and never creates structure.
select exists (
    select 1 from public.locations s
     where s.org_id = :'org'::uuid and s.id = :'qa_north'::uuid and s.location_type = 'site'
  ) as qa_north_present \gset
\if :qa_north_present
\else
do $$ begin
  raise exception 'QA North is missing; structure is the B2 ensure''s, never this fixture''s';
end $$;
\endif

-- LEASE: the fixture belongs to the QA run that ensured it. Another run's live (or abandoned) fixture is
-- not taken over by re-ensuring it; it leaves through its owning run's reset.
select exists (
    select 1 from public.locations l
     where l.org_id = :'org'::uuid and l.id = :'fx_room'::uuid
       and coalesce(l.metadata ->> 'qa_run_id', '') <> :'qa_run_id'
  ) as owned_by_another_run \gset
\if :owned_by_another_run
do $$ begin
  raise exception 'the Surfaces room-Uses fixture belongs to another QA run; it is not re-ensured from here';
end $$;
\endif

-- A saved assignment on the fixture means an observation wrote. It leaves through the product, never here.
select exists (
    select 1 from public.schedule_assignments sa
     where sa.org_id = :'org'::uuid
       and (sa.room_location_id = :'fx_room'::uuid or sa.operational_assignment_type_id = :'fx_category'::uuid)
  ) as fixture_assignments_present \gset
\if :fixture_assignments_present
do $$ begin
  raise exception 'an assignment references the Surfaces room-Uses fixture; the observation must not save. Remove it through the product first';
end $$;
\endif

-- RESET CAP: a delete here removes exactly the two fixture rows and nothing else. Any row anywhere that
-- references either one (by foreign key, read from the catalog, so a later table is covered too) would be
-- cascaded, nulled or blocked by the delete, so it is refused before anything is removed.
select set_config('qa_surfaces_c4.fx_room', :'fx_room', true) is not null
   and set_config('qa_surfaces_c4.fx_category', :'fx_category', true) is not null as reset_cap_bound \gset
do $$
declare
  fk record;
  n bigint;
begin
  for fk in
    select c.conrelid::regclass as source, a.attname as col, c.confrelid as target
      from pg_constraint c
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attname = 'id'
      join lateral generate_subscripts(c.confkey, 1) i on c.confkey[i] = ra.attnum
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[i]
     where c.contype = 'f'
       and c.confrelid in ('public.locations'::regclass, 'public.operational_assignment_types'::regclass)
  loop
    execute format('select count(*) from %s where %I = $1', fk.source, fk.col) into n
      using (case when fk.target = 'public.locations'::regclass
                  then current_setting('qa_surfaces_c4.fx_room') else current_setting('qa_surfaces_c4.fx_category') end)::uuid;
    if n > 0 then
      raise exception 'reset cap: % row(s) in % reference the Surfaces room-Uses fixture through %; they leave through the product first', n, fk.source, fk.col;
    end if;
  end loop;
end $$;

-- Idempotent: remove ONLY the two fixture rows (room before the category it names).
delete from public.locations
 where org_id = :'org'::uuid and id = 'ac000000-0000-4000-8000-000000000311'::uuid;
delete from public.operational_assignment_types
 where org_id = :'org'::uuid and id = 'ac000000-0000-4000-8000-000000000301'::uuid;

insert into public.operational_assignment_types (id, org_id, key, label, subject_types, is_active)
values (:'fx_category'::uuid, :'org'::uuid, 'qa_surfaces_room_use', 'QA Room Use (fixture)', array['child']::text[], true);

insert into public.locations (id, org_id, location_type, unit_role, parent_location_id, label, is_active, metadata)
values (
  :'fx_room'::uuid, :'org'::uuid, 'unit', 'operational_group', :'qa_north'::uuid, 'QA Surfaces Room (fixture)', true,
  jsonb_build_object(
    'space_uses', jsonb_build_array(:'fx_category'),
    'qa_fixture', 'surfaces_c4_room_uses',
    'qa_run_id', :'qa_run_id'
  )
);
