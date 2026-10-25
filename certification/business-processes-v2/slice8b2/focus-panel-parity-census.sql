-- BP V2 — Enrollment Focus Panel configuration parity: Firefly (working) vs QA Shared (failing). READ-ONLY.
-- Configuration only: ids, keys, modes, versions, statuses, timestamps. No names, contacts or amounts.
-- Firefly 93667019-bd28-49b5-a688-acc9bb1e0a19 · QA Shared 4acc9386-c485-486f-aa1f-05d83499d142
select question_id, kind, payload
from (
    -- 1. The gate the record view-model applies: the org drawer override for opportunities.
    select 'fp_01_drawer_override'::text as question_id, 'data'::text as kind,
           coalesce((select json_agg(json_build_object(
               'org', case r.org_id when '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
               'id', r.id, 'entity_type', r.entity_type, 'surface', r.surface, 'key', r.key, 'is_active', r.is_active,
               'inquiry_drawer_mode', r.config_json->>'inquiry_drawer_mode',
               'config_keys', (select json_agg(k order by k) from jsonb_object_keys(r.config_json) k),
               'created_at', r.created_at, 'updated_at', r.updated_at) order by r.org_id, r.entity_type, r.surface, r.key)
             from public.record_drawer_layouts r
             where r.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid))::text, '[]') as payload,
           '01'::text as sort_key
    union all
    -- 2. The fallback when an org has no override: the global record layouts for opportunities.
    select 'fp_02_global_record_layouts', 'data',
           coalesce((select json_agg(json_build_object('id', l.id, 'key', l.key, 'is_active', l.is_active,
               'inquiry_drawer_mode', l.config_json->>'inquiry_drawer_mode', 'created_at', l.created_at) order by l.created_at)
             from public.record_layouts l where l.entity_type = 'opportunity')::text, '[]'),
           '02'
    union all
    -- 3. Surfaces → Focus Panel and other Surface layouts (entity_layouts), per org, plus system defaults.
    select 'fp_03_entity_layouts', 'data',
           coalesce((select json_agg(json_build_object(
               'org', case when e.org_id is null then 'system' when e.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
               'entity_type', e.entity_type, 'surface', e.surface, 'layout_key', e.layout_key, 'version', e.version, 'status', e.status,
               'is_system_default', e.is_system_default, 'industry_key', e.industry_key, 'published_at', e.published_at,
               'created_at', e.created_at, 'created_by_set', e.created_by is not null,
               'doc_keys', (select json_agg(k order by k) from jsonb_object_keys(coalesce(e.doc, '{}'::jsonb)) k))
               order by e.org_id nulls first, e.entity_type, e.surface, e.layout_key, e.version)
             from public.entity_layouts e
             where e.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
                or (e.org_id is null and e.entity_type in ('opportunity', 'opportunities')))::text, '[]'),
           '03'
    union all
    -- 4. Enrollment departments and their publications.
    select 'fp_04_enrollment_publication', 'data',
           coalesce((select json_agg(json_build_object(
               'org', case d.org_id when '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
               'department_id', d.id, 'department_key', d.key, 'is_active', d.is_active,
               'builder_owned', d.metadata ? 'lifecycle_builder_owned_v1',
               'processes', (select json_agg(json_build_object('key', p->>'key', 'id', p->>'id', 'stages', jsonb_array_length(coalesce(p->'stages', '[]'::jsonb)),
                    'work_views', jsonb_array_length(coalesce(p->'work_views_v1', '[]'::jsonb)), 'model', p->'process_model_v1'->>'kind'))
                    from jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)) p),
               'latest_publication', (select json_build_object('revision_number', c.revision_number, 'revision_id', c.revision_id, 'published_at', c.published_at)
                    from public.configuration_publications c where c.org_id = d.org_id and c.subject_id = d.id order by c.published_at desc limit 1))
               order by d.org_id, d.key)
             from public.departments d
             where d.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
               and d.metadata ? 'lifecycle_builder_v1')::text, '[]'),
           '04'
    union all
    -- 5. Records by stage (ids only) so a working and a closed Firefly record can be traced read-only.
    select 'fp_05_records_by_stage', 'data',
           coalesce((select json_agg(s.x order by s.x->>'org', s.x->>'stage_key', s.x->>'status_key')
             from (select json_build_object(
                    'org', case o.org_id when '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
                    'stage_key', o.stage_key, 'status_key', o.status_key, 'n', count(*),
                    'sample_id', (array_agg(o.id order by o.updated_at desc))[1]) as x
                   from public.opportunities o
                   where o.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
                   group by o.org_id, o.stage_key, o.status_key) s)::text, '[]'),
           '05'
) q
order by sort_key;
