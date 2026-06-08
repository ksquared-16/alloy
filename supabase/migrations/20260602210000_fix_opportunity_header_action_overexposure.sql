-- =============================================================================
-- Fix opportunity drawer header action overexposure (Phase 1B/3 regression)
-- =============================================================================
-- Doctrine: action_definitions are capabilities; drawer header pills are curated
-- placements only. Deactivate overly broad default record_header placements.
-- Queue row, record_section, BOS, tasks, workflows, and Settings remain valid.
-- Docs: docs/sprints/05_2026/configured_drawer_actions_fix.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Universal comms/utility actions — remove default record_header exposure
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET is_active = false, updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ap.org_id IS NULL
  AND ad.org_id IS NULL
  AND ap.surface = 'record_header'
  AND ap.entity_type = 'opportunity'
  AND ad.key IN (
      'send_email',
      'send_sms',
      'call_parent',
      'send_form',
      'add_note',
      'create_task',
      'upload_document'
  );

-- ---------------------------------------------------------------------------
-- 2) add_family_member — header → family_contacts section (not header rail)
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET is_active = false, updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ad.org_id IS NULL
  AND ad.key = 'add_family_member'
  AND ap.surface = 'record_header'
  AND ap.entity_type = 'opportunity';

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
    'family_contacts'::text,
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
        AND p.action_definition_id = d.id
        AND p.surface = 'record_section'
        AND p.slot = 'secondary'
        AND p.entity_type = 'opportunity'
        AND p.section_key = 'family_contacts'
  );

-- ---------------------------------------------------------------------------
-- 3) Update status — not a default header pill (enrollment org placements)
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET is_active = false, updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ad.key = 'update_status_add_note'
  AND ap.surface = 'record_header'
  AND ap.entity_type = 'opportunity';

-- ---------------------------------------------------------------------------
-- 4) Org enrollment placeholders — not default header pills
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET is_active = false, updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ad.key IN (
      'send_paperwork_placeholder',
      'add_to_waitlist_placeholder',
      'convert_to_enrolled_placeholder'
  )
  AND ap.surface = 'record_header'
  AND ap.entity_type = 'opportunity';

-- ---------------------------------------------------------------------------
-- 5) review_enrollment_packet — overflow only (not primary header pill)
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET
    slot = 'overflow',
    display_style = 'menu_item',
    updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ap.org_id IS NULL
  AND ad.org_id IS NULL
  AND ad.key = 'review_enrollment_packet'
  AND ap.surface = 'record_header'
  AND ap.slot = 'primary'
  AND ap.entity_type = 'opportunity';
