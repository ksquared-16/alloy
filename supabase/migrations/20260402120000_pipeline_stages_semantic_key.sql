-- Batch 3.7: stable keys for public booking / automation (e.g. quote_started, booked).
-- Populate per org after deploy: UPDATE pipeline_stages SET key = 'quote_started' WHERE id = '<your-stage-uuid>';

ALTER TABLE public.pipeline_stages
    ADD COLUMN IF NOT EXISTS key text;

COMMENT ON COLUMN public.pipeline_stages.key IS 'Stable slug for server-side resolution (e.g. quote_started, booked). Nullable for legacy rows.';

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org_key ON public.pipeline_stages (org_id, key) WHERE key IS NOT NULL;
