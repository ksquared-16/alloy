-- =============================================================================
-- Reusable relationship action (v1): add_related_person
-- - Registry-driven open_form action to add/link a person to a household/customer.
-- - Placement: opportunities drawer section (record_section) under existing section_key.
-- - Global seed (org_id NULL) so it can be reused across orgs; org-specific overrides remain possible.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Action definition (global template)
-- ---------------------------------------------------------------------------

INSERT INTO public.action_definitions (
    org_id,
    key,
    label,
    description,
    entity_type,
    action_type,
    priority,
    payload_schema,
    is_active
)
SELECT
    NULL::uuid,
    'add_related_person'::text,
    'Add parent/contact'::text,
    'Create or link a person and associate them to the household/customer.'::text,
    'opportunity'::text,
    'open_form'::text,
    80,
    jsonb_build_object(
        'form_key', 'add_related_person',
        'required_fields', jsonb_build_array('first_name', 'last_name'),
        'optional_fields', jsonb_build_array('phone', 'email', 'role_type')
    ),
    true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key = 'add_related_person'
);

-- ---------------------------------------------------------------------------
-- 2) Placement: opportunity drawer section (record_section)
--    Use existing section_key in opportunity presentation: `customer_booking`
-- ---------------------------------------------------------------------------

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
    ad.id,
    'record_section'::text,
    'secondary'::text,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    'customer_booking'::text,
    30,
    'button'::text,
    true
FROM public.action_definitions ad
WHERE ad.org_id IS NULL
  AND ad.key = 'add_related_person'
  AND NOT EXISTS (
      SELECT 1
      FROM public.action_placements ap
      WHERE ap.org_id IS NULL
        AND ap.action_definition_id = ad.id
        AND ap.surface = 'record_section'
        AND ap.slot = 'secondary'
        AND ap.entity_type IS NOT DISTINCT FROM 'opportunity'::text
        AND ap.section_key IS NOT DISTINCT FROM 'customer_booking'::text
  );

