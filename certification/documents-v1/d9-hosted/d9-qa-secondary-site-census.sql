-- D9 hosted QA: read-only census of QA Secondary's sites, so the Vacilando QA plan registry can pin
-- one QA Secondary site by id as structure (qa_secondary_site) instead of a run-time "oldest active" pick.
-- One statement, emitting question_id|kind|payload. Reads public.locations only; writes nothing.
-- QA Secondary = ad53fee2-2570-460f-9300-f0e106c473b6 (frozen; see certification/qa-shared/b2-phase-a-preflight-census.sql).
select 'd9_qa_secondary_sites' as question_id,
       'row' as kind,
       json_build_object(
         'org_id', 'ad53fee2-2570-460f-9300-f0e106c473b6',
         'org_name', (select o.name from public.orgs o where o.id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid),
         'location_count', (select count(*) from public.locations l where l.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid),
         'active_site_count', (select count(*) from public.locations l
                                where l.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                                  and l.location_type = 'site' and l.is_active),
         'oldest_active_site_id', (select l.id from public.locations l
                                    where l.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                                      and l.location_type = 'site' and l.is_active
                                    order by l.created_at, l.id limit 1),
         'locations', (select coalesce(json_agg(json_build_object(
                                 'id', l.id,
                                 'name', to_jsonb(l) ->> 'name',
                                 'location_type', l.location_type,
                                 'is_active', l.is_active,
                                 'archived_at', to_jsonb(l) ->> 'archived_at',
                                 'created_at', l.created_at)
                               order by l.created_at, l.id), '[]'::json)
                         from public.locations l
                        where l.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       )::text as payload;
