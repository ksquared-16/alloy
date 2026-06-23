-- Align enrollment tour opportunity statuses to granular BP builder stages.
-- Idempotent metadata patch; does not delete rows.

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
tour_status_stage AS (
    SELECT *
    FROM (VALUES
        ('tour_requested'::text, 'tour_scheduled'::text),
        ('tour_scheduled', 'tour_scheduled'),
        ('tour_completed', 'tour_completed'),
        ('tour_no_show', 'tour_completed'),
        ('follow_up_attempted', 'tour_completed'),
        ('decision_pending', 'decision_pending')
    ) AS v(status_key, process_stage_key)
)
UPDATE public.status_definitions sd
SET
    metadata = jsonb_set(
        jsonb_set(
            coalesce(sd.metadata, '{}'::jsonb),
            '{process_stage_key}',
            to_jsonb(tss.process_stage_key),
            true
        ),
        '{stage_key}',
        to_jsonb(tss.process_stage_key),
        true
    ),
    updated_at = now()
FROM enrollment_orgs eo
JOIN tour_status_stage tss ON true
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunities'
  AND sd.status_key = tss.status_key
  AND (
      sd.metadata->>'process_stage_key' IS DISTINCT FROM tss.process_stage_key
      OR sd.metadata->>'stage_key' IS DISTINCT FROM tss.process_stage_key
  );

-- Upsert tour_no_show when missing on enrollment orgs.
WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    industry_key,
    metadata
)
SELECT
    eo.org_id,
    'opportunities'::text,
    'tour_no_show'::text,
    'Tour No-Show'::text,
    32::int,
    true,
    false,
    NULL::text,
    jsonb_build_object(
        'alloy_layer', 'lead_pipeline',
        'process_key', 'enrollment',
        'track_key', 'family_track',
        'stage_key', 'tour_completed',
        'process_stage_key', 'tour_completed',
        'entity_scope', 'family_case',
        'active', true,
        'seed_source', 'migration_20260622120000_tour_bp_granular_stage_alignment'
    )
FROM enrollment_orgs eo
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = eo.org_id
      AND sd.entity_type = 'opportunities'
      AND sd.status_key = 'tour_no_show'
);
