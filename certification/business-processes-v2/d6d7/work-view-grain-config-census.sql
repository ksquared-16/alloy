-- BP V2 D7 — published Work Views vs the grain of the stages they filter: Firefly and QA Shared. READ-ONLY,
-- configuration only (departments.metadata.lifecycle_builder_v1, the configuration the runtime serves).
-- Question: would the new publish check (work_view_grain_mismatch) refuse any configuration either tenant
-- has today? No records, names, contacts or amounts — stage keys, grains, view ids/labels and stage filters only.
-- Firefly 93667019-bd28-49b5-a688-acc9bb1e0a19 · QA Shared 4acc9386-c485-486f-aa1f-05d83499d142
select question_id, kind, payload
from (
    -- 1. Every stage of every staged-lifecycle process: key, active, metadata grain, plan journey segment.
    select 'wg_01_stages'::text as question_id, 'data'::text as kind,
           coalesce((select json_agg(json_build_object(
               'org', case d.org_id when '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
               'department_key', d.key, 'process_key', p->>'key', 'process_active', p->'is_active',
               'stage_key', s->>'key', 'stage_label', s->>'label', 'stage_active', s->'is_active', 'grain', s->>'grain',
               'segment', s->'stage_operating_plan_v1'->>'journey_segment')
               order by d.org_id, d.key, p->>'key', (s->>'sort_order')::int nulls last, s->>'key')
             from public.departments d
             cross join lateral jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)) p
             cross join lateral jsonb_array_elements(coalesce(p->'stages', '[]'::jsonb)) s
             where d.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
               and coalesce(p->'process_model_v1'->>'kind', 'staged_lifecycle') = 'staged_lifecycle')::text, '[]') as payload,
           '01'::text as sort_key
    union all
    -- 2. Every Work View of those processes: id, label, declared Row Grain, and its stage conditions only.
    select 'wg_02_work_views', 'data',
           coalesce((select json_agg(json_build_object(
               'org', case d.org_id when '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
               'department_key', d.key, 'process_key', p->>'key',
               'view_id', v->>'id', 'view_label', v->>'label', 'row_grain_v1', v->>'row_grain_v1',
               'stage_filters', (select json_agg(f) from jsonb_array_elements(coalesce(v->'filters_v1', '[]'::jsonb)) f
                                 where f->>'field_key' in ('opportunity_stage', 'stage')))
               order by d.org_id, d.key, p->>'key', v->>'id')
             from public.departments d
             cross join lateral jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)) p
             cross join lateral jsonb_array_elements(coalesce(p->'work_views_v1', '[]'::jsonb)) v
             where d.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
               and coalesce(p->'process_model_v1'->>'kind', 'staged_lifecycle') = 'staged_lifecycle')::text, '[]'),
           '02'
) q
order by sort_key;
