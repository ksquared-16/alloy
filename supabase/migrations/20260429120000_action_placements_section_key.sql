-- Target section for record_section placements (v1: exact match on GET section_key param).

ALTER TABLE public.action_placements
    ADD COLUMN IF NOT EXISTS section_key text;

COMMENT ON COLUMN public.action_placements.section_key IS
    'When surface = record_section, resolver matches this to the client section_key query param (exact). NULL rows are ignored for record_section.';

CREATE INDEX IF NOT EXISTS idx_action_placements_record_section_scope
    ON public.action_placements (surface, entity_type, section_key, is_active)
    WHERE surface = 'record_section'::text AND is_active = true;

-- Enrollment / Opportunity: schedule tour from lifecycle body (config-driven; not header).
INSERT INTO public.action_placements (
    org_id,
    action_definition_id,
    surface,
    slot,
    entity_type,
    department_id,
    work_unit_id,
    section_key,
    order_index,
    display_style,
    is_active
)
SELECT
    NULL::uuid,
    d.id,
    'record_section'::text,
    'secondary'::text,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    'opportunity_lifecycle'::text,
    10,
    'button'::text,
    true
FROM public.action_definitions d
WHERE d.org_id IS NULL
  AND d.key = 'schedule_tour'
  AND NOT EXISTS (
        SELECT 1
        FROM public.action_placements p
        WHERE p.org_id IS NULL
          AND p.surface = 'record_section'
          AND p.entity_type = 'opportunity'
          AND p.section_key = 'opportunity_lifecycle'
          AND p.action_definition_id = d.id
    );
