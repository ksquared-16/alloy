-- =============================================================================
-- FC-CM-1 — customer_member child profile field_definitions (all orgs)
-- =============================================================================
-- Seeds configurable durable child profile fields on entity_type = customer_member.
-- Aligns with web/lib/fields/customerMemberFieldRegistry.ts and
-- web/lib/layout/childcareLayoutFieldCatalog.ts (child.* refKeys in layout picker).
--
-- Does NOT seed person-bridge child fields or native customer_members columns.
-- Idempotent: ON CONFLICT DO UPDATE labels; safe to re-run.
-- =============================================================================

INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
SELECT o.id, v.entity_type, v.section_key, v.label, v.description, v.sort_order, now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('customer_member'::text, 'child_profile'::text, 'Child profile'::text, 'Durable child profile fields on household members'::text, 25::int),
        ('customer_member', 'medical', 'Medical', 'Allergies, medical notes, and care instructions', 35)
) AS v (entity_type, section_key, label, description, sort_order)
ON CONFLICT (org_id, entity_type, section_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

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
        ('customer_member', 'preferred_name', 'Preferred name', 'Preferred first name or nickname for this child', 'text', 'child_profile', 30, '{}'),
        ('customer_member', 'gender', 'Gender', 'Child gender identity', 'select', 'child_profile', 60, '{"option_set_key":"person_gender"}'),
        ('customer_member', 'allergies', 'Allergies', 'Known allergies and reactions', 'text', 'medical', 70, '{}'),
        ('customer_member', 'medical_notes', 'Medical notes', 'Medications, diagnoses, and care plans', 'text', 'medical', 80, '{}'),
        ('customer_member', 'special_instructions', 'Special instructions', 'Pickup, care, or communication instructions for this child', 'text', 'medical', 90, '{}')
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
