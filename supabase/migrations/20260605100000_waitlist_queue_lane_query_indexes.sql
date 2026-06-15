-- Speed: waitlist candidate-grain queue filters placement_candidates by org_id + status,
-- then inner-joins opportunities on work_unit_id. This composite helps the join/filter path.
-- Guard: public.placement_candidates is NOT created by any migration in this repo
-- (schema gap — the table exists on staging out-of-band and is pending a recovered
-- CREATE TABLE migration). Skip the index on a fresh `supabase db reset` where the
-- table is absent so the reset completes; the index is created once the table exists.
DO $$
BEGIN
  IF to_regclass('public.placement_candidates') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_placement_candidates_org_status_opportunity '
         || 'ON public.placement_candidates (org_id, status, opportunity_id) '
         || 'WHERE status IN (''active'', ''paused'')';
  ELSE
    RAISE NOTICE 'placement_candidates absent; skipping idx_placement_candidates_org_status_opportunity (missing CREATE TABLE migration).';
  END IF;
END $$;

-- Speed: needs_attention / opportunity lane base queries filter by org + work_unit + status.
CREATE INDEX IF NOT EXISTS idx_opportunities_org_work_unit_updated
    ON public.opportunities (org_id, work_unit_id, updated_at DESC);
