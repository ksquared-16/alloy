-- Admin-configurable workflow status (status_definitions) persisted on persons and plan templates.
ALTER TABLE public.persons
    ADD COLUMN IF NOT EXISTS status_key text;

ALTER TABLE public.service_plan_templates
    ADD COLUMN IF NOT EXISTS status_key text;

COMMENT ON COLUMN public.persons.status_key IS 'Workflow status key; labels from status_definitions (entity_type=persons).';
COMMENT ON COLUMN public.service_plan_templates.status_key IS 'Workflow status key; labels from status_definitions (entity_type=service_plan_templates).';
