-- Add config_locked to orgs (soft lock for entity labels and other config).
-- When true, entity-labels PUT/DELETE and org industry PATCH return 403.

ALTER TABLE public.orgs
ADD COLUMN IF NOT EXISTS config_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orgs.config_locked IS 'When true, config writes (entity labels, industry, etc.) are disabled. Toggle in System Settings.';
