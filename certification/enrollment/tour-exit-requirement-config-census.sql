-- Cold-read the PUBLISHED Tour stage-exit requirement before running live QA.
--
-- Shape-probing first, deliberately. The previous attempt expanded `metadata -> lifecycle_builder_v1
-- -> processes` as an array and failed as execution_failed: `jsonb_array_elements` raises on a value
-- that is not an array, and a census that assumes a shape reports nothing when the shape differs.
-- So every expansion here is guarded by `jsonb_typeof(...) = 'array'`, and the structure is reported
-- alongside the answer — a null then means "absent", not "the query was wrong".
WITH dept AS (
    SELECT d.id, to_jsonb(d.*) AS j
      FROM public.departments d
     WHERE d.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
builder AS (
    SELECT id, j, j -> 'metadata' -> 'lifecycle_builder_v1' AS lb
      FROM dept
),
procs AS (
    SELECT b.id,
           b.lb,
           CASE WHEN jsonb_typeof(b.lb -> 'processes') = 'array'
                THEN b.lb -> 'processes'
                ELSE '[]'::jsonb
           END AS process_list
      FROM builder b
),
stages AS (
    SELECT p.id,
           stage
      FROM procs p
      CROSS JOIN LATERAL jsonb_array_elements(p.process_list) AS proc
      CROSS JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(proc -> 'stages') = 'array'
                    THEN proc -> 'stages'
                    ELSE '[]'::jsonb
               END
           ) AS stage
)
SELECT question_id, kind, payload
FROM (
    SELECT 'q1_shape' AS question_id,
           'row' AS kind,
           concat_ws(' | ',
               'dept=' || b.id::text,
               'metadata_keys=' || coalesce((
                   SELECT string_agg(k, ',' ORDER BY k)
                     FROM jsonb_object_keys(
                              CASE WHEN jsonb_typeof(b.j -> 'metadata') = 'object'
                                   THEN b.j -> 'metadata' ELSE '{}'::jsonb END
                          ) AS k
               ), 'none'),
               'lifecycle_builder_v1=' || coalesce(jsonb_typeof(b.lb), 'absent'),
               'processes=' || coalesce(jsonb_typeof(b.lb -> 'processes'), 'absent')
           ) AS payload,
           1 AS ord
      FROM builder b

    UNION ALL

    SELECT 'q2_stages',
           'row',
           concat_ws(' | ',
               'stage_key=' || coalesce(stage ->> 'key', stage ->> 'stage_key', 'null'),
               'label=' || coalesce(stage ->> 'label', 'null'),
               'stage_object_keys=' || coalesce((
                   SELECT string_agg(k, ',' ORDER BY k)
                     FROM jsonb_object_keys(stage) AS k
               ), 'none')
           ),
           2
      FROM stages

    UNION ALL

    -- The Tour stage, whole. Its requirement and transition spellings are the thing under test,
    -- so they are returned verbatim rather than projected into columns this lane chose.
    SELECT 'q3_tour_stage_verbatim',
           'row',
           stage::text,
           3
      FROM stages
     WHERE coalesce(stage ->> 'key', stage ->> 'stage_key', '') ILIKE '%tour%'
        OR coalesce(stage ->> 'label', '') ILIKE '%tour%'
) s
ORDER BY ord, payload;
