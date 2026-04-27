-- =============================================================================
-- Childcare MVP — control-plane vocabulary (no demo records, no field_values)
-- =============================================================================
-- Pre-implementation manifest (see repo task doc / PR description for full list):
--
-- 1) File: 20260428120000_childcare_mvp_control_plane_seed.sql
--
-- 2) Option sets + item keys (set_key → item_key, label):
--    childcare_program_type: infant, toddler, preschool, pre_k, school_age
--    childcare_schedule_type: full_time, part_time, drop_in, before_school, after_school
--    childcare_inquiry_source: website, phone, walk_in, referral, corporate, other
--    childcare_contact_role: parent, guardian, emergency_contact, authorized_pickup, payer
--    classroom_age_group: infant, toddler, preschool, pre_k, school_age, mixed_age
--
-- 3) field_section_definitions (org × entity_type × section_key), insert missing only:
--    person: identity, contact, child_profile, guardian_profile, emergency, medical, enrollment
--    customer: household, billing, subsidy, contacts, notes
--    location: identity, address, site, classroom, capacity, compliance
--    opportunity: inquiry, enrollment, program, tour, follow_up, source
--
-- 4) field_definitions is_system=false (skipped if row exists for org+entity+key):
--    person: allergies, medical_notes, authorized_pickup_notes, emergency_contact_notes
--            (date_of_birth skipped — native public.persons.date_of_birth)
--    customer: family_notes, subsidy_status, billing_notes
--    location: license_capacity, classroom_age_group, room_schedule_type
--    opportunity: desired_start_date, program_type, schedule_type, inquiry_source, tour_date, follow_up_notes
--    (long text fields use field_type=text so Admin field APIs stay aligned with ADMIN_FIELD_TYPES.)
--
-- 5) industry_default_entity_labels for industries.key='childcare' (entity_type plural keys):
--    customers, persons, opportunities, schedules, jobs, vendors, locations, customer_members
--
-- 6) Role / relationship vocabulary (existing tables only):
--    customer_persons.role_type → customer_person_role_types (org-wide scope)
--    person_relationships.relationship_type → person_relationship_type_settings (org-wide scope)
--
-- 7) location_types (org UI hints; keys must match locations.location_type CHECK):
--    address, site, unit
--
-- Idempotent: NOT EXISTS / ON CONFLICT DO NOTHING / ON CONFLICT DO UPDATE only where noted.
--
-- Org-scoped scope: only orgs listed in temp table _childcare_mvp_seed_target_orgs (see below).
-- Industry rows (industries + industry_default_entity_labels) remain global by childcare industry key.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Industry: childcare (canonical key for defaults below)
-- -----------------------------------------------------------------------------
INSERT INTO public.industries (key, label, description, is_active)
VALUES (
    'childcare',
    'Childcare',
    'Early childhood centers and family enrollment (MVP vocabulary).',
    true
)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    description = COALESCE(EXCLUDED.description, public.industries.description),
    is_active = true,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Industry default entity labels (plural entity_type keys match EntityLabels UI)
-- -----------------------------------------------------------------------------
INSERT INTO public.industry_default_entity_labels (
    industry_id,
    entity_type,
    singular,
    plural,
    created_at,
    updated_at
)
SELECT
    i.id,
    v.entity_type,
    v.singular,
    v.plural,
    now(),
    now()
FROM public.industries i
CROSS JOIN (
    VALUES
        ('customers'::text, 'Family'::text, 'Families'::text),
        ('persons', 'Person', 'People'),
        ('customer_members', 'Child', 'Children'),
        ('opportunities', 'Inquiry', 'Inquiries'),
        ('schedules', 'Schedule', 'Schedules'),
        ('jobs', 'Work item', 'Work items'),
        ('vendors', 'Provider', 'Providers'),
        ('locations', 'Location', 'Locations')
) AS v (entity_type, singular, plural)
WHERE i.key = 'childcare'
ON CONFLICT (industry_id, entity_type) DO UPDATE SET
    singular = EXCLUDED.singular,
    plural = EXCLUDED.plural,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Target orgs for all org-scoped childcare MVP seeds (not every org)
