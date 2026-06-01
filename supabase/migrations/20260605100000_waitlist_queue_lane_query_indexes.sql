-- Speed: waitlist candidate-grain queue filters placement_candidates by org_id + status,
-- then inner-joins opportunities on work_unit_id. This composite helps the join/filter path.
CREATE INDEX IF NOT EXISTS idx_placement_candidates_org_status_opportunity
    ON public.placement_candidates (org_id, status, opportunity_id)
    WHERE status IN ('active', 'paused');

-- Speed: needs_attention / opportunity lane base queries filter by org + work_unit + status.
CREATE INDEX IF NOT EXISTS idx_opportunities_org_work_unit_updated
    ON public.opportunities (org_id, work_unit_id, updated_at DESC);
