-- =============================================================================
-- Childcare layout field catalog — starter field_definitions (all orgs)
-- =============================================================================
-- Seeds operator-facing fields for /adminV2/settings/layouts picker.
-- Aligns with web/lib/layout/childcareLayoutFieldCatalog.ts
-- Idempotent: ON CONFLICT DO NOTHING / UPDATE labels only where noted.
-- =============================================================================

-- Option sets used by childcare catalog selects (all orgs, skip if exists)
INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT o.id, v.set_key, v.label, v.ord
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('childcare_program_type'::text, 'Program type'::text, 200::int),
        ('childcare_schedule_type', 'Schedule type', 210),
        ('childcare_inquiry_source', 'Lead source type', 220),
        ('household_status', 'Household status', 230),
        ('communication_preference', 'Communication preference', 240),
        ('location_status', 'Location status', 250)
) AS v (set_key, label, ord)
ON CONFLICT (org_id, set_key) DO NOTHING;

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
SELECT os.id, it.item_key, it.label, it.ord
FROM public.option_sets os
INNER JOIN (
    VALUES
        ('childcare_program_type', 'infant', 'Infant', 10),
        ('childcare_program_type', 'toddler', 'Toddler', 20),
        ('childcare_program_type', 'preschool', 'Preschool', 30),
        ('childcare_program_type', 'pre_k', 'Pre-K', 40),
        ('childcare_program_type', 'school_age', 'School age', 50),
        ('childcare_schedule_type', 'full_time', 'Full time', 10),
        ('childcare_schedule_type', 'part_time', 'Part time', 20),
        ('childcare_schedule_type', 'drop_in', 'Drop-in', 30),
        ('childcare_schedule_type', 'before_school', 'Before school', 40),
        ('childcare_schedule_type', 'after_school', 'After school', 50),
        ('household_status', 'active', 'Active', 10),
        ('household_status', 'inactive', 'Inactive', 20),
        ('household_status', 'prospect', 'Prospect', 30),
        ('communication_preference', 'email', 'Email', 10),
        ('communication_preference', 'sms', 'SMS', 20),
        ('communication_preference', 'phone', 'Phone', 30),
        ('location_status', 'open', 'Open', 10),
        ('location_status', 'closed', 'Closed', 20),
        ('location_status', 'coming_soon', 'Coming soon', 30)
) AS it (set_key, item_key, label, ord)
    ON os.set_key = it.set_key
ON CONFLICT (option_set_id, item_key) DO NOTHING;

