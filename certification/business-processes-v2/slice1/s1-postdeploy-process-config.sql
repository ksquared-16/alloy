-- POST-DEPLOY re-run (deployed 4d795dcf0, PR #1513). Separate artifact so the census is not deduplicated against gar_49a1b7a56ae00b.
-- BP V2 Slice 1 — deployed process configuration census (read only, configuration rows only).
-- One statement, one row: question_id | kind | payload(json). No personal fields are emitted.
-- Answers: which business processes are configured per department, their published revision,
-- and which workspace / queue-row / focus-panel layouts exist that the tile path reads.
with d as (
    select dp.org_id, dp.id as department_id, dp.key as department_key, dp.name as department_name,
           dp.is_active as department_active,
           dp.metadata -> 'lifecycle_builder_v1' as cfg
    from public.departments dp
),
procs as (
    select d.org_id, d.department_id, d.department_key, d.department_name, d.department_active,
           d.cfg ->> 'active_process_id' as active_process_id,
           p ->> 'id' as process_id, p ->> 'key' as process_key, p ->> 'name' as process_name,
           p ->> 'primary_entity' as primary_entity, (p ->> 'is_active') as process_active,
           jsonb_array_length(coalesce(p -> 'stages', '[]'::jsonb)) as stage_count,
           jsonb_array_length(coalesce(p -> 'work_views_v1', '[]'::jsonb)) as work_view_count,
           (p ? 'tracks_v1') as has_tracks_v1,
           (select count(*) from jsonb_object_keys(p) k) as key_count,
           (select jsonb_agg(k order by k) from jsonb_object_keys(p) k) as keys
    from d
    cross join lateral jsonb_array_elements(coalesce(d.cfg -> 'processes', '[]'::jsonb)) p
    where d.cfg is not null
),
rev as (
    select distinct on (r.org_id, r.department_id) r.org_id, r.department_id, r.revision_number, r.published_at
    from public.business_process_revisions r
    order by r.org_id, r.department_id, r.revision_number desc
),
lay as (
    select el.org_id, el.entity_type, el.surface, el.layout_key, count(*) as versions,
           max(el.version) as max_version
    from public.entity_layouts el
    where el.surface in ('workspace', 'queue', 'drawer') or el.layout_key like 'queue_row_%'
    group by 1, 2, 3, 4
)
select
    'bp_v2_s1_deployed_process_config' as question_id,
    'row' as kind,
    json_build_object(
        'departments_total', (select count(*) from d),
        'departments_with_builder', (select count(*) from d where cfg is not null),
        'processes', coalesce((select json_agg(json_build_object(
            'org_id', p.org_id, 'department_id', p.department_id, 'department_key', p.department_key,
            'department_name', p.department_name, 'department_active', p.department_active,
            'active_process_id', p.active_process_id, 'process_id', p.process_id,
            'process_key', p.process_key, 'process_name', p.process_name,
            'primary_entity', p.primary_entity, 'process_active', p.process_active,
            'stage_count', p.stage_count, 'work_view_count', p.work_view_count,
            'has_tracks_v1', p.has_tracks_v1, 'keys', p.keys,
            'latest_revision', r.revision_number, 'latest_published_at', r.published_at
        ) order by p.org_id, p.department_key, p.process_key)
          from procs p left join rev r on r.org_id = p.org_id and r.department_id = p.department_id), '[]'::json),
        'layouts', coalesce((select json_agg(json_build_object(
            'org_id', l.org_id, 'entity_type', l.entity_type, 'surface', l.surface,
            'layout_key', l.layout_key, 'versions', l.versions, 'max_version', l.max_version
        ) order by l.org_id, l.surface, l.layout_key) from lay l), '[]'::json)
    )::text as payload;
