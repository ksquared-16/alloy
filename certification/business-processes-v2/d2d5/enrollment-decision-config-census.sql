-- BP V2 D2/D5 — published Enrollment Decision configuration: Firefly vs QA Shared. READ-ONLY, configuration only.
-- Question: which published outcome rules carry `enter_child_enrollment` (silently dropped by the plan parser before
-- the D2 repair, so the repair changes their runtime behaviour), and which Decision work templates already declare
-- per-child participant decisions. No records, names, contacts or amounts.
-- Firefly 93667019-bd28-49b5-a688-acc9bb1e0a19 · QA Shared 4acc9386-c485-486f-aa1f-05d83499d142
select question_id, kind, payload
from (
    -- 1. Every stage of every published process: key, grain, journey segment, work templates with their per-child
    --    decisions and completion policy, and outcome keys.
    select 'dd_01_stages'::text as question_id, 'data'::text as kind,
           coalesce((select json_agg(json_build_object(
               'org', case d.org_id when '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
               'department_key', d.key, 'process_key', p->>'key', 'process_active', p->'is_active',
               'stage_key', s->>'key', 'stage_active', s->'is_active', 'grain', s->>'grain',
               'segment', s->'stage_operating_plan_v1'->>'journey_segment',
               'outcomes', (select json_agg(o->>'outcome_key') from jsonb_array_elements(coalesce(s->'stage_operating_plan_v1'->'outcomes', '[]'::jsonb)) o),
               'work_templates', (select json_agg(json_build_object(
                    'template_key', w->>'template_key',
                    'outcome_refs', (select json_agg(r->>'outcome_ref') from jsonb_array_elements(coalesce(w->'outcome_refs', '[]'::jsonb)) r),
                    'completion_policy', w->'completion_policy',
                    'participant_decisions', (select json_agg(json_build_object('decision_key', pd->>'decision_key', 'action_ref', pd->>'action_ref',
                         'available', pd->'available',
                         'target_kinds', (select json_agg(t->>'kind') from jsonb_array_elements(coalesce(pd->'targets', '[]'::jsonb)) t),
                         'stage_keys', (select json_agg(t->>'stage_key') from jsonb_array_elements(coalesce(pd->'targets', '[]'::jsonb)) t where t ? 'stage_key')))
                         from jsonb_array_elements(coalesce(w->'participant_decisions', '[]'::jsonb)) pd)))
                    from jsonb_array_elements(coalesce(s->'stage_operating_plan_v1'->'work_templates', '[]'::jsonb)) w))
               order by d.org_id, d.key, p->>'key', (s->>'sort_order')::int nulls last, s->>'key')
             from public.departments d
             cross join lateral jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)) p
             cross join lateral jsonb_array_elements(coalesce(p->'stages', '[]'::jsonb)) s
             where d.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
               and coalesce(p->'process_model_v1'->>'kind', 'staged_lifecycle') = 'staged_lifecycle')::text, '[]') as payload,
           '01'::text as sort_key
    union all
    -- 2. Every published outcome rule (or participant decision) whose targets include `enter_child_enrollment`.
    select 'dd_02_enter_child_enrollment_rules', 'data',
           coalesce((select json_agg(json_build_object(
               'org', case d.org_id when '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
               'department_key', d.key, 'process_key', p->>'key', 'stage_key', s->>'key',
               'rule_key', r->>'rule_key', 'when_outcome_key', r->>'when_outcome_key',
               'target_kinds', (select json_agg(t->>'kind') from jsonb_array_elements(coalesce(r->'targets', '[]'::jsonb)) t)))
             from public.departments d
             cross join lateral jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)) p
             cross join lateral jsonb_array_elements(coalesce(p->'stages', '[]'::jsonb)) s
             cross join lateral jsonb_array_elements(coalesce(s->'stage_operating_plan_v1'->'outcome_rules', '[]'::jsonb)) r
             where d.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
               and r->'targets' @> '[{"kind":"enter_child_enrollment"}]'::jsonb)::text, '[]'),
           '02'
    union all
    -- 3. Per-child capabilities enabled in each published process's command set.
    select 'dd_03_command_set', 'data',
           coalesce((select json_agg(json_build_object(
               'org', case d.org_id when '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid then 'firefly' else 'qa_shared' end,
               'department_key', d.key, 'process_key', p->>'key',
               'enabled', (select json_agg(c->>'capability_key' order by c->>'capability_key') from jsonb_array_elements(coalesce(p->'command_set_v1'->'commands', '[]'::jsonb)) c
                           where coalesce((c->>'enabled')::boolean, true) and c->>'capability_key' in ('enroll_child', 'waitlist_child', 'update_child_enrollment_status'))))
             from public.departments d
             cross join lateral jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)) p
             where d.org_id in ('93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
               and coalesce(p->'process_model_v1'->>'kind', 'staged_lifecycle') = 'staged_lifecycle')::text, '[]'),
           '03'
) q
order by sort_key;
