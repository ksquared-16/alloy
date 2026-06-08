-- =============================================================================
-- Status transition guardrails (v1): configurable rules enforced server-side
-- =============================================================================
-- - Extends existing `status_definitions` foundation (does not duplicate status catalog).
-- - Rules are org-scoped; optional department/work-unit/action scoping.
-- - Enforced in admin action executor + direct PATCH routes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.status_transition_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    entity_type text NOT NULL,
    department_id uuid NULL REFERENCES public.departments (id) ON DELETE CASCADE,
    work_unit_id uuid NULL REFERENCES public.work_units (id) ON DELETE CASCADE,
    action_key text NULL,
    from_status_key text NULL,
    to_status_key text NOT NULL,
    required_metadata_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    required_payload_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    blocked boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    message text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.status_transition_rules IS
  'Org-scoped guardrails for status_key transitions; enforced by admin APIs and action executor.';

CREATE INDEX IF NOT EXISTS idx_status_transition_rules_org_entity_to
    ON public.status_transition_rules (org_id, entity_type, to_status_key)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_status_transition_rules_org_entity_scope
    ON public.status_transition_rules (org_id, entity_type, department_id, work_unit_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_status_transition_rules_org_entity_action
    ON public.status_transition_rules (org_id, entity_type, action_key)
    WHERE is_active = true AND action_key IS NOT NULL;

DROP TRIGGER IF EXISTS set_status_transition_rules_updated_at ON public.status_transition_rules;
CREATE TRIGGER set_status_transition_rules_updated_at
    BEFORE UPDATE ON public.status_transition_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.status_transition_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS status_transition_rules_select_authenticated ON public.status_transition_rules;
CREATE POLICY status_transition_rules_select_authenticated ON public.status_transition_rules
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS status_transition_rules_all_service_role ON public.status_transition_rules;
CREATE POLICY status_transition_rules_all_service_role ON public.status_transition_rules
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.status_transition_rules TO authenticated;
GRANT ALL ON TABLE public.status_transition_rules TO service_role;

-- -----------------------------------------------------------------------------
-- Seed Enrollment v1 rule (per Enrollment work unit)
-- - Moving an opportunity to `tour_scheduled` requires tour_date + tour_time in payload.
-- - Idempotent: INSERT WHERE NOT EXISTS.
-- -----------------------------------------------------------------------------

INSERT INTO public.status_transition_rules (
    org_id,
    entity_type,
    department_id,
    work_unit_id,
    action_key,
    from_status_key,
    to_status_key,
    required_metadata_fields,
    required_payload_fields,
    blocked,
    is_active,
    message
)
SELECT
    d.org_id,
    'opportunities'::text,
    d.id,
    wu.id,
    NULL::text,
    NULL::text,
    'tour_scheduled'::text,
    '[]'::jsonb,
    '["tour_date","tour_time"]'::jsonb,
    false,
    true,
    'Schedule a tour date and time before moving this inquiry to Tour scheduled.'
FROM public.departments d
JOIN public.work_units wu ON wu.department_id = d.id
WHERE lower(coalesce(d.key, '')) = 'enrollment'
  AND d.org_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.status_transition_rules r
      WHERE r.org_id = d.org_id
        AND r.entity_type = 'opportunities'
        AND r.to_status_key = 'tour_scheduled'
        AND r.department_id IS NOT DISTINCT FROM d.id
        AND r.work_unit_id IS NOT DISTINCT FROM wu.id
        AND r.action_key IS NULL
        AND r.from_status_key IS NULL
        AND r.is_active = true
  );

