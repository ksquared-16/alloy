-- Operational-state entry time for queue "time in current stage".
-- Persisted on stage-membership owners so unrelated edits (updated_at) never reset the clock.
-- Family/case grain → opportunities; child/participant grain → process_instances.

ALTER TABLE public.opportunities
    ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz NULL;

COMMENT ON COLUMN public.opportunities.stage_entered_at IS
    'When the opportunity entered its current stage_key. Written only on stage membership changes; never from unrelated field updates.';

ALTER TABLE public.process_instances
    ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz NULL;

COMMENT ON COLUMN public.process_instances.stage_entered_at IS
    'When the process instance entered its current stage_key. Written only on stage membership changes; never from unrelated field updates.';

CREATE INDEX IF NOT EXISTS idx_opportunities_org_stage_entered_at
    ON public.opportunities (org_id, stage_entered_at)
    WHERE stage_entered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_process_instances_org_stage_entered_at
    ON public.process_instances (org_id, stage_entered_at)
    WHERE stage_entered_at IS NOT NULL;

-- No blind created_at backfill: rows that already transitioned would get the wrong clock.
-- Forward stage_key writes set stage_entered_at. Resolver may use intake created_at only when
-- the caller proves the subject never left the current stage; otherwise age is unknown.
