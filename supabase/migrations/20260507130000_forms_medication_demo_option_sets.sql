-- =============================================================================
-- Forms Engine V1.1 — medication authorization DEMO option_sets + items (Card 2.5)
-- =============================================================================
-- Seeds org-scoped sets referenced by medication_authorization_demo schema:
--   med_demo_schedule, med_demo_route
-- Same Bend demo org UUID as `20260506120000_forms_medication_authorization_demo_seed.sql`.
-- Idempotent: upserts sets + items on conflict.
-- =============================================================================

DO $$
DECLARE
    v_org uuid := '7803388d-cdee-4afb-89cf-23a137f39423'::uuid;
    v_schedule_set uuid;
    v_route_set uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org) THEN
        RAISE NOTICE 'forms medication demo option_sets skipped — org % not found', v_org;
        RETURN;
    END IF;

    INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
    VALUES
        (v_org, 'med_demo_schedule', 'Medication schedule (demo)', 900),
        (v_org, 'med_demo_route', 'Medication route (demo)', 901)
    ON CONFLICT (org_id, set_key) DO UPDATE SET
        label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order,
        updated_at = now();

    SELECT id INTO v_schedule_set FROM public.option_sets WHERE org_id = v_org AND set_key = 'med_demo_schedule';
    SELECT id INTO v_route_set FROM public.option_sets WHERE org_id = v_org AND set_key = 'med_demo_route';

    INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order, metadata)
    SELECT v_schedule_set, v.item_key, v.label, v.sort_order, '{}'::jsonb
    FROM (
        VALUES
            ('daily'::text, 'Daily'::text, 10),
            ('twice_daily', 'Twice daily', 20),
            ('as_needed', 'As needed', 30),
            ('other', 'Other', 40)
    ) AS v(item_key, label, sort_order)
    ON CONFLICT (option_set_id, item_key) DO UPDATE SET
        label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order,
        updated_at = now();

    INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order, metadata)
    SELECT v_route_set, v.item_key, v.label, v.sort_order, '{}'::jsonb
    FROM (
        VALUES
            ('oral'::text, 'Oral'::text, 10),
            ('topical', 'Topical', 20),
            ('inhaled', 'Inhaled', 30),
            ('injection', 'Injection', 40),
            ('other', 'Other', 50)
    ) AS v(item_key, label, sort_order)
    ON CONFLICT (option_set_id, item_key) DO UPDATE SET
        label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order,
        updated_at = now();
END $$;
