-- Opportunity stage: drive status from pipeline_stages (admin UI + GHL sync).
-- Keeps opportunities.status for legacy/backfill; UI uses pipeline_stage_id going forward.

ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS pipeline_stage_id uuid REFERENCES public.pipeline_stages(id);

CREATE INDEX IF NOT EXISTS opportunities_pipeline_stage_id_idx ON public.opportunities (pipeline_stage_id);

COMMENT ON COLUMN public.opportunities.pipeline_stage_id IS 'Current stage in pipeline; drives status display in admin.';
