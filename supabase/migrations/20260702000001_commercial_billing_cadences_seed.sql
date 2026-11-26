-- =============================================================================
-- Commercial Billing Cadences — option set seed (per org)
-- =============================================================================
-- Ownership: Commercial domain. These are billing frequency options, not
-- operational attendance patterns (those live in program_offerings).
--
-- Set key: commercial_billing_cadence
-- Items: weekly | biweekly | monthly | annual | daily | hourly | per_session
--
-- Seeded for all existing orgs. New orgs should receive this seed at onboarding.
-- Item keys are immutable; labels are operator-editable via option-sets API.
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    v_set_id uuid;
BEGIN
    FOR r IN SELECT id FROM public.orgs LOOP
        -- Upsert the option set
        INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
        VALUES (r.id, 'commercial_billing_cadence', 'Billing Cadences', 0)
        ON CONFLICT (org_id, set_key) DO UPDATE SET
            label = EXCLUDED.label,
            updated_at = now();

        SELECT id INTO v_set_id
        FROM public.option_sets
        WHERE org_id = r.id AND set_key = 'commercial_billing_cadence';

        -- Seed items (idempotent — skip if item_key already exists for this set)
        INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order, metadata)
        VALUES
            (v_set_id, 'weekly',      'Weekly',      10, '{"billing_days": 7}'),
            (v_set_id, 'biweekly',    'Bi-weekly',   20, '{"billing_days": 14}'),
            (v_set_id, 'monthly',     'Monthly',     30, '{"billing_days": null}'),
            (v_set_id, 'annual',      'Annual',      40, '{"billing_days": null}'),
            (v_set_id, 'daily',       'Daily',       50, '{"billing_days": 1}'),
            (v_set_id, 'hourly',      'Hourly',      60, '{"billing_days": null}'),
            (v_set_id, 'per_session', 'Per Session', 70, '{"billing_days": null}')
        ON CONFLICT (option_set_id, item_key) DO NOTHING;
    END LOOP;
END;
$$;
