-- Task Assist V1.1 — Card 1: durable proposals, scheduled sends (queue only), operational tasks.
-- Card 0: opportunities-only; no triggers that enqueue/send communications; no auto-send on proposal insert.
-- RLS: org-scoped authenticated access + service_role ALL (matches communication_* pattern).

-- -----------------------------------------------------------------------------
-- task_assist_proposals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_assist_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL,
    created_by uuid NOT NULL,
    agent_key text NOT NULL DEFAULT 'task_assist'::text
        CHECK (agent_key = 'task_assist'::text),
    proposal_type text NOT NULL
        CHECK (proposal_type = ANY (ARRAY['draft_sms'::text, 'draft_email'::text, 'schedule_send'::text, 'reminder'::text])),
    entity_type text NOT NULL DEFAULT 'opportunities'::text
        CHECK (entity_type = 'opportunities'::text),
    entity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'draft'::text
        CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'applied'::text])),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    expires_at timestamptz,
    approved_at timestamptz,
    approved_by uuid,
    rejected_at timestamptz,
    rejected_by uuid,
    applied_at timestamptz,
    applied_by uuid,
    applied_result jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_assist_proposals IS
    'Task Assist V1.1: durable AI draft / intent proposals; apply path remains executeCommunicationsSend in application code.';

