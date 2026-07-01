-- =============================================================================
-- Opportunities: metadata.lifecycle_stage on status_definitions (data only)
-- =============================================================================
-- Merges lifecycle_stage into existing metadata JSON without removing other keys.
-- No new columns. Idempotent: re-running sets the same lifecycle_stage values.
--
-- Canonical stages: intake | qualification | execution | decision | success | failure
-- =============================================================================

-- Per-status merges (all rows for entity_type=opportunities, any org_id / industry_key).
UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'intake')
WHERE entity_type = 'opportunities' AND status_key = 'new';

UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'intake')
WHERE entity_type = 'opportunities' AND status_key = 'contacted';

UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'qualification')
WHERE entity_type = 'opportunities' AND status_key = 'qualified';

UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'execution')
WHERE entity_type = 'opportunities' AND status_key = 'needs_a_quote';

UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'execution')
WHERE entity_type = 'opportunities' AND status_key = 'quote_started';

UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'success')
WHERE entity_type = 'opportunities' AND status_key = 'booked';

UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'success')
WHERE entity_type = 'opportunities' AND status_key = 'scheduled';

UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'success')
WHERE entity_type = 'opportunities' AND status_key = 'won';

UPDATE public.status_definitions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', 'failure')
WHERE entity_type = 'opportunities' AND status_key = 'lost';

-- Global default for quote_started (book-v2 sets this status_key; was missing from definitions in some envs).
INSERT INTO public.status_definitions (
    id,
    org_id,
    industry_key,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    metadata,
    created_at
)
SELECT
    gen_random_uuid(),
    NULL::uuid,
    NULL::text,
    'opportunities',
    'quote_started',
    'Quote started',
    16,
    true,
    true,
    jsonb_build_object('lifecycle_stage', 'execution'),
    now()
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.entity_type = 'opportunities'
      AND sd.status_key = 'quote_started'
      AND sd.org_id IS NULL
      AND COALESCE(sd.industry_key, '') = ''
);
