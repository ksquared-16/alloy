-- =============================================================================
-- Promote canonical system field registry (Bend source org → one target org)
-- =============================================================================
-- Source: public.orgs.id = 7803388d-cdee-4afb-89cf-23a137f39423 (Alloy Bend),
--         which owns the staging-aligned field_section_definitions + richer
--         field_definitions from 20260402143000_public_booking_field_config_seed.sql
--         and subsequent migrations.
--
-- Target: ONE destination org (e.g. new childcare tenant). Before deploying to
-- an environment, replace c_target_org_id below with that environment's
-- public.orgs.id. Default placeholder is not expected to exist → migration
-- no-ops with NOTICE (safe on CI / DBs without that org).
--
-- Copies ONLY:
--   1) public.field_section_definitions (all rows for source org)
--   2) public.field_definitions WHERE is_system = true for source org
--
-- Does NOT copy: field_values, is_system = false definitions, other tables.
--
-- Idempotency: INSERT … ON CONFLICT DO NOTHING on org-scoped unique keys.
-- Does not UPDATE existing rows (no overwrite of labels/config on target).
-- =============================================================================

DO $body$
DECLARE
  c_source_org_id constant uuid := '7803388d-cdee-4afb-89cf-23a137f39423'::uuid;
  -- >>> Replace with destination public.orgs.id before staging/production push <<<
  c_target_org_id constant uuid := '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
  n_sections integer := 0;
  n_defs integer := 0;
BEGIN
  IF c_target_org_id = c_source_org_id THEN
    RAISE NOTICE 'field_registry_promote: target equals source; skip';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = c_source_org_id) THEN
    RAISE NOTICE 'field_registry_promote: source org % not found; skip', c_source_org_id;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = c_target_org_id) THEN
    RAISE NOTICE
      'field_registry_promote: target org % not found — replace c_target_org_id in this migration with a real org id, then apply a follow-up migration or re-run after org exists; skip',
      c_target_org_id;
    RETURN;
  END IF;

  INSERT INTO public.field_section_definitions (
    org_id,
    entity_type,
    section_key,
    label,
    description,
    sort_order,
    created_at,
    updated_at
  )
  SELECT
    c_target_org_id,
    s.entity_type,
    s.section_key,
    s.label,
    s.description,
    s.sort_order,
    now(),
    now()
  FROM public.field_section_definitions s
  WHERE s.org_id = c_source_org_id
  ON CONFLICT (org_id, entity_type, section_key) DO NOTHING;

  GET DIAGNOSTICS n_sections = ROW_COUNT;

  INSERT INTO public.field_definitions (
    org_id,
    entity_type,
    field_key,
    label,
    description,
    field_type,
    is_system,
    is_required,
    is_active,
    is_visible_in_form,
    is_visible_in_drawer,
    is_visible_in_table,
    is_filterable,
    is_sortable,
    section_key,
    sort_order,
    placeholder,
    help_text,
    config,
    is_visible_in_public_booking,
    created_at,
    updated_at
  )
  SELECT
    c_target_org_id,
    d.entity_type,
    d.field_key,
    d.label,
    d.description,
    d.field_type,
    d.is_system,
    d.is_required,
    d.is_active,
    d.is_visible_in_form,
    d.is_visible_in_drawer,
    d.is_visible_in_table,
    d.is_filterable,
    d.is_sortable,
    d.section_key,
    d.sort_order,
    d.placeholder,
    d.help_text,
    COALESCE(d.config, '{}'::jsonb),
    d.is_visible_in_public_booking,
    now(),
    now()
  FROM public.field_definitions d
  WHERE d.org_id = c_source_org_id
    AND d.is_system IS TRUE
  ON CONFLICT (org_id, entity_type, field_key) DO NOTHING;

  GET DIAGNOSTICS n_defs = ROW_COUNT;

  RAISE NOTICE 'field_registry_promote: attempted inserts — field_section_definitions row_count %, field_definitions row_count % (conflicts count as 0)', n_sections, n_defs;
END
$body$;