CREATE INDEX IF NOT EXISTS idx_task_assist_proposals_org_entity_status
    ON public.task_assist_proposals (org_id, entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_task_assist_proposals_org_expires
    ON public.task_assist_proposals (org_id, expires_at)
    WHERE status = 'draft'::text;

CREATE OR REPLACE FUNCTION public.enforce_task_assist_proposals_org_matches_opportunity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    opp_org uuid;
BEGIN
    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.entity_id;
    IF opp_org IS NULL THEN
        RAISE EXCEPTION 'task_assist_proposals: entity_id % not found', NEW.entity_id USING ERRCODE = '23503';
    END IF;
    IF opp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'task_assist_proposals: org_id does not match opportunity.org_id' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_task_assist_proposals_org_matches_opportunity() IS
    'Ensures task_assist_proposals.org_id matches opportunities.org_id for entity_id (no cross-org rows).';

DROP TRIGGER IF EXISTS trg_task_assist_proposals_org_entity ON public.task_assist_proposals;
CREATE TRIGGER trg_task_assist_proposals_org_entity
    BEFORE INSERT OR UPDATE OF org_id, entity_id ON public.task_assist_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_task_assist_proposals_org_matches_opportunity();

DROP TRIGGER IF EXISTS trg_task_assist_proposals_updated_at ON public.task_assist_proposals;
CREATE TRIGGER trg_task_assist_proposals_updated_at
    BEFORE UPDATE ON public.task_assist_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- communication_scheduled_sends (approved snapshot; worker enqueues via executeCommunicationsSend)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_scheduled_sends (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    created_by uuid NOT NULL,
    proposal_id uuid REFERENCES public.task_assist_proposals (id) ON DELETE SET NULL,
    entity_type text NOT NULL DEFAULT 'opportunities'::text
        CHECK (entity_type = 'opportunities'::text),
    entity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    recipient_person_id uuid NOT NULL REFERENCES public.persons (id) ON DELETE RESTRICT,
    channel text NOT NULL CHECK (channel = ANY (ARRAY['sms'::text, 'email'::text])),
    subject_snapshot text,
    body_snapshot text NOT NULL,
    communication_provider_binding_id uuid REFERENCES public.communication_provider_bindings (id) ON DELETE SET NULL,
    scheduled_for timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text
        CHECK (status = ANY (ARRAY[
            'pending'::text,
            'claimed'::text,
            'queued'::text,
            'sent'::text,
            'canceled'::text,
            'failed'::text
        ])),
    approved_at timestamptz NOT NULL,
    approved_by uuid NOT NULL,
    communication_message_id uuid REFERENCES public.communication_messages (id) ON DELETE SET NULL,
    source text NOT NULL DEFAULT 'task_assist'::text
        CHECK (source = 'task_assist'::text),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    claimed_at timestamptz,
    claim_token uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_comm_sched_sends_schedule_after_approval CHECK (scheduled_for > approved_at)
);

COMMENT ON TABLE public.communication_scheduled_sends IS
    'One-time scheduled outbound; worker claims row then calls executeCommunicationsSend once (idempotent). No row in communication_messages until enqueue.';

CREATE INDEX IF NOT EXISTS idx_comm_sched_sends_org_status_due
    ON public.communication_scheduled_sends (org_id, status, scheduled_for)
    WHERE status = ANY (ARRAY['pending'::text, 'claimed'::text]);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comm_sched_sends_one_pending_per_proposal
    ON public.communication_scheduled_sends (proposal_id)
    WHERE proposal_id IS NOT NULL AND status = ANY (ARRAY['pending'::text, 'claimed'::text]);

CREATE OR REPLACE FUNCTION public.enforce_communication_scheduled_sends_org_matches_entities()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    opp_org uuid;
    person_org uuid;
BEGIN
    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.entity_id;
    IF opp_org IS NULL OR opp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'communication_scheduled_sends: entity org mismatch' USING ERRCODE = '23514';
    END IF;
    SELECT p.org_id INTO person_org FROM public.persons p WHERE p.id = NEW.recipient_person_id;
    IF person_org IS NULL OR person_org <> NEW.org_id THEN
        RAISE EXCEPTION 'communication_scheduled_sends: recipient person org mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comm_sched_sends_org_scope ON public.communication_scheduled_sends;
CREATE TRIGGER trg_comm_sched_sends_org_scope
    BEFORE INSERT OR UPDATE OF org_id, entity_id, recipient_person_id ON public.communication_scheduled_sends
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_communication_scheduled_sends_org_matches_entities();

DROP TRIGGER IF EXISTS trg_comm_sched_sends_updated_at ON public.communication_scheduled_sends;
CREATE TRIGGER trg_comm_sched_sends_updated_at
    BEFORE UPDATE ON public.communication_scheduled_sends
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- operational_tasks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operational_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    entity_type text NOT NULL DEFAULT 'opportunities'::text
        CHECK (entity_type = 'opportunities'::text),
    entity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    assigned_to_user_id uuid,
    created_by uuid NOT NULL,
    title text NOT NULL,
    description text,
    due_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'open'::text
        CHECK (status = ANY (ARRAY['open'::text, 'completed'::text, 'canceled'::text])),
    source text NOT NULL DEFAULT 'task_assist'::text
        CHECK (source = 'task_assist'::text),
    proposal_id uuid REFERENCES public.task_assist_proposals (id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.operational_tasks IS
    'Lightweight CRM tasks (V1.1 Task Assist reminders). Sync to opportunities.metadata.next_follow_up_at is app-layer (Card 3), not this migration.';

CREATE INDEX IF NOT EXISTS idx_operational_tasks_org_entity_status
    ON public.operational_tasks (org_id, entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_operational_tasks_org_due_open
    ON public.operational_tasks (org_id, due_at)
    WHERE status = 'open'::text;

CREATE OR REPLACE FUNCTION public.enforce_operational_tasks_org_matches_opportunity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    opp_org uuid;
BEGIN
    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.entity_id;
    IF opp_org IS NULL OR opp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'operational_tasks: entity org mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operational_tasks_org_entity ON public.operational_tasks;
CREATE TRIGGER trg_operational_tasks_org_entity
    BEFORE INSERT OR UPDATE OF org_id, entity_id ON public.operational_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_operational_tasks_org_matches_opportunity();

DROP TRIGGER IF EXISTS trg_operational_tasks_updated_at ON public.operational_tasks;
CREATE TRIGGER trg_operational_tasks_updated_at
    BEFORE UPDATE ON public.operational_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON FUNCTION public.enforce_task_assist_proposals_org_matches_opportunity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_communication_scheduled_sends_org_matches_entities() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_operational_tasks_org_matches_opportunity() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- RLS (aligned with communication_* + agent_v2 field visibility)
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_assist_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_scheduled_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_tasks ENABLE ROW LEVEL SECURITY;

-- task_assist_proposals
DROP POLICY IF EXISTS task_assist_proposals_select_org ON public.task_assist_proposals;
CREATE POLICY task_assist_proposals_select_org
    ON public.task_assist_proposals
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = task_assist_proposals.org_id
        )
    );

DROP POLICY IF EXISTS task_assist_proposals_insert_crm ON public.task_assist_proposals;
CREATE POLICY task_assist_proposals_insert_crm
    ON public.task_assist_proposals
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = task_assist_proposals.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS task_assist_proposals_update_crm ON public.task_assist_proposals;
CREATE POLICY task_assist_proposals_update_crm
    ON public.task_assist_proposals
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = task_assist_proposals.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = task_assist_proposals.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS task_assist_proposals_service_all ON public.task_assist_proposals;
CREATE POLICY task_assist_proposals_service_all
    ON public.task_assist_proposals
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- communication_scheduled_sends
DROP POLICY IF EXISTS communication_scheduled_sends_select_org ON public.communication_scheduled_sends;
CREATE POLICY communication_scheduled_sends_select_org
    ON public.communication_scheduled_sends
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = communication_scheduled_sends.org_id
        )
    );

