-- =============================================================================
-- process_instances — the generic platform primitive for a running operational journey
-- =============================================================================
-- Doctrine: a Process Instance is the running operational journey of a SUBJECT through a
-- PROCESS, within a CONTEXT. Work attaches to it; outcomes move it; Work Views read it.
--   Enrollment:  process_key='enrollment_process', subject=child (customer_member),
--                context=lead (opportunity), stage_key=position, state=durable enrollment state.
-- This REPLACES opportunity_customer_members (OCM) as the runtime owner of child participation.
-- OCM remains only as a temporary migration/data source; see the removal plan doc.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.process_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    -- WHICH process is running (generic; e.g. enrollment_process, and later billing/attendance/…).
    process_key text NOT NULL,
    -- The durable SUBJECT of the journey (generic). Enrollment: 'child' → customer_members.id.
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    -- The CONTEXT the journey runs in (generic, optional). Enrollment: 'opportunity' → opportunities.id.
    context_type text,
    context_id uuid,
    -- RUNTIME position + durable state (the journey). state replaces OCM.outcome_status_key.
    stage_key text,
    state text,
    close_reason_key text,
    -- Domain participation payload (enrollment: start_date, schedule_type, program_category_id,
    -- location_id, program_room_cohort_key, notes). Kept generic in metadata so the primitive is domain-free.
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

COMMENT ON TABLE public.process_instances IS
    'Generic running operational journey: a SUBJECT through a PROCESS within a CONTEXT. Runtime owner of child participation for Enrollment (replaces opportunity_customer_members).';
COMMENT ON COLUMN public.process_instances.state IS
    'Durable process state (replaces opportunity_customer_members.outcome_status_key). Enrollment: null|waitlisted|enrolling|enrolled|withdrawn|not_enrolling.';
COMMENT ON COLUMN public.process_instances.stage_key IS
    'Current process stage (position), written only by outcome execution + intake.';

-- One running instance per (process, subject, context).
CREATE UNIQUE INDEX IF NOT EXISTS ux_process_instances_scope
    ON public.process_instances (org_id, process_key, subject_id, context_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_stage
    ON public.process_instances (org_id, process_key, stage_key) WHERE stage_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_process_instances_context
    ON public.process_instances (org_id, context_id) WHERE context_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_process_instances_subject
    ON public.process_instances (org_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_state
    ON public.process_instances (org_id, process_key, state) WHERE state IS NOT NULL;

-- -----------------------------------------------------------------------------
-- RLS (org-scoped, consistent with other operational tables)
-- -----------------------------------------------------------------------------
ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS process_instances_select_org ON public.process_instances;
CREATE POLICY process_instances_select_org ON public.process_instances
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS process_instances_write_org ON public.process_instances;
CREATE POLICY process_instances_write_org ON public.process_instances
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));