-- -----------------------------------------------------------------------------
-- Primary: public.orgs.industry_id → public.industries.key = 'childcare' (active industry).
-- Staging/demo: uncomment INSERT(s) below to include explicit org UUID(s) before industry_id is set.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _childcare_mvp_seed_target_orgs (org_id uuid PRIMARY KEY);

INSERT INTO _childcare_mvp_seed_target_orgs (org_id)
SELECT o.id
FROM public.orgs o
WHERE o.industry_id IN (
    SELECT i.id
    FROM public.industries i
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
);

-- INSERT INTO _childcare_mvp_seed_target_orgs (org_id) VALUES ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid) ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Option sets + items (per org)
-- -----------------------------------------------------------------------------
INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT
    t.org_id,
    v.set_key,
    v.label,
    v.ord
FROM _childcare_mvp_seed_target_orgs t
CROSS JOIN (
    VALUES
        ('childcare_program_type'::text, 'Program type (childcare)'::text, 200::int),
        ('childcare_schedule_type', 'Schedule type (childcare)', 210),
        ('childcare_inquiry_source', 'Inquiry source (childcare)', 220),
        ('childcare_contact_role', 'Household contact role (childcare)', 230),
        ('classroom_age_group', 'Classroom age group', 240)
) AS v (set_key, label, ord)
ON CONFLICT (org_id, set_key) DO NOTHING;

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
SELECT
    os.id,
    it.item_key,
    it.label,
    it.ord
FROM public.option_sets os
INNER JOIN _childcare_mvp_seed_target_orgs t ON t.org_id = os.org_id
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
    ('childcare_inquiry_source', 'website', 'Website', 10),
    ('childcare_inquiry_source', 'phone', 'Phone', 20),
        ('childcare_inquiry_source', 'walk_in', 'Walk-in', 30),
    ('childcare_inquiry_source', 'referral', 'Referral', 40),
    ('childcare_inquiry_source', 'corporate', 'Corporate', 50),
    ('childcare_inquiry_source', 'other', 'Other', 60),
    ('childcare_contact_role', 'parent', 'Parent', 10),
    ('childcare_contact_role', 'guardian', 'Guardian', 20),
    ('childcare_contact_role', 'emergency_contact', 'Emergency contact', 30),
    ('childcare_contact_role', 'authorized_pickup', 'Authorized pickup', 40),
    ('childcare_contact_role', 'payer', 'Payer', 50),
    ('classroom_age_group', 'infant', 'Infant', 10),
    ('classroom_age_group', 'toddler', 'Toddler', 20),
    ('classroom_age_group', 'preschool', 'Preschool', 30),
    ('classroom_age_group', 'pre_k', 'Pre-K', 40),
    ('classroom_age_group', 'school_age', 'School age', 50),
    ('classroom_age_group', 'mixed_age', 'Mixed age', 60)
) AS it (set_key, item_key, label, ord)
  ON it.set_key = os.set_key
