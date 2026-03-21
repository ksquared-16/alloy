-- Industry-scoped default rows for status_definitions (org_id NULL) and unified status_key on more entities.

ALTER TABLE public.status_definitions
  ADD COLUMN IF NOT EXISTS industry_id uuid REFERENCES public.industries (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.status_definitions.industry_id IS
  'When org_id is NULL, scopes this default row to an industry; NULL industry_id = all industries.';

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS status_key text;

COMMENT ON COLUMN public.locations.status_key IS 'Workflow status key; labels from status_definitions (entity_type=locations).';

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS status_key text;

COMMENT ON COLUMN public.documents.status_key IS 'Workflow status key; labels from status_definitions (entity_type=documents).';

ALTER TABLE public.customer_subscriptions
  ADD COLUMN IF NOT EXISTS status_key text;

COMMENT ON COLUMN public.customer_subscriptions.status_key IS 'Workflow status key; labels from status_definitions (entity_type=subscriptions).';
