-- Communications V2 — PKG-02: conversation core (assignment / SLA / attention foundations).
-- ADDITIVE ONLY. No drops, no destructive changes, no data backfill mutations.
-- Extends public.communication_threads and adds two append-only audit tables.
-- No UI, no provider, no send behavior. Service wiring lands in PKG-10 (Assignment & SLA).
-- RLS mirrors 20260430254100_communications_v1_foundation.sql: org members SELECT via user_roles; service_role ALL.

-- 1) communication_threads — assignment / SLA / attention columns (additive; nullable or safe default).
ALTER TABLE public.communication_threads
    ADD COLUMN IF NOT EXISTS assigned_user_id uuid NULL,
    ADD COLUMN IF NOT EXISTS assigned_team_id uuid NULL,
    ADD COLUMN IF NOT EXISTS assignment_state text NOT NULL DEFAULT 'unassigned',
    ADD COLUMN IF NOT EXISTS attention_state text NULL,
    ADD COLUMN IF NOT EXISTS first_response_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS sla_due_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS sla_state text NULL,
    ADD COLUMN IF NOT EXISTS last_read_at timestamptz NULL;

-- assignment_state bounded vocabulary (unassigned | assigned). Idempotent add.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'communication_threads_assignment_state_chk'
    ) THEN
        ALTER TABLE public.communication_threads
            ADD CONSTRAINT communication_threads_assignment_state_chk
            CHECK (assignment_state IN ('unassigned', 'assigned'));
    END IF;
END$$;

COMMENT ON COLUMN public.communication_threads.assigned_user_id IS 'PKG-02: owning user (no FK — mirrors existing uuid actor columns). Service wiring in PKG-10.';
COMMENT ON COLUMN public.communication_threads.assigned_team_id IS 'PKG-02: owning team (no FK yet). Service wiring in PKG-10.';
COMMENT ON COLUMN public.communication_threads.assignment_state IS 'PKG-02: unassigned | assigned (bounded by check constraint).';
COMMENT ON COLUMN public.communication_threads.attention_state IS 'PKG-02: operational queue state; free text until Command Center enum lands in PKG-11. Nullable.';
COMMENT ON COLUMN public.communication_threads.first_response_at IS 'PKG-02: first operator response timestamp (SLA basis). Populated by PKG-10.';
COMMENT ON COLUMN public.communication_threads.sla_due_at IS 'PKG-02: next SLA deadline. Populated by PKG-10.';
COMMENT ON COLUMN public.communication_threads.sla_state IS 'PKG-02: SLA state; free text until PKG-10 finalizes vocabulary. Nullable.';
COMMENT ON COLUMN public.communication_threads.last_read_at IS 'PKG-02: last staff-read timestamp for the conversation.';

-- 2) conversation_assignment_events — append-only audit (enforced in app layer; no UPDATE/DELETE in code).
CREATE TABLE IF NOT EXISTS public.conversation_assignment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    thread_id uuid NOT NULL REFERENCES public.communication_threads (id) ON DELETE CASCADE,
    action text NOT NULL,
    from_user_id uuid NULL,
    to_user_id uuid NULL,
    to_team_id uuid NULL,
    actor_user_id uuid NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_conv_assign_events_org_thread
    ON public.conversation_assignment_events (org_id, thread_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_assign_events_org_time
    ON public.conversation_assignment_events (org_id, occurred_at DESC);

-- 3) sla_events — append-only SLA transition audit.
CREATE TABLE IF NOT EXISTS public.sla_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    thread_id uuid NOT NULL REFERENCES public.communication_threads (id) ON DELETE CASCADE,
    sla_type text NOT NULL,
    state text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_sla_events_org_thread
    ON public.sla_events (org_id, thread_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_events_org_type_state
    ON public.sla_events (org_id, sla_type, state);

-- 4) communication_threads operational indexes (additive).
CREATE INDEX IF NOT EXISTS idx_comm_threads_org_attention
    ON public.communication_threads (org_id, attention_state, last_message_at DESC)
    WHERE attention_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_threads_org_assignment
    ON public.communication_threads (org_id, assignment_state, sla_state);
CREATE INDEX IF NOT EXISTS idx_comm_threads_org_assigned_user
    ON public.communication_threads (org_id, assigned_user_id)
    WHERE assigned_user_id IS NOT NULL;

-- 5) RLS — org members read; mutations via service_role (Next admin API + worker).
ALTER TABLE public.conversation_assignment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_assignment_events_select_org
    ON public.conversation_assignment_events FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = conversation_assignment_events.org_id));
CREATE POLICY conversation_assignment_events_service_all
    ON public.conversation_assignment_events FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY sla_events_select_org
    ON public.sla_events FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = sla_events.org_id));
CREATE POLICY sla_events_service_all
    ON public.sla_events FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

GRANT ALL ON TABLE public.conversation_assignment_events TO anon;
GRANT ALL ON TABLE public.conversation_assignment_events TO authenticated;
GRANT ALL ON TABLE public.conversation_assignment_events TO service_role;
GRANT ALL ON TABLE public.sla_events TO anon;
GRANT ALL ON TABLE public.sla_events TO authenticated;
GRANT ALL ON TABLE public.sla_events TO service_role;

COMMENT ON TABLE public.conversation_assignment_events IS 'PKG-02: append-only audit of conversation assignment changes (claim/assign/reassign/unassign/route). Service wiring in PKG-10.';
COMMENT ON TABLE public.sla_events IS 'PKG-02: append-only audit of SLA transitions (first_response/response/stale). Service wiring in PKG-10.';
