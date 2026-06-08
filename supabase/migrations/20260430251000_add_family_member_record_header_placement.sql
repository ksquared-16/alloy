-- Move add_family_member CTA to opportunity drawer header (record_header / secondary), config-driven.
-- Remove redundant record_section placement on family_contacts (header is canonical).

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
    'record_header'::text,
    'secondary'::text,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    25,
    'button'::text,
    true
FROM public.action_definitions d
WHERE d.org_id IS NULL
  AND d.key = 'add_family_member'
  AND NOT EXISTS (
      SELECT 1
      FROM public.action_placements p
      WHERE p.org_id IS NULL
        AND p.surface = 'record_header'
        AND p.slot = 'secondary'
        AND p.entity_type = 'opportunity'
        AND p.action_definition_id = d.id
  );

DELETE FROM public.action_placements ap
USING public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ad.org_id IS NULL
  AND ad.key = 'add_family_member'
  AND ap.surface = 'record_section'
  AND ap.slot = 'secondary'
  AND ap.entity_type IS NOT DISTINCT FROM 'opportunity'::text
  AND ap.section_key IS NOT DISTINCT FROM 'family_contacts'::text;
