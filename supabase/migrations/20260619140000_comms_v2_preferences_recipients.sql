-- Communications V2 — PKG-04: message recipients + per-person preferences + audit.
-- ADDITIVE ONLY. New tables only; no drops, no destructive changes, NO data backfill,
-- NO send-time enforcement (that lands in PKG-08), no UI, no provider implementation.
-- RLS mirrors communications_v1_foundation.sql: org members SELECT via user_roles; service_role ALL.
-- person_id is person-first uuid WITHOUT FK (matches existing repo uuid actor-id convention).

-- 1) communication_message_recipients — multi-recipient fan-out per message.
CREATE TABLE IF NOT EXISTS public.communication_message_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    message_id uuid NOT NULL REFERENCES public.communication_messages (id) ON DELETE CASCADE,
    person_id uuid NULL,
    address text NULL,
    recipient_role text NOT NULL DEFAULT 'to' CHECK (recipient_role IN ('to', 'cc', 'bcc')),
    status text NULL,
    delivered_at timestamptz NULL,
    opened_at timestamptz NULL,
    clicked_at timestamptz NULL,
    replied_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_comm_msg_recipients_message
    ON public.communication_message_recipients (message_id);
CREATE INDEX IF NOT EXISTS idx_comm_msg_recipients_org_person
    ON public.communication_message_recipients (org_id, person_id, created_at DESC)
    WHERE person_id IS NOT NULL;

-- 2) communication_preferences — per-PERSON consent (one row per person + category).
--    category / state vocabularies live in web/lib/communications/v2/preferences.ts (free text to stay additive).
CREATE TABLE IF NOT EXISTS public.communication_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    person_id uuid NOT NULL,
    category text NOT NULL,
    state text NOT NULL DEFAULT 'unset',
    source text NULL,
    method text NULL,
    updated_by_user_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communication_preferences_person_category_uq UNIQUE (org_id, person_id, category)
);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_org_person
    ON public.communication_preferences (org_id, person_id);

-- 3) communication_preference_events — immutable opt-in/out audit trail (append-only).
CREATE TABLE IF NOT EXISTS public.communication_preference_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    person_id uuid NOT NULL,
    category text NOT NULL,
    from_state text NULL,
    to_state text NOT NULL,
    source text NULL,
    method text NULL,
    actor_user_id uuid NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_comm_pref_events_org_person
    ON public.communication_preference_events (org_id, person_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_pref_events_org_category
    ON public.communication_preference_events (org_id, category, occurred_at DESC);

-- 4) RLS — org members read; mutations via service_role.
ALTER TABLE public.communication_message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_preference_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communication_message_recipients_select_org ON public.communication_message_recipients;
CREATE POLICY communication_message_recipients_select_org
    ON public.communication_message_recipients FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_message_recipients.org_id));
DROP POLICY IF EXISTS communication_message_recipients_service_all ON public.communication_message_recipients;
CREATE POLICY communication_message_recipients_service_all
    ON public.communication_message_recipients FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

DROP POLICY IF EXISTS communication_preferences_select_org ON public.communication_preferences;
CREATE POLICY communication_preferences_select_org
    ON public.communication_preferences FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_preferences.org_id));
DROP POLICY IF EXISTS communication_preferences_service_all ON public.communication_preferences;
CREATE POLICY communication_preferences_service_all
    ON public.communication_preferences FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

DROP POLICY IF EXISTS communication_preference_events_select_org ON public.communication_preference_events;
CREATE POLICY communication_preference_events_select_org
    ON public.communication_preference_events FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_preference_events.org_id));
DROP POLICY IF EXISTS communication_preference_events_service_all ON public.communication_preference_events;
CREATE POLICY communication_preference_events_service_all
    ON public.communication_preference_events FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

GRANT ALL ON TABLE public.communication_message_recipients TO anon;
GRANT ALL ON TABLE public.communication_message_recipients TO authenticated;
GRANT ALL ON TABLE public.communication_message_recipients TO service_role;
GRANT ALL ON TABLE public.communication_preferences TO anon;
GRANT ALL ON TABLE public.communication_preferences TO authenticated;
GRANT ALL ON TABLE public.communication_preferences TO service_role;
GRANT ALL ON TABLE public.communication_preference_events TO anon;
GRANT ALL ON TABLE public.communication_preference_events TO authenticated;
GRANT ALL ON TABLE public.communication_preference_events TO service_role;

COMMENT ON TABLE public.communication_message_recipients IS 'PKG-04: multi-recipient fan-out per message (person-first). Backfill from to_address + composer wiring land later (PKG-12).';
COMMENT ON TABLE public.communication_preferences IS 'PKG-04: per-PERSON communication consent (one row per person+category). Send-time enforcement lands in PKG-08.';
COMMENT ON TABLE public.communication_preference_events IS 'PKG-04: immutable append-only opt-in/out audit (source/method/actor/timestamp).';
COMMENT ON COLUMN public.communication_preferences.person_id IS 'PKG-04: person-first; no FK (matches repo uuid actor-id convention).';
