-- =============================================================================
-- Childcare layout field catalog — corrected starter field_definitions (DRAFT)
-- =============================================================================
-- Aligns with docs/platform_convergence/childcare_field_catalog_source_matrix.md
-- and web/lib/layout/childcareLayoutFieldCatalog.ts
--
-- DRAFT ONLY — do not apply until product sign-off on final source matrix section.
--
-- Does NOT seed:
--   - child profile/medical fields on person entity (use future customer_member migration)
--   - relationship-projection duplicates (household contacts/address)
--   - misaligned location metadata keys (name/address_line1)
--   - lead-level enrollment duplicates (program/schedule/desired_start on opportunity)
-- =============================================================================

-- Option sets for config-backed selects
INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT o.id, v.set_key, v.label, v.ord
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('communication_preference'::text, 'Communication preference'::text, 240::int)
) AS v (set_key, label, ord)
ON CONFLICT (org_id, set_key) DO NOTHING;

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
SELECT os.id, it.item_key, it.label, it.ord
FROM public.option_sets os
INNER JOIN (
    VALUES
        ('communication_preference', 'email', 'Email', 10),
        ('communication_preference', 'sms', 'SMS', 20),
        ('communication_preference', 'phone', 'Phone', 30)
) AS it (set_key, item_key, label, ord)
    ON os.set_key = it.set_key
ON CONFLICT (option_set_id, item_key) DO NOTHING;

-- Sections
INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
SELECT o.id, v.entity_type, v.section_key, v.label, v.description, v.sort_order, now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('opportunity', 'tour', 'Tour', 'Tour scheduling', 40),
        ('person', 'contact_profile', 'Contact profile', 'Parent and contact details', 35),
        ('customer', 'household', 'Household', 'Household profile', 20)
) AS v (entity_type, section_key, label, description, sort_order)
ON CONFLICT (org_id, entity_type, section_key) DO UPDATE SET
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- Safe-to-seed catalog field_definitions (person contact + tour + household notes only)
INSERT INTO public.field_definitions (
    org_id, entity_type, field_key, label, description, field_type,
    is_system, is_required, is_active, is_visible_in_form, is_visible_in_drawer,
    is_visible_in_table, is_filterable, is_sortable, section_key, sort_order, config, updated_at
)
SELECT
    o.id, v.entity_type, v.field_key, v.label, v.description, v.field_type,
    v.is_system, false, true, true, true, false, false, false,
    v.section_key, v.sort_order, v.config::jsonb, now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        -- Lead / opportunity (case-level; no per-child enrollment duplicates)
        ('opportunity', 'tour_date', 'Tour date', 'Scheduled tour date', 'date', false, 'tour', 70, '{}'),
        ('opportunity', 'tour_time', 'Tour time', 'Scheduled tour time', 'text', false, 'tour', 80, '{}'),
        ('opportunity', 'tour_status', 'Tour status', 'Tour scheduling status', 'status', false, 'tour', 90, '{}'),
        -- Person / parent contact (person-level only — not child profile)
        ('person', 'communication_preference', 'Communication preference', 'Preferred communication channel', 'select', false, 'contact_profile', 60, '{"option_set_key":"communication_preference"}'),
        ('person', 'sms_opt_in', 'SMS opt-in', 'Consent to receive SMS messages', 'boolean', false, 'consent', 240, '{}'),
        ('person', 'email_opt_in', 'Email opt-in', 'Consent to receive email messages', 'boolean', false, 'consent', 250, '{}'),
        ('person', 'employer', 'Employer', 'Employer or workplace', 'text', false, 'contact_profile', 65, '{}'),
        ('person', 'contact_notes', 'Notes', 'Notes about this contact', 'text', false, 'contact_profile', 70, '{}'),
        -- Household / customer (config only; contacts/address are relationship projections)
        ('customer', 'family_notes', 'Family notes', 'Internal notes about the household', 'text', false, 'notes', 50, '{}')
) AS v (entity_type, field_key, label, description, field_type, is_system, section_key, sort_order, config)
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_visible_in_drawer = true,
    is_active = true,
    updated_at = now();

-- Child profile config belongs in FC-CM-1 migration:
--   supabase/migrations/20260609120000_customer_member_field_definitions_fc_cm1.sql

-- Deactivate wrong seeds from prior layout-catalog migration drafts (safe if never applied)
UPDATE public.field_definitions
SET is_active = false, is_visible_in_drawer = false, updated_at = now()
WHERE (entity_type, field_key) IN (
    ('opportunity', 'desired_start_date'),
    ('opportunity', 'program_type'),
    ('opportunity', 'schedule_type'),
    ('opportunity', 'channel'),
    ('opportunity', 'campaign'),
    ('person', 'relationship_to_child'),
    ('person', 'special_instructions'),
    ('customer', 'primary_contact'),
    ('customer', 'secondary_contact'),
    ('customer', 'address_line1'),
    ('customer', 'household_status'),
    ('customer', 'name'),
    ('location', 'operating_hours'),
    ('location', 'status'),
    ('location', 'address_line1'),
    ('location', 'name')
);