ON CONFLICT (option_set_id, item_key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- field_section_definitions (insert missing only)
-- -----------------------------------------------------------------------------
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
    t.org_id,
    v.entity_type,
    v.section_key,
    v.label,
    v.description,
    v.sort_order,
    now(),
    now()
FROM _childcare_mvp_seed_target_orgs t
CROSS JOIN (
    VALUES
        ('person'::text, 'identity'::text, 'Identity'::text, 'Legal name and identifiers'::text, 10::int),
        ('person', 'contact', 'Contact', 'Phone, email, and reachability', 20),
        ('person', 'child_profile', 'Child profile', 'Enrollment and classroom context for the child', 30),
        ('person', 'guardian_profile', 'Guardian profile', 'Adult responsible for the child', 40),
        ('person', 'emergency', 'Emergency', 'Emergency contacts and pickup rules', 50),
        ('person', 'medical', 'Medical', 'Allergies and medical notes', 60),
        ('person', 'enrollment', 'Enrollment', 'Program and start preferences', 70),
        ('customer', 'household', 'Household', 'Family account and household context', 10),
        ('customer', 'billing', 'Billing', 'Tuition and payment notes', 20),
        ('customer', 'subsidy', 'Subsidy', 'Subsidy and assistance', 30),
        ('customer', 'contacts', 'Contacts', 'Linked people and roles', 40),
        ('customer', 'notes', 'Notes', 'Internal notes', 50),
        ('location', 'identity', 'Identity', 'Name and codes for this place', 10),
        ('location', 'address', 'Address', 'Street address for family or mailing', 20),
        ('location', 'site', 'Site', 'School or center (physical site)', 30),
        ('location', 'classroom', 'Classroom', 'Room within a site', 40),
        ('location', 'capacity', 'Capacity', 'Licensing and ratios', 50),
        ('location', 'compliance', 'Compliance', 'Licensing and inspection notes', 60),
        ('opportunity', 'inquiry', 'Inquiry', 'Initial family request', 10),
        ('opportunity', 'enrollment', 'Enrollment', 'Pipeline and decisioning', 20),
        ('opportunity', 'program', 'Program', 'Program fit and placement', 30),
        ('opportunity', 'tour', 'Tour', 'Tour scheduling and outcomes', 40),
        ('opportunity', 'follow_up', 'Follow-up', 'Next steps and reminders', 50),
        ('opportunity', 'source', 'Source', 'Lead attribution', 60)
) AS v (entity_type, section_key, label, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.field_section_definitions f
    WHERE f.org_id = t.org_id
      AND f.entity_type = v.entity_type
      AND f.section_key = v.section_key
);

-- -----------------------------------------------------------------------------
-- Custom field_definitions (is_system = false; skip if any row exists for key)
-- -----------------------------------------------------------------------------
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
    t.org_id,
    v.entity_type,
    v.field_key,
    v.label,
    v.description,
    v.field_type,
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    v.section_key,
    v.sort_order,
    NULL::text,
    NULL::text,
    v.config::jsonb,
    false,
    now(),
    now()
FROM _childcare_mvp_seed_target_orgs t
CROSS JOIN (
    VALUES
        ('person'::text, 'allergies'::text, 'Allergies'::text, 'Known allergies and reactions'::text, 'text'::text, 'medical'::text, 110::int, '{}'::text),
        ('person', 'medical_notes', 'Medical notes', 'Medications, diagnoses, care plans', 'text', 'medical', 120, '{}'),
        ('person', 'authorized_pickup_notes', 'Authorized pickup notes', 'Who may pick up this child and special instructions', 'text', 'emergency', 130, '{}'),
        ('person', 'emergency_contact_notes', 'Emergency contact notes', 'How to reach emergency contacts', 'text', 'emergency', 140, '{}'),
        ('customer', 'family_notes', 'Family notes', 'Internal context on the household', 'text', 'notes', 200, '{}'),
        ('customer', 'subsidy_status', 'Subsidy status', 'CCAP / subsidy tracking', 'text', 'subsidy', 210, '{}'),
        ('customer', 'billing_notes', 'Billing notes', 'Tuition and billing context', 'text', 'billing', 220, '{}'),
        ('location', 'license_capacity', 'License capacity', 'Licensed capacity for this room or site', 'number', 'capacity', 200, '{}'),
        ('location', 'classroom_age_group', 'Age group', 'Primary age band served in this classroom', 'select', 'classroom', 210, '{"option_set_key":"classroom_age_group"}'),
        ('location', 'room_schedule_type', 'Room schedule type', 'How this room is scheduled (full time, part time, etc.)', 'select', 'classroom', 220, '{"option_set_key":"childcare_schedule_type"}'),
        ('opportunity', 'desired_start_date', 'Desired start date', 'Target enrollment start', 'date', 'enrollment', 200, '{}'),
        ('opportunity', 'program_type', 'Program type', 'Requested age/program band', 'select', 'program', 210, '{"option_set_key":"childcare_program_type"}'),
        ('opportunity', 'schedule_type', 'Schedule type', 'Care schedule requested', 'select', 'program', 220, '{"option_set_key":"childcare_schedule_type"}'),
        ('opportunity', 'inquiry_source', 'Inquiry source', 'How the family reached you', 'select', 'source', 230, '{"option_set_key":"childcare_inquiry_source"}'),
        ('opportunity', 'tour_date', 'Tour date', 'Scheduled tour date', 'date', 'tour', 240, '{}'),
        ('opportunity', 'follow_up_notes', 'Follow-up notes', 'Next steps and call notes', 'text', 'follow_up', 250, '{}')
) AS v (entity_type, field_key, label, description, field_type, section_key, sort_order, config)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.field_definitions fd
    WHERE fd.org_id = t.org_id
      AND fd.entity_type = v.entity_type
      AND fd.field_key = v.field_key
);