DROP POLICY IF EXISTS communication_scheduled_sends_mutate_crm ON public.communication_scheduled_sends;
CREATE POLICY communication_scheduled_sends_mutate_crm
    ON public.communication_scheduled_sends
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = communication_scheduled_sends.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS communication_scheduled_sends_update_crm ON public.communication_scheduled_sends;
CREATE POLICY communication_scheduled_sends_update_crm
    ON public.communication_scheduled_sends
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = communication_scheduled_sends.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = communication_scheduled_sends.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS communication_scheduled_sends_service_all ON public.communication_scheduled_sends;
CREATE POLICY communication_scheduled_sends_service_all
    ON public.communication_scheduled_sends
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- operational_tasks
DROP POLICY IF EXISTS operational_tasks_select_org ON public.operational_tasks;
CREATE POLICY operational_tasks_select_org
    ON public.operational_tasks
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = operational_tasks.org_id
        )
    );

DROP POLICY IF EXISTS operational_tasks_insert_crm ON public.operational_tasks;
CREATE POLICY operational_tasks_insert_crm
    ON public.operational_tasks
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = operational_tasks.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS operational_tasks_update_crm ON public.operational_tasks;
CREATE POLICY operational_tasks_update_crm
    ON public.operational_tasks
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = operational_tasks.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = operational_tasks.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS operational_tasks_service_all ON public.operational_tasks;
CREATE POLICY operational_tasks_service_all
    ON public.operational_tasks
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- Grants (match communications_v1)
GRANT ALL ON TABLE public.task_assist_proposals TO anon;
GRANT ALL ON TABLE public.task_assist_proposals TO authenticated;
GRANT ALL ON TABLE public.task_assist_proposals TO service_role;

GRANT ALL ON TABLE public.communication_scheduled_sends TO anon;
GRANT ALL ON TABLE public.communication_scheduled_sends TO authenticated;
GRANT ALL ON TABLE public.communication_scheduled_sends TO service_role;

GRANT ALL ON TABLE public.operational_tasks TO anon;
GRANT ALL ON TABLE public.operational_tasks TO authenticated;
GRANT ALL ON TABLE public.operational_tasks TO service_role;

REVOKE ALL ON TABLE public.task_assist_proposals FROM anon;
REVOKE ALL ON TABLE public.communication_scheduled_sends FROM anon;
REVOKE ALL ON TABLE public.operational_tasks FROM anon;
