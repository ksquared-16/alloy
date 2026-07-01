-- Queue row preview: Open only — Message/Ask BOS are action placements, not preview JSON.
-- Idempotent.

WITH pipeline_wus AS (
    SELECT wu.id
    FROM public.work_units wu
    JOIN public.departments d ON d.id = wu.department_id
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND lower(coalesce(wu.key, '')) = 'enrollment_pipeline'
)
UPDATE public.work_units wu
SET
    queue_definition = jsonb_set(
        coalesce(wu.queue_definition, '{}'::jsonb),
        '{ui,row_preview,actions}',
        '["open"]'::jsonb,
        true
    ),
    updated_at = now()
WHERE wu.id IN (SELECT id FROM pipeline_wus)
  AND coalesce(wu.queue_definition #>> '{ui,row_preview,actions}', '') IS DISTINCT FROM '["open"]';
