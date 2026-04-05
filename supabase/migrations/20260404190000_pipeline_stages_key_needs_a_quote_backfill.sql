-- =============================================================================
-- Backfill: set key = 'needs_a_quote' on existing stages (key was null)
-- =============================================================================
-- Prior migration 20260404180000 only INSERTed a new row when no row had
-- key = 'needs_a_quote'. Orgs that already had a "Needs Quote" / "Needs a quote"
-- stage with key NULL were never updated, so resolvePipelineStageIdByOrgKey fails.
--
-- Safe / idempotent:
-- - Only updates rows where key IS NULL
-- - Skips orgs that already have any row with key = 'needs_a_quote' (unique index)
-- - At most one row per org (DISTINCT ON org_id)
-- =============================================================================

UPDATE public.pipeline_stages ps
SET "key" = 'needs_a_quote'
FROM (
  SELECT DISTINCT ON (ps2.org_id) ps2.id
  FROM public.pipeline_stages ps2
  WHERE ps2.org_id IS NOT NULL
    AND ps2."key" IS NULL
    AND lower(trim(ps2.name)) IN ('needs quote', 'needs a quote')
    AND NOT EXISTS (
      SELECT 1
      FROM public.pipeline_stages x
      WHERE x.org_id = ps2.org_id
        AND x."key" = 'needs_a_quote'
    )
  ORDER BY ps2.org_id, ps2.position NULLS LAST, ps2.id
) pick
WHERE ps.id = pick.id;
