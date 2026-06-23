-- Communications V2 — Phase 1 / B4: announcements (schema skeleton).
-- ADDITIVE ONLY. New tables only; no drops, no destructive changes, NO data backfill,
-- NO seed/demo data, no send/fan-out, no provider, no scheduling logic (those land in B5–B7).
-- RLS mirrors communications_v1_foundation.sql: org members SELECT via user_roles; service_role ALL.
-- Vocabularies (status/channel/target_type/consent_state/recipient status) are CHECK-constrained
-- AND mirrored in web/lib/communications/v2/announcementSchema.ts (schema-parity test guards drift).
-- created_by / person_id are uuid WITHOUT FK (repo uuid actor-id convention).

-- Evolve announcements when v1 table (20260619150000) already exists on remote.
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS created_by uuid NULL;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS body_format text NOT NULL DEFAULT 'text';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS send_at timestamptz NULL;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS sent_at timestamptz NULL;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 1) announcements — one-to-many broadcast container (Draft → Scheduled → Sent → Archived).
CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    created_by uuid NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'sent', 'archived')),
    channels text[] NOT NULL DEFAULT '{}'::text[],
    template_id uuid NULL REFERENCES public.communication_templates (id) ON DELETE SET NULL,
    subject text NULL,
    body text NOT NULL DEFAULT '',
    body_format text NOT NULL DEFAULT 'text' CHECK (body_format IN ('text', 'html')),
    send_at timestamptz NULL,
    sent_at timestamptz NULL,
    archived_at timestamptz NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- channels must be a subset of the allowed channel vocabulary
    CONSTRAINT announcements_channels_chk
        CHECK (channels <@ ARRAY['email', 'sms', 'in_app']::text[]),
    -- a scheduled announcement must carry a send_at
    CONSTRAINT announcements_scheduled_send_at_chk
        CHECK (status <> 'scheduled' OR send_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_announcements_org_status
    ON public.announcements (org_id, status);
CREATE INDEX IF NOT EXISTS idx_announcements_org_status_send_at
    ON public.announcements (org_id, status, send_at);

-- 2) announcement_targets — composable segment definition (resolved later in B5).
CREATE TABLE IF NOT EXISTS public.announcement_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    announcement_id uuid NOT NULL REFERENCES public.announcements (id) ON DELETE CASCADE,
    target_type text NOT NULL
        CHECK (target_type IN ('all_families', 'active_families', 'waitlist', 'program', 'room', 'location', 'custom')),
    target_ref uuid NULL,
    rule jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcement_targets_org_announcement
    ON public.announcement_targets (org_id, announcement_id);

-- 3) announcement_recipients — resolved recipient snapshot at schedule/send (written in B5–B7).
CREATE TABLE IF NOT EXISTS public.announcement_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    announcement_id uuid NOT NULL REFERENCES public.announcements (id) ON DELETE CASCADE,
    person_id uuid NULL,
    channel text NOT NULL CHECK (channel IN ('email', 'sms', 'in_app')),
    address text NULL,
    consent_state text NULL CHECK (consent_state IN ('opted_in', 'opted_out', 'unset')),
    suppressed_reason text NULL,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'queued', 'sent', 'skipped', 'failed')),
    communication_message_id uuid NULL REFERENCES public.communication_messages (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT announcement_recipients_uq UNIQUE (announcement_id, person_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_org_announcement_status
    ON public.announcement_recipients (org_id, announcement_id, status);

-- 4) RLS — org members read; mutations via service_role.
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcements_select_org
    ON public.announcements FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = announcements.org_id));
CREATE POLICY announcements_service_all
    ON public.announcements FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY announcement_targets_select_org
    ON public.announcement_targets FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = announcement_targets.org_id));
CREATE POLICY announcement_targets_service_all
    ON public.announcement_targets FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY announcement_recipients_select_org
    ON public.announcement_recipients FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = announcement_recipients.org_id));
CREATE POLICY announcement_recipients_service_all
    ON public.announcement_recipients FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;
GRANT ALL ON TABLE public.announcement_targets TO anon;
GRANT ALL ON TABLE public.announcement_targets TO authenticated;
GRANT ALL ON TABLE public.announcement_targets TO service_role;
GRANT ALL ON TABLE public.announcement_recipients TO anon;
GRANT ALL ON TABLE public.announcement_recipients TO authenticated;
GRANT ALL ON TABLE public.announcement_recipients TO service_role;

COMMENT ON TABLE public.announcements IS 'Comms V2 Phase 1 (B4 skeleton): one-to-many broadcast container. Audience resolution, scheduling, and provider-free fan-out land in B5–B7.';
COMMENT ON TABLE public.announcement_targets IS 'Comms V2 Phase 1 (B4 skeleton): composable segment definition; resolved to recipients in B5.';
COMMENT ON TABLE public.announcement_recipients IS 'Comms V2 Phase 1 (B4 skeleton): resolved recipient snapshot; populated at schedule/send (B5–B7). Email/SMS resolve to skipped(provider_unavailable) until Phase 3.';
