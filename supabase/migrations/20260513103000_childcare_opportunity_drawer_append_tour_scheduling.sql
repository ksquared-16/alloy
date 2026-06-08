-- =============================================================================
-- Childcare / enrollment: opportunity drawer — append Tour Scheduling section
-- =============================================================================
-- Tour Scheduling V1 (Card 6) shows the synthetic drawer section only when
-- `record_drawer_layouts.config_json.overview_section_order` includes the key
-- `tour_scheduling` (see `recordOpportunityDrawerLayoutIncludesSection`).
--
-- Scope: (1) orgs in industry `childcare`, OR (2) explicit pilot org from Tour V1 QA
--   (layout fingerprint matched workflow v3 inquiry drawer — ensures fix if industry mis-tagged).
-- Row filter: entity_type = 'opportunity', surface = 'drawer', key = 'default', is_active
--   (same pattern as 20260424190000 / 20260430203000 / 20260430240000).
--
-- Idempotency:
--   - Skips rows where `overview_section_order` already contains `tour_scheduling` (no duplicate).
--   - Appends only; does not remove or reorder existing section keys.
--
-- overview_hidden_sections vs tour_scheduling:
--   - Legacy key `tour` hides field-definition grouping sections with section.key === 'tour'.
--   - `inquiry_tour_followup` is a workflow virtual section key (tour_date fields), not the
--     V1 `tour_scheduling` panel (EntityDrawerSectionConfig.key === 'tour_scheduling').
--   - UI filters hidden by exact key match (`AdminEntityDrawer`); `tour_scheduling` is not
--     listed in childcare hidden lists, so no migration change to `overview_hidden_sections`.
-- =============================================================================

WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
),
pilot_orgs AS (
    SELECT unnest(ARRAY['93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid]) AS org_id
),
target_orgs AS (
    SELECT org_id FROM childcare_orgs
    UNION
    SELECT org_id FROM pilot_orgs
),
target_rows AS (
    SELECT r.id
    FROM public.record_drawer_layouts r
    JOIN target_orgs t ON t.org_id = r.org_id
    WHERE r.entity_type = 'opportunity'
      AND r.surface = 'drawer'
      AND r.key = 'default'
      AND COALESCE(r.is_active, true) = true
      AND NOT (
          COALESCE(r.config_json -> 'overview_section_order', '[]'::jsonb) @> '"tour_scheduling"'::jsonb
      )
)
UPDATE public.record_drawer_layouts r
SET
    config_json = jsonb_set(
        COALESCE(r.config_json, '{}'::jsonb),
        '{overview_section_order}',
        COALESCE(r.config_json -> 'overview_section_order', '[]'::jsonb) || jsonb_build_array('tour_scheduling'),
        true
    ),
    updated_at = now()
WHERE r.id IN (SELECT id FROM target_rows);
