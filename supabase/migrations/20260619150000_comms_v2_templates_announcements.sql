-- Communications V2 — PKG-05: templates + announcements schema.
-- ADDITIVE ONLY. New tables only; no drops, no data mutation, no UI, no rendering engine,
-- no send behavior, no provider implementation. RLS mirrors communications_v1_foundation.sql.

-- ===== Templates =====
CREATE TABLE IF NOT EXISTS public.communication_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    name text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('email', 'sms')),
    category text NULL,
    approval_status text NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending', 'approved')),
    current_version_id uuid NULL,  -- no FK (avoids circular dependency with versions); resolved in app layer
    created_by_user_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communication_templates_org_name_uq UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS idx_comm_templates_org_channel_status
    ON public.communication_templates (org_id, channel, approval_status);

CREATE TABLE IF NOT EXISTS public.communication_template_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    template_id uuid NOT NULL REFERENCES public.communication_templates (id) ON DELETE CASCADE,
    version integer NOT NULL,
    subject text NULL,
    body text NULL,
    body_format text NOT NULL DEFAULT 'html',
    variables jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_by_user_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communication_template_versions_template_version_uq UNIQUE (template_id, version)
);
CREATE INDEX IF NOT EXISTS idx_comm_template_versions_org_template
    ON public.communication_template_versions (org_id, template_id, version DESC);

CREATE TABLE IF NOT EXISTS public.communication_snippets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    name text NOT NULL,
    body text NOT NULL,
    category text NULL,
    created_by_user_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communication_snippets_org_name_uq UNIQUE (org_id, name)
);

-- ===== Announcements =====
CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    title text NOT NULL,
    channel_set jsonb NOT NULL DEFAULT '[]'::jsonb,
    classification text NULL,
    status text NOT NULL DEFAULT 'draft',
    template_id uuid NULL REFERENCES public.communication_templates (id) ON DELETE SET NULL,
    subject text NULL,
    body text NULL,
    scheduled_at timestamptz NULL,
    created_by_user_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_org_status_scheduled
    ON public.announcements (org_id, status, scheduled_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.announcement_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    announcement_id uuid NOT NULL REFERENCES public.announcements (id) ON DELETE CASCADE,
    target_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
    resolved_count integer NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcement_targets_announcement
    ON public.announcement_targets (announcement_id);

CREATE TABLE IF NOT EXISTS public.announcement_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    announcement_id uuid NOT NULL REFERENCES public.announcements (id) ON DELETE CASCADE,
    person_id uuid NULL,
    message_id uuid NULL REFERENCES public.communication_messages (id) ON DELETE SET NULL,
    status text NULL,
    delivered_at timestamptz NULL,
    opened_at timestamptz NULL,
    clicked_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_announcement
    ON public.announcement_deliveries (announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_org_person
    ON public.announcement_deliveries (org_id, person_id, created_at DESC)
    WHERE person_id IS NOT NULL;

-- ===== RLS (org members SELECT; service_role ALL) — explicit per table =====
ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communication_templates_select_org ON public.communication_templates;
CREATE POLICY communication_templates_select_org
    ON public.communication_templates FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = communication_templates.org_id));
DROP POLICY IF EXISTS communication_templates_service_all ON public.communication_templates;
CREATE POLICY communication_templates_service_all
    ON public.communication_templates FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
GRANT ALL ON TABLE public.communication_templates TO anon;
GRANT ALL ON TABLE public.communication_templates TO authenticated;
GRANT ALL ON TABLE public.communication_templates TO service_role;

ALTER TABLE public.communication_template_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communication_template_versions_select_org ON public.communication_template_versions;
CREATE POLICY communication_template_versions_select_org
    ON public.communication_template_versions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = communication_template_versions.org_id));
DROP POLICY IF EXISTS communication_template_versions_service_all ON public.communication_template_versions;
CREATE POLICY communication_template_versions_service_all
    ON public.communication_template_versions FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
GRANT ALL ON TABLE public.communication_template_versions TO anon;
GRANT ALL ON TABLE public.communication_template_versions TO authenticated;
GRANT ALL ON TABLE public.communication_template_versions TO service_role;

ALTER TABLE public.communication_snippets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communication_snippets_select_org ON public.communication_snippets;
CREATE POLICY communication_snippets_select_org
    ON public.communication_snippets FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = communication_snippets.org_id));
DROP POLICY IF EXISTS communication_snippets_service_all ON public.communication_snippets;
CREATE POLICY communication_snippets_service_all
    ON public.communication_snippets FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
GRANT ALL ON TABLE public.communication_snippets TO anon;
GRANT ALL ON TABLE public.communication_snippets TO authenticated;
GRANT ALL ON TABLE public.communication_snippets TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_select_org ON public.announcements;
CREATE POLICY announcements_select_org
    ON public.announcements FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = announcements.org_id));
DROP POLICY IF EXISTS announcements_service_all ON public.announcements;
CREATE POLICY announcements_service_all
    ON public.announcements FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;

ALTER TABLE public.announcement_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcement_targets_select_org ON public.announcement_targets;
CREATE POLICY announcement_targets_select_org
    ON public.announcement_targets FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = announcement_targets.org_id));
DROP POLICY IF EXISTS announcement_targets_service_all ON public.announcement_targets;
CREATE POLICY announcement_targets_service_all
    ON public.announcement_targets FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
GRANT ALL ON TABLE public.announcement_targets TO anon;
GRANT ALL ON TABLE public.announcement_targets TO authenticated;
GRANT ALL ON TABLE public.announcement_targets TO service_role;

ALTER TABLE public.announcement_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcement_deliveries_select_org ON public.announcement_deliveries;
CREATE POLICY announcement_deliveries_select_org
    ON public.announcement_deliveries FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = announcement_deliveries.org_id));
DROP POLICY IF EXISTS announcement_deliveries_service_all ON public.announcement_deliveries;
CREATE POLICY announcement_deliveries_service_all
    ON public.announcement_deliveries FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
GRANT ALL ON TABLE public.announcement_deliveries TO anon;
GRANT ALL ON TABLE public.announcement_deliveries TO authenticated;
GRANT ALL ON TABLE public.announcement_deliveries TO service_role;

COMMENT ON TABLE public.communication_templates IS 'PKG-05: visual-first template registry (channel, category, approval). Render engine + builder land in PKG-13.';
COMMENT ON TABLE public.communication_template_versions IS 'PKG-05: immutable template versions (subject/body/variables).';
COMMENT ON TABLE public.communication_snippets IS 'PKG-05: reusable snippet library.';
COMMENT ON TABLE public.announcements IS 'PKG-05: operator-first announcement registry (classification/status/schedule). Builder + delivery land in PKG-15.';
COMMENT ON TABLE public.announcement_targets IS 'PKG-05: announcement audience target specs (resolved later by PKG-15).';
COMMENT ON TABLE public.announcement_deliveries IS 'PKG-05: per-recipient announcement delivery + tracking rows.';
