-- Platform vertical: childcare (FK target for customers.vertical_id, opportunities.vertical_id, etc.)
-- industries.key = 'childcare' is separate; verticals.slug aligns with product vertical_key usage.
-- Idempotent: safe on fresh DBs and when row already exists (e.g. manual inserts).

INSERT INTO public.verticals (name, slug, is_active, settings, metadata)
VALUES (
    'Childcare',
    'childcare',
    true,
    '{}'::jsonb,
    jsonb_build_object('seed_source', 'platform_vertical_childcare')
)
ON CONFLICT (slug) DO UPDATE SET
    is_active = true,
    name = EXCLUDED.name,
    updated_at = now();
