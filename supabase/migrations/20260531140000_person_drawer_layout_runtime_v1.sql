-- =============================================================================
-- Person drawer layout runtime v1 — org-scoped seeds
-- =============================================================================
-- Adds record_drawer_layouts rows for person entity with profile-aware variants.
-- Runtime: web/lib/admin/person/personDrawerLayoutRuntime.ts
-- Doctrine: docs/sprints/05_2026/person_drawer_runtime_layout_migration.md
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS _childcare_mvp_seed_target_orgs ON COMMIT DROP AS
SELECT o.id AS org_id
FROM public.orgs o
WHERE o.industry_id IN (
    SELECT i.id
    FROM public.industries i
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
);

-- Global fallback template (orgs without override)
INSERT INTO public.record_layouts (entity_type, key, config_json, is_active, created_at)
SELECT
    'person'::text,
    'default'::text,
    jsonb_build_object(
        'version', 1,
        'person_drawer_mode', 'runtime_v1',
        'person_layout_variants', jsonb_build_object(
            'person_child_operating_v1', jsonb_build_object(
                'presentation_emphasis', 'child_lifecycle',
                'person_operating_sections', jsonb_build_array('child_summary', 'household'),
                'overview_suppressed_sections', jsonb_build_array(
                    'basic_info', 'basic', 'profile', 'preferred_name', 'child_profile',
                    'contact_info', 'contact', 'record_info', 'identity', 'relationships',
                    'enrollment', 'enrollment_opportunities', 'employee_placement', 'address',
                    'child_lifecycle_roadmap', 'enrollment_activity'
                ),
                'dedicated_field_keys', jsonb_build_array(
                    'first_name', 'last_name', 'full_name', 'date_of_birth', 'dob',
                    'gender', 'gender_key', 'enrollment_date', 'start_date',
                    'address_line1', 'address_line2', 'city', 'state', 'postal_code'
                )
            ),
            'person_parent_operating_v1', jsonb_build_object(
                'presentation_emphasis', 'guardian_communication',
                'person_operating_sections', jsonb_build_array(
                    'parent_summary', 'household', 'household_address', 'employee_status'
                ),
                'overview_suppressed_sections', jsonb_build_array(
                    'basic_info', 'basic', 'profile', 'preferred_name', 'contact_info', 'contact',
                    'consent', 'enrollment', 'enrollment_opportunities', 'enrollment_activity',
                    'relationships', 'record_info', 'identity', 'guardian_profile', 'emergency',
                    'medical', 'child_profile', 'address', 'employee_placement', 'custom_property_fields'
                ),
                'dedicated_field_keys', jsonb_build_array(
                    'first_name', 'last_name', 'email', 'phone',
                    'preferred_contact_method', 'communication_opt_out',
                    'address_line1', 'address_line2', 'city', 'state', 'postal_code'
                )
            ),
            'person_generic_v1', jsonb_build_object(
                'presentation_emphasis', 'general_identity',
                'person_operating_sections', jsonb_build_array(),
                'overview_section_order', jsonb_build_array(
                    'basic_info', 'contact_info', 'employee_placement', 'relationships'
                )
            )
        )
    ),
    true,
    now()
WHERE NOT EXISTS (
    SELECT 1
    FROM public.record_layouts rl
    WHERE rl.entity_type = 'person'
      AND rl.key = 'default'
      AND rl.is_active = true
);

-- Org-scoped override (same config — childcare MVP orgs)
INSERT INTO public.record_drawer_layouts (org_id, entity_type, surface, key, config_json, is_active, created_at, updated_at)
SELECT
    t.org_id,
    'person'::text,
    'drawer'::text,
    'default'::text,
    jsonb_build_object(
        'version', 1,
        'person_drawer_mode', 'runtime_v1',
        'person_layout_variants', jsonb_build_object(
            'person_child_operating_v1', jsonb_build_object(
                'presentation_emphasis', 'child_lifecycle',
                'person_operating_sections', jsonb_build_array('child_summary', 'household'),
                'overview_suppressed_sections', jsonb_build_array(
                    'basic_info', 'basic', 'profile', 'preferred_name', 'child_profile',
                    'contact_info', 'contact', 'record_info', 'identity', 'relationships',
                    'enrollment', 'enrollment_opportunities', 'employee_placement', 'address',
                    'child_lifecycle_roadmap', 'enrollment_activity'
                ),
                'dedicated_field_keys', jsonb_build_array(
                    'first_name', 'last_name', 'full_name', 'date_of_birth', 'dob',
                    'gender', 'gender_key', 'enrollment_date', 'start_date',
                    'address_line1', 'address_line2', 'city', 'state', 'postal_code'
                )
            ),
            'person_parent_operating_v1', jsonb_build_object(
                'presentation_emphasis', 'guardian_communication',
                'person_operating_sections', jsonb_build_array(
                    'parent_summary', 'household', 'household_address', 'employee_status'
                ),
                'overview_suppressed_sections', jsonb_build_array(
                    'basic_info', 'basic', 'profile', 'preferred_name', 'contact_info', 'contact',
                    'consent', 'enrollment', 'enrollment_opportunities', 'enrollment_activity',
                    'relationships', 'record_info', 'identity', 'guardian_profile', 'emergency',
                    'medical', 'child_profile', 'address', 'employee_placement', 'custom_property_fields'
                ),
                'dedicated_field_keys', jsonb_build_array(
                    'first_name', 'last_name', 'email', 'phone',
                    'preferred_contact_method', 'communication_opt_out',
                    'address_line1', 'address_line2', 'city', 'state', 'postal_code'
                )
            ),
            'person_generic_v1', jsonb_build_object(
                'presentation_emphasis', 'general_identity',
                'person_operating_sections', jsonb_build_array(),
                'overview_section_order', jsonb_build_array(
                    'basic_info', 'contact_info', 'employee_placement', 'relationships'
                )
            )
        )
    ),
    true,
    now(),
    now()
FROM _childcare_mvp_seed_target_orgs t
ON CONFLICT (org_id, entity_type, surface, key) DO UPDATE SET
    config_json = EXCLUDED.config_json,
    is_active = true,
    updated_at = now();
