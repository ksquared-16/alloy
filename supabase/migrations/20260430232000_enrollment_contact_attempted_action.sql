-- =============================================================================
-- Enrollment CRM action (v1): contact_attempted
-- - Registry-driven open_form action that logs a contact attempt and sets status_key.
-- - Scoped placements for Enrollment work units (queue_row + record_header).
-- - Ensures status_definitions includes contact_attempted for those orgs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Status definition: ensure `contact_attempted` exists for Enrollment orgs.
-- ---------------------------------------------------------------------------

INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    industry_key,
    metadata
)
SELECT
    d.org_id,
    'opportunities'::text,
    'contact_attempted'::text,
    'Contact attempted'::text,
    22,
    true,
    false,
    NULL::text,
    '{}'::jsonb
FROM public.departments d
WHERE lower(coalesce(d.key, '')) = 'enrollment'
  AND d.org_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.status_definitions sd
      WHERE sd.org_id = d.org_id
        AND sd.entity_type = 'opportunities'
        AND sd.status_key = 'contact_attempted'
  );

-- ---------------------------------------------------------------------------
-- Action definition: contact_attempted (open_form)
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
    d.org_id,
    'contact_attempted'::text,
    'Log contact attempt'::text,
    'Log a contact attempt and move inquiry forward'::text,
    'opportunity'::text,
    'open_form'::text,
    35,
    '{
      "form_key": "contact_attempted",
      "required_fields": [],
      "submit_action_type": "update_status",
      "after": { "update_status_key": "contact_attempted" }
    }'::jsonb,
    true
FROM public.departments d
WHERE lower(coalesce(d.key, '')) = 'enrollment'
  AND d.org_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.action_definitions ad
      WHERE ad.org_id = d.org_id
        AND ad.key = 'contact_attempted'
  );

-- ---------------------------------------------------------------------------
-- Placements: scoped to Enrollment work units (queue_row + record_header)
-- ---------------------------------------------------------------------------

INSERT INTO public.action_placements (
    org_id,
    action_definition_id,
    surface,
    slot,
    entity_type,
    department_id,
    work_unit_id,
    order_index,
    display_style,
    is_active
)
SELECT
    d.org_id,
    ad.id,
    'queue_row'::text,
    'row_inline'::text,
    'opportunity'::text,
    d.id,
    wu.id,
    15,
    'button'::text,
    true
FROM public.departments d
JOIN public.work_units wu ON wu.department_id = d.id
JOIN public.action_definitions ad ON ad.org_id = d.org_id AND ad.key = 'contact_attempted'
WHERE lower(coalesce(d.key, '')) = 'enrollment'
  AND d.org_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.action_placements p
      WHERE p.org_id = d.org_id
        AND p.surface = 'queue_row'
        AND p.slot = 'row_inline'
        AND p.action_definition_id = ad.id
        AND p.entity_type = 'opportunity'
        AND p.department_id IS NOT DISTINCT FROM d.id
        AND p.work_unit_id IS NOT DISTINCT FROM wu.id
  );

INSERT INTO public.action_placements (
    org_id,
    action_definition_id,
    surface,
    slot,
    entity_type,
    department_id,
    work_unit_id,
    order_index,
    display_style,
    is_active
)
SELECT
    d.org_id,
    ad.id,
    'record_header'::text,
    'secondary'::text,
    'opportunity'::text,
    d.id,
    wu.id,
    25,
    'button'::text,
    true
FROM public.departments d
JOIN public.work_units wu ON wu.department_id = d.id
JOIN public.action_definitions ad ON ad.org_id = d.org_id AND ad.key = 'contact_attempted'
WHERE lower(coalesce(d.key, '')) = 'enrollment'
  AND d.org_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.action_placements p
      WHERE p.org_id = d.org_id
        AND p.surface = 'record_header'
        AND p.slot = 'secondary'
        AND p.action_definition_id = ad.id
        AND p.entity_type = 'opportunity'
        AND p.department_id IS NOT DISTINCT FROM d.id
        AND p.work_unit_id IS NOT DISTINCT FROM wu.id
  );

