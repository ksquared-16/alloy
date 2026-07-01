-- =============================================================================
-- Option Sets Phase 1: config column + reference-backed platform seeds
-- =============================================================================
-- Adds option_sets.config for static | reference modes.
-- Seeds schools / programs / rooms reference option sets per org (vocabulary only).
-- Runtime resolution remains on legacy option_source until Phase 2.
-- =============================================================================

ALTER TABLE public.option_sets
    ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.option_sets.config IS
    'Option set mode and reference resolution config (static | reference). See docs/system/option-sets-system.md';

-- Schools: active sites from locations hierarchy
INSERT INTO public.option_sets (org_id, set_key, label, sort_order, config)
SELECT
    o.id,
    'schools',
    'Schools',
    100,
    '{
        "version": 1,
        "mode": "reference",
        "reference": {
            "entity": "locations",
            "value_field": "id",
            "label_field": "label",
            "filters": [{ "field": "location_type", "operator": "eq", "value": "site" }]
        }
    }'::jsonb
FROM public.orgs o
ON CONFLICT (org_id, set_key) DO NOTHING;

-- Programs: location-owned program categories; cascade on site selection
INSERT INTO public.option_sets (org_id, set_key, label, sort_order, config)
SELECT
    o.id,
    'programs',
    'Programs',
    110,
    '{
        "version": 1,
        "mode": "reference",
        "reference": {
            "entity": "location_program_categories",
            "value_field": "id",
            "label_field": "label"
        },
        "cascade": {
            "depends_on": [{ "bind_to_filter": "location_id" }]
        }
    }'::jsonb
FROM public.orgs o
ON CONFLICT (org_id, set_key) DO NOTHING;

-- Rooms: active units; cascade on school + optional program category
INSERT INTO public.option_sets (org_id, set_key, label, sort_order, config)
SELECT
    o.id,
    'rooms',
    'Rooms',
    120,
    '{
        "version": 1,
        "mode": "reference",
        "reference": {
            "entity": "locations",
            "value_field": "id",
            "label_field": "label",
            "filters": [{ "field": "location_type", "operator": "eq", "value": "unit" }]
        },
        "cascade": {
            "depends_on": [
                { "bind_to_filter": "parent_location_id" },
                { "bind_to_metadata": "category", "optional": true }
            ]
        }
    }'::jsonb
FROM public.orgs o
ON CONFLICT (org_id, set_key) DO NOTHING;

-- Backfill config on rows created before this migration (do not overwrite customized config)
UPDATE public.option_sets os
SET
    config = seed.config,
    label = seed.label,
    sort_order = seed.sort_order,
    updated_at = now()
FROM (
    VALUES
        (
            'schools',
            'Schools',
            100,
            '{
                "version": 1,
                "mode": "reference",
                "reference": {
                    "entity": "locations",
                    "value_field": "id",
                    "label_field": "label",
                    "filters": [{ "field": "location_type", "operator": "eq", "value": "site" }]
                }
            }'::jsonb
        ),
        (
            'programs',
            'Programs',
            110,
            '{
                "version": 1,
                "mode": "reference",
                "reference": {
                    "entity": "location_program_categories",
                    "value_field": "id",
                    "label_field": "label"
                },
                "cascade": {
                    "depends_on": [{ "bind_to_filter": "location_id" }]
                }
            }'::jsonb
        ),
        (
            'rooms',
            'Rooms',
            120,
            '{
                "version": 1,
                "mode": "reference",
                "reference": {
                    "entity": "locations",
                    "value_field": "id",
                    "label_field": "label",
                    "filters": [{ "field": "location_type", "operator": "eq", "value": "unit" }]
                },
                "cascade": {
                    "depends_on": [
                        { "bind_to_filter": "parent_location_id" },
                        { "bind_to_metadata": "category", "optional": true }
                    ]
                }
            }'::jsonb
        )
) AS seed(set_key, label, sort_order, config)
WHERE os.set_key = seed.set_key
  AND (os.config = '{}'::jsonb OR os.config IS NULL OR os.config->>'mode' IS NULL);
