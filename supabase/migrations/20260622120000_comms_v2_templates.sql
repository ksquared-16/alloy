-- Communications V2 — Phase 1 / B1: reusable message templates + immutable versions.
-- ADDITIVE ONLY. New tables only; no drops, no destructive changes, NO data backfill,
-- NO seed/demo data, no API, no UI, no provider implementation, no announcements.
-- RLS mirrors communications_v1_foundation.sql: org members SELECT via user_roles; service_role ALL.
-- Vocabularies (channel/status/category) are CHECK-constrained AND mirrored in
-- web/lib/communications/v2/templateSchema.ts (schema-parity test guards drift).
-- current_version_id / created_by / updated_by are uuid WITHOUT FK (matches the existing
-- repo uuid actor-id convention, e.g. communication_preferences.updated_by_user_id) and
-- also avoids a circular templates<->versions FK. template_versions.template_id IS a real FK.

-- 1) communication_templates — the reusable template container (content lives on versions).
CREATE TABLE IF NOT EXISTS public.communication_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NULL,
    category text NOT NULL
        CHECK (category IN ('tour', 'enrollment', 'billing', 'attendance', 'general', 'workflow')),
    channel text NOT NULL
        CHECK (channel IN ('email', 'sms', 'in_app')),
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
    current_version_id uuid NULL,
    created_by uuid NULL,
    updated_by uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_templates_org
    ON public.communication_templates (org_id);
CREATE INDEX IF NOT EXISTS idx_comm_templates_org_category_channel
    ON public.communication_templates (org_id, category, channel);
CREATE INDEX IF NOT EXISTS idx_comm_templates_org_status
    ON public.communication_templates (org_id, status);

-- 2) communication_template_versions — immutable, append-only content snapshots.
--    One row per (template, version_number); token_paths caches parsed {{dot.path}} refs (B0).
CREATE TABLE IF NOT EXISTS public.communication_template_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    template_id uuid NOT NULL REFERENCES public.communication_templates (id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    subject text NULL,
    body text NOT NULL DEFAULT '',
    token_paths text[] NOT NULL DEFAULT '{}'::text[],
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communication_template_versions_template_version_uq UNIQUE (template_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_comm_template_versions_template
    ON public.communication_template_versions (template_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_comm_template_versions_org
    ON public.communication_template_versions (org_id);

-- 3) RLS — org members read; mutations via service_role (Next admin API + worker).
ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY communication_templates_select_org
    ON public.communication_templates FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_templates.org_id));
CREATE POLICY communication_templates_service_all
    ON public.communication_templates FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY communication_template_versions_select_org
    ON public.communication_template_versions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_template_versions.org_id));
CREATE POLICY communication_template_versions_service_all
    ON public.communication_template_versions FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

GRANT ALL ON TABLE public.communication_templates TO anon;
GRANT ALL ON TABLE public.communication_templates TO authenticated;
GRANT ALL ON TABLE public.communication_templates TO service_role;
GRANT ALL ON TABLE public.communication_template_versions TO anon;
GRANT ALL ON TABLE public.communication_template_versions TO authenticated;
GRANT ALL ON TABLE public.communication_template_versions TO service_role;

COMMENT ON TABLE public.communication_templates IS 'Comms V2 Phase 1 (B1): reusable message template container; content lives on communication_template_versions. CRUD/preview API lands in B2.';
COMMENT ON TABLE public.communication_template_versions IS 'Comms V2 Phase 1 (B1): immutable append-only template content snapshots (one per template+version_number). token_paths caches parsed {{dot.path}} refs.';
COMMENT ON COLUMN public.communication_templates.current_version_id IS 'B1: points at the active version row; uuid WITHOUT FK (repo actor-id convention; avoids circular templates<->versions FK).';
COMMENT ON COLUMN public.communication_template_versions.subject IS 'B1: email subject (NULL for sms/in_app). Channel lives on the parent template; cross-table guard deferred to the API layer.';
