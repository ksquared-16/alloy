-- =============================================================================
-- Real Enrollment Certification — Slice 5 §2 (READY NOW child-profile bindings)
-- =============================================================================
-- Seeds the durable child-profile facts the Health & Safety ownership contract cleared for
-- Enrollment to bind at CHILD grain, so a real packet question has a canonical destination
-- instead of becoming a process-scoped form field.
--
-- Derived from web/lib/fields/customerMemberFieldRegistry.ts —
-- CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST is the owner; this file is a projection of it, and
-- tests/admin/fields/customerMemberFieldRegistry.test.ts fails if a manifest row has no seed.
--
-- Deliberately NOT seeded: allergy, condition, medication, immunization as structured kinds.
-- Those belong to the Health foundation (D-H5) and Enrollment must not create a competing
-- destination for them. `special_diet` is a diet, not an allergy, and never stands in for one.
--
-- Additive and idempotent. Reversing it is a DELETE of these seven field_definitions rows;
-- no existing row is altered and no data is moved.
-- =============================================================================

INSERT INTO public.field_definitions (
    org_id, entity_type, field_key, label, description, field_type,
    is_system, is_required, is_active, is_visible_in_form, is_visible_in_drawer,
    is_visible_in_table, is_filterable, is_sortable, section_key, sort_order, config, updated_at
)
SELECT
    o.id, v.entity_type, v.field_key, v.label, v.description, v.field_type,
    false, false, true, true, true, false, false, false,
    v.section_key, v.sort_order, v.config::jsonb, now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('customer_member', 'special_diet', 'Special diet', 'Standing dietary restriction — a diet, never a substitute for an allergy record', 'text', 'medical', 100, '{}'),
        ('customer_member', 'eating_habits', 'Eating habits', 'How this child eats during the day', 'text', 'child_profile', 110, '{}'),
        ('customer_member', 'favorite_foods', 'Favourite foods', 'Foods this child reliably eats', 'text', 'child_profile', 120, '{}'),
        ('customer_member', 'foods_refused', 'Foods refused', 'Foods this child refuses (preference, not an allergy)', 'text', 'child_profile', 130, '{}'),
        ('customer_member', 'toileting_routine', 'Toileting routine', 'The toileting routine staff follow, including how the child signals', 'text', 'child_profile', 140, '{}'),
        ('customer_member', 'nap_routine', 'Nap routine', 'Whether the child naps and what they need at naptime', 'text', 'child_profile', 150, '{}'),
        ('customer_member', 'temperament', 'Temperament', 'How this child typically responds to new people, transitions, and upset', 'text', 'child_profile', 160, '{}')
) AS v (entity_type, field_key, label, description, field_type, section_key, sort_order, config)
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    field_type = EXCLUDED.field_type,
    section_key = EXCLUDED.section_key,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config,
    is_visible_in_drawer = true,
    is_active = true,
    updated_at = now();
