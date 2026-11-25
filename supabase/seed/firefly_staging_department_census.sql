-- Firefly staging department census (ALY-14 E3 follow-up) — READ ONLY, configuration only.
--
-- Supplementary. Step 1 as first run (2026-11-25) bound to the Firefly department keyed `enrollment`
-- and found it with no active process, stages or `lifecycle_wu_<stage>` queues. The tenant census is now
-- generated and binds to `lead_management` (web/lib/staging/fireflyStagingSeed/lifecycleTarget.ts); this
-- listing stays useful as an unopinionated view of every Firefly department. Hosted evidence from
-- 2026-10-23 (`certification/business-processes-v2/d2d5/enrollment-decision-config-census.sql.results.json`,
-- target `alloy_deployed_primary`) places Firefly's published Enrollment process in department
-- `3933ac47-…` keyed `lead_management`. This answers which department really holds it, with one row
-- per Firefly department and one per Firefly work unit. No record, name, contact or amount is read.
--
--   psql "$DB" -X -v ON_ERROR_STOP=1 -P pager=off -A -F ' | ' -f supabase/seed/firefly_staging_department_census.sql

BEGIN READ ONLY;

WITH firefly AS (SELECT '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid AS id),
depts AS (
    SELECT d.id, d.key, d.name, d.is_active,
           d.metadata ? 'lifecycle_builder_v1' AS has_builder,
           d.metadata->'lifecycle_builder_v1'->>'active_process_id' AS active_process_id,
           d.metadata->'lifecycle_builder_v1'->'processes' AS processes
    FROM public.departments d, firefly f
    WHERE d.org_id = f.id
)
SELECT 'department' AS kind, d.key, d.id::text AS id,
       concat_ws(' ; ',
           'name=' || d.name,
           'is_active=' || d.is_active,
           'has_builder=' || d.has_builder,
           'active_process_id=' || coalesce(d.active_process_id, '<none>'),
           'active_process_key=' || coalesce((SELECT p->>'key' FROM jsonb_array_elements(coalesce(d.processes, '[]'::jsonb)) p
                                              WHERE p->>'id' = d.active_process_id LIMIT 1), '<none>'),
           'active_stage_keys=' || coalesce((SELECT string_agg(st->>'key', ',' ORDER BY (st->>'sort_order')::int NULLS LAST, st->>'key')
                                             FROM jsonb_array_elements(coalesce(d.processes, '[]'::jsonb)) p
                                             CROSS JOIN LATERAL jsonb_array_elements(coalesce(p->'stages', '[]'::jsonb)) st
                                             WHERE p->>'id' = d.active_process_id), '<none>'),
           'latest_published_revision=' || coalesce((SELECT max(r.revision_number)::text FROM public.business_process_revisions r
                                                     WHERE r.department_id = d.id), '<none>'),
           'work_units=' || (SELECT count(*) FROM public.work_units w WHERE w.department_id = d.id)
       ) AS detail
FROM depts d
UNION ALL
SELECT 'work_unit', d.key || '/' || w.key, w.id::text,
       concat_ws(' ; ', 'is_active=' || w.is_active, 'stage=' || coalesce(w.metadata->>'lifecycle_stage_key', '<none>'))
FROM public.work_units w JOIN depts d ON d.id = w.department_id
ORDER BY 1, 2;

ROLLBACK;
