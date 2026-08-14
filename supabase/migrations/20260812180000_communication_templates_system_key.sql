-- Tour system templates: durable semantic identity on communication_templates.
-- Orgs edit versions freely; system_key cannot be cleared by ordinary archive.

ALTER TABLE public.communication_templates
    ADD COLUMN IF NOT EXISTS system_key text NULL;

COMMENT ON COLUMN public.communication_templates.system_key IS
    'Stable semantic identity for platform-required templates (e.g. tour_invitation:email). '
    'NULL for operator-authored templates. Unique per org when set.';

CREATE UNIQUE INDEX IF NOT EXISTS communication_templates_org_system_key_uidx
    ON public.communication_templates (org_id, system_key)
    WHERE system_key IS NOT NULL;
