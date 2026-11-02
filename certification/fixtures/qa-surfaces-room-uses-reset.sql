-- Surfaces c4 (OPWORK_FAACCA6079AD_SPRINT_6E76007E732B) — run-owned room-Uses fixture RESET (QA Shared only).
-- Removes ONLY the two ac000000- fixture rows, and only for the run that owns them.
-- Refuses while any assignment references them: an observation that saved is evidence, not residue.
\if :{?org}
\else
do $$ begin
  raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>.';
end $$;
\endif
\if :{?qa_run_id}
\else
do $$ begin
  raise exception 'this fixture requires psql -v qa_run_id=<qar_…>.';
end $$;
\endif
select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared \gset
\if :is_qa_shared
\else
do $$ begin
  raise exception 'the Surfaces room-Uses fixture is reset in QA Shared only';
end $$;
\endif

\set fx_category 'ac000000-0000-4000-8000-000000000301'
\set fx_room 'ac000000-0000-4000-8000-000000000311'

-- Another run's live fixture is not this run's to remove.
select exists (
    select 1 from public.locations l
     where l.org_id = :'org'::uuid and l.id = :'fx_room'::uuid
       and coalesce(l.metadata ->> 'qa_run_id', '') <> :'qa_run_id'
  ) as owned_by_another_run \gset
\if :owned_by_another_run
do $$ begin
  raise exception 'the Surfaces room-Uses fixture belongs to another QA run; it is not reset from here';
end $$;
\endif

select exists (
    select 1 from public.schedule_assignments sa
     where sa.org_id = :'org'::uuid
       and (sa.room_location_id = :'fx_room'::uuid or sa.operational_assignment_type_id = :'fx_category'::uuid)
  ) as fixture_assignments_present \gset
\if :fixture_assignments_present
do $$ begin
  raise exception 'an assignment references the Surfaces room-Uses fixture; remove it through the product before reset';
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

delete from public.locations
 where org_id = :'org'::uuid and id = 'ac000000-0000-4000-8000-000000000311'::uuid;
delete from public.operational_assignment_types
 where org_id = :'org'::uuid and id = 'ac000000-0000-4000-8000-000000000301'::uuid;
