-- =============================================================================
-- Opportunity record chrome: layout + actions + needs_a_quote status (Bend / home_services)
-- =============================================================================
-- Idempotent where possible. Service role / admin applies in deploy.
-- =============================================================================

-- needs_a_quote — used by book-v2 + Growth start_quote action; must pass assertAllowedStatusKey on PATCH.
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
    NULL::uuid,
    'opportunities',
    'needs_a_quote',
    'Needs a quote',
    15,
    true,
    true,
    'home_services',
    '{}'::jsonb
WHERE NOT EXISTS (
      SELECT 1
      FROM public.status_definitions sd
      WHERE sd.org_id IS NULL
        AND sd.entity_type = 'opportunities'
        AND sd.status_key = 'needs_a_quote'
        AND COALESCE(sd.industry_key, '') = 'home_services'
  );

INSERT INTO public.record_layouts (entity_type, key, config_json, is_active)
VALUES (
    'opportunity',
    'default',
    $json$
{
  "version": 1,
  "overview_section_order": [
    "overview"
  ]
}
$json$::jsonb,
    true
)
ON CONFLICT (entity_type, key) DO UPDATE SET
    config_json = EXCLUDED.config_json,
    is_active = EXCLUDED.is_active;

INSERT INTO public.record_actions (entity_type, action_key, label, event_key, placement, is_active)
VALUES
    ('opportunity', 'qualify_opportunity', 'Qualify', 'qualify_opportunity', 'primary', true),
    ('opportunity', 'start_quote', 'Start quote', 'start_quote', 'secondary', true),
    ('opportunity', 'mark_lost', 'Mark lost', 'mark_lost', 'secondary', true)
ON CONFLICT (entity_type, action_key) DO UPDATE SET
    label = EXCLUDED.label,
    event_key = EXCLUDED.event_key,
    placement = EXCLUDED.placement,
    is_active = EXCLUDED.is_active;