-- -----------------------------------------------------------------------------
-- customer_person_role_types — household ↔ person roles (customer_persons.role_type)
-- -----------------------------------------------------------------------------
INSERT INTO public.customer_person_role_types (
    org_id,
    key,
    label,
    description,
    sort_order,
    is_system,
    is_active,
    metadata,
    vertical_id,
    industry_id
)
SELECT
    t.org_id,
    v.key,
    v.label,
    v.description,
    v.sort_order,
    false,
    true,
    jsonb_build_object('seed_source', 'childcare_mvp_control_plane'),
    NULL::uuid,
    NULL::uuid
FROM _childcare_mvp_seed_target_orgs t
CROSS JOIN (
    VALUES
        ('child'::text, 'Child'::text, 'Child linked to the family (household) account.'::text, 15::int),
        ('parent', 'Parent', 'Parent linked to the family account.', 20),
        ('guardian', 'Guardian', 'Legal guardian for the child.', 25),
        ('emergency_contact', 'Emergency contact', 'Emergency contact for pickup or incidents.', 30),
        ('authorized_pickup', 'Authorized pickup', 'Adult authorized to pick up the child.', 35),
        ('payer', 'Payer', 'Person responsible for tuition / billing.', 40)
) AS v (key, label, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.customer_person_role_types c
    WHERE c.org_id = t.org_id
      AND c.key = v.key
      AND COALESCE(c.industry_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
      AND COALESCE(c.vertical_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
);

-- -----------------------------------------------------------------------------
-- person_relationship_type_settings — person_relationships.relationship_type labels
-- -----------------------------------------------------------------------------
INSERT INTO public.person_relationship_type_settings (
    org_id,
    key,
    label,
    description,
    sort_order,
    is_system,
    is_active,
    metadata,
    vertical_id,
    industry_id
)
SELECT
    t.org_id,
    v.key,
    v.label,
    v.description,
    v.sort_order,
    false,
    true,
    jsonb_build_object('seed_source', 'childcare_mvp_control_plane'),
    NULL::uuid,
    NULL::uuid
FROM _childcare_mvp_seed_target_orgs t
CROSS JOIN (
    VALUES
        ('parent'::text, 'Parent of'::text, 'From-person is a parent of to-person (typically adult → child).'::text, 10::int),
        ('guardian', 'Guardian of', 'From-person is a guardian of to-person.', 20),
        ('emergency_contact', 'Emergency contact for', 'From-person is an emergency contact for to-person.', 30),
        ('authorized_pickup', 'Authorized pickup for', 'From-person is authorized to pick up to-person.', 40)
) AS v (key, label, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.person_relationship_type_settings p
    WHERE p.org_id = t.org_id
      AND p.key = v.key
      AND COALESCE(p.industry_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
      AND COALESCE(p.vertical_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
);

-- -----------------------------------------------------------------------------
-- customer_member_relationship_types — customer_members.relationship vocabulary
-- -----------------------------------------------------------------------------
INSERT INTO public.customer_member_relationship_types (
    org_id,
    key,
    label,
    sort_order,
    is_system,
    is_active,
    created_at,
    updated_at
)
SELECT
    t.org_id,
    'child',
    'Child',
    10,
    true,
    true,
    now(),
    now()
FROM _childcare_mvp_seed_target_orgs t
WHERE NOT EXISTS (
    SELECT 1
    FROM public.customer_member_relationship_types cm
    WHERE cm.org_id = t.org_id
      AND cm.key = 'child'
);

-- -----------------------------------------------------------------------------
-- location_types — UI labels for native location_type values (address/site/unit)
-- -----------------------------------------------------------------------------
INSERT INTO public.location_types (
    org_id,
    key,
    label,
    position,
    is_active,
    created_at,
    updated_at
)
SELECT
    t.org_id,
    v.key,
    v.label,
    v.position,
    true,
    now(),
    now()
FROM _childcare_mvp_seed_target_orgs t
CROSS JOIN (
    VALUES
        ('address'::text, 'Home / family address'::text, 10::int),
        ('site', 'School / center (site)', 20),
        ('unit', 'Room / classroom', 30)
) AS v (key, label, position)
ON CONFLICT (org_id, key) DO NOTHING;