-- Sections
INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
SELECT o.id, v.entity_type, v.section_key, v.label, v.description, v.sort_order, now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('opportunity', 'enrollment', 'Enrollment', 'Lead enrollment preferences', 30),
        ('opportunity', 'tour', 'Tour', 'Tour scheduling', 40),
        ('person', 'contact_profile', 'Contact profile', 'Parent and contact details', 35),
        ('customer', 'household', 'Household', 'Household profile', 20),
        ('location', 'site_profile', 'Site profile', 'Location site details', 15)
) AS v (entity_type, section_key, label, description, sort_order)
ON CONFLICT (org_id, entity_type, section_key) DO UPDATE SET
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- Ensure childcare_contact_role option set exists for relationship_to_child
INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT o.id, 'childcare_contact_role', 'Contact role', 235
FROM public.orgs o
ON CONFLICT (org_id, set_key) DO NOTHING;

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
SELECT os.id, v.item_key, v.label, v.ord
FROM public.option_sets os
CROSS JOIN (
    VALUES
        ('parent'::text, 'Parent'::text, 10::int),
        ('guardian', 'Guardian', 20),
        ('emergency_contact', 'Emergency contact', 30),
        ('authorized_pickup', 'Authorized pickup', 40)
) AS v (item_key, label, ord)
WHERE os.set_key = 'childcare_contact_role'
ON CONFLICT (option_set_id, item_key) DO NOTHING;

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
        -- Lead / opportunity
        ('opportunity', 'desired_start_date', 'Desired start date', 'Target enrollment start for the lead', 'date', false, 'enrollment', 40, '{}'),
        ('opportunity', 'program_type', 'Program interest', 'Program the family is interested in', 'select', false, 'enrollment', 50, '{"option_set_key":"childcare_program_type"}'),
        ('opportunity', 'schedule_type', 'Schedule interest', 'Schedule the family is interested in', 'select', false, 'enrollment', 60, '{"option_set_key":"childcare_schedule_type"}'),
        ('opportunity', 'tour_date', 'Tour date', 'Scheduled tour date', 'date', false, 'tour', 70, '{}'),
        ('opportunity', 'tour_time', 'Tour time', 'Scheduled tour time', 'text', false, 'tour', 80, '{}'),
        ('opportunity', 'tour_status', 'Tour status', 'Tour scheduling status', 'status', false, 'tour', 90, '{}'),
        ('opportunity', 'channel', 'Channel', 'Marketing channel', 'text', false, 'source', 100, '{}'),
        ('opportunity', 'campaign', 'Campaign', 'Marketing campaign', 'text', false, 'source', 110, '{}'),
        -- Person / parent
        ('person', 'preferred_name', 'Preferred name', 'Preferred first name or nickname', 'text', false, 'child_profile', 25, '{}'),
        ('person', 'special_instructions', 'Special instructions', 'Pickup, care, or communication instructions', 'text', false, 'medical', 125, '{}'),
        ('person', 'relationship_to_child', 'Relationship to child', 'How this contact relates to the child', 'select', false, 'contact_profile', 55, '{"option_set_key":"childcare_contact_role"}'),
        ('person', 'communication_preference', 'Communication preference', 'Preferred communication channel', 'select', false, 'contact_profile', 60, '{"option_set_key":"communication_preference"}'),
        ('person', 'sms_opt_in', 'SMS opt-in', 'Consent to receive SMS messages', 'boolean', false, 'consent', 240, '{}'),
        ('person', 'email_opt_in', 'Email opt-in', 'Consent to receive email messages', 'boolean', false, 'consent', 250, '{}'),
        ('person', 'employer', 'Employer', 'Employer or workplace', 'text', false, 'contact_profile', 65, '{}'),
        ('person', 'contact_notes', 'Notes', 'Notes about this contact', 'text', false, 'contact_profile', 70, '{}'),
        ('person', 'allergies', 'Allergies', 'Known allergies and reactions', 'text', false, 'medical', 110, '{}'),
        ('person', 'medical_notes', 'Medical notes', 'Medications, diagnoses, and care plans', 'text', false, 'medical', 120, '{}'),
        -- Household / customer
        ('customer', 'family_notes', 'Family notes', 'Internal notes about the household', 'text', false, 'notes', 50, '{}'),
        ('customer', 'household_status', 'Household status', 'Household enrollment status', 'select', false, 'household', 60, '{"option_set_key":"household_status"}'),
        ('customer', 'primary_contact', 'Primary contact', 'Primary household contact name', 'text', false, 'household', 20, '{}'),
        ('customer', 'secondary_contact', 'Secondary contact', 'Secondary household contact name', 'text', false, 'household', 30, '{}'),
        ('customer', 'address_line1', 'Address', 'Household street address', 'text', false, 'household', 40, '{}'),
        ('customer', 'name', 'Household name', 'Display name for the household', 'text', true, 'household', 10, '{}'),
        -- Location
        ('location', 'operating_hours', 'Hours', 'Site operating hours', 'text', false, 'site_profile', 70, '{"storage":"metadata"}'),
        ('location', 'status', 'Status', 'Location operational status', 'select', false, 'site_profile', 80, '{"option_set_key":"location_status","storage":"metadata"}'),
        ('location', 'address_line1', 'Address', 'Site street address', 'text', false, 'site_profile', 20, '{"storage":"metadata"}'),
        ('location', 'name', 'Location name', 'Site or location display name', 'text', true, 'site_metadata', 10, '{"storage":"metadata"}')
) AS v (entity_type, field_key, label, description, field_type, is_system, section_key, sort_order, config)
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_visible_in_drawer = true,
    is_active = true,
    updated_at = now();
