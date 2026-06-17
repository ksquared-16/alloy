-- Align tour_no_show opportunity status to tour_scheduled builder stage (no BP work spawn on no-show).
-- Idempotent metadata patch.

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
UPDATE public.status_definitions sd
SET
    metadata = jsonb_set(
        jsonb_set(
            coalesce(sd.metadata, '{}'::jsonb),
            '{process_stage_key}',
            '"tour_scheduled"'::jsonb,
            true
        ),
        '{stage_key}',
        '"tour_scheduled"'::jsonb,
        true
    ),
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunities'
  AND sd.status_key = 'tour_no_show'
  AND (
      sd.metadata->>'process_stage_key' IS DISTINCT FROM 'tour_scheduled'
      OR sd.metadata->>'stage_key' IS DISTINCT FROM 'tour_scheduled'
  );
