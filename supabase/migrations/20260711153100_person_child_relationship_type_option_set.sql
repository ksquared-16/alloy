INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
SELECT o.id, 'person_child_relationship', 'family_relationships', 'Family relationships',
    'Person ↔ Child relationship fields (roles, kinship, edge attributes)', 10, now()
FROM public.orgs o
ON CONFLICT (org_id, entity_type, section_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- Relationship type (kinship) option set + native field definitions for person_child_relationship.

INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT o.id, 'person_child_relationship_type', 'Relationship to Child', 55
FROM public.orgs o
ON CONFLICT (org_id, set_key) DO UPDATE SET
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order, metadata)
SELECT os.id, v.item_key, v.label, v.sort_order, '{}'::jsonb
FROM public.option_sets os
CROSS JOIN (
    VALUES
        ('mother', 'Mother', 10),
        ('father', 'Father', 20),
        ('stepparent', 'Stepparent', 30),
        ('grandparent', 'Grandparent', 40),
        ('aunt', 'Aunt', 50),
        ('uncle', 'Uncle', 60),
        ('sibling', 'Sibling', 70),
        ('foster_parent', 'Foster Parent', 80),
        ('family_friend', 'Family Friend', 90),
        ('other', 'Other', 100)
) AS v(item_key, label, sort_order)
WHERE os.set_key = 'person_child_relationship_type'
ON CONFLICT (option_set_id, item_key) DO UPDATE SET
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO public.field_definitions (
    org_id, entity_type, field_key, label, description, field_type,
    is_system, is_required, is_active, is_visible_in_form, is_visible_in_drawer,
    is_visible_in_table, is_filterable, is_sortable, section_key, sort_order, config, updated_at
)
SELECT o.id, 'person_child_relationship', 'relationship_type', 'Relationship to Child',
    'Kinship / relationship type for this Person ↔ Child relationship', 'select',
    true, false, true, true, true, true, true, true, 'family_relationships', 10,
    jsonb_build_object('option_set_key', 'person_child_relationship_type'), now()
FROM public.orgs o
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label, description = EXCLUDED.description, field_type = EXCLUDED.field_type,
    section_key = EXCLUDED.section_key, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config,
    is_system = true, is_active = true, updated_at = now();

INSERT INTO public.field_definitions (
    org_id, entity_type, field_key, label, description, field_type,
    is_system, is_required, is_active, is_visible_in_form, is_visible_in_drawer,
    is_visible_in_table, is_filterable, is_sortable, section_key, sort_order, config, updated_at
)
SELECT o.id, 'person_child_relationship', 'priority', 'Priority',
    'Ordering priority within relationship sections for this child', 'number',
    true, false, true, false, true, false, false, true, 'family_relationships', 20, '{}'::jsonb, now()
FROM public.orgs o
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label, is_system = true, is_active = true, updated_at = now();

INSERT INTO public.field_definitions (
    org_id, entity_type, field_key, label, description, field_type,
    is_system, is_required, is_active, is_visible_in_form, is_visible_in_drawer,
    is_visible_in_table, is_filterable, is_sortable, section_key, sort_order, config, updated_at
)
SELECT o.id, 'person_child_relationship', 'status', 'Status',
    'Active or inactive relationship instance', 'text',
    true, false, true, false, true, true, true, false, 'family_relationships', 30, '{}'::jsonb, now()
FROM public.orgs o
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label, is_system = true, is_active = true, updated_at = now();
