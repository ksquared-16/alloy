-- Person status applicability metadata — role/profile-aware dropdown options on persons.status_key.
-- Child-only keys: future_start, withdrawn, graduated
-- Shared keys: active, inactive, archived

UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'applies_to_profiles', jsonb_build_array('child_lifecycle'),
        'applies_to_roles', jsonb_build_array('child'),
        'seed_source', 'migration_20260602120000_person_status_applicability_metadata'
    ),
    updated_at = now()
WHERE sd.entity_type = 'persons'
  AND sd.status_key IN ('future_start', 'withdrawn', 'graduated');

UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'applies_to_profiles', jsonb_build_array('child_lifecycle', 'person_generic'),
        'applies_to_roles', jsonb_build_array('child', 'parent', 'guardian', 'employee'),
        'seed_source', 'migration_20260602120000_person_status_applicability_metadata'
    ),
    updated_at = now()
WHERE sd.entity_type = 'persons'
  AND sd.status_key IN ('active', 'inactive', 'archived');

-- Ensure child lifecycle person statuses exist for all orgs (idempotent).
INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    industry_key,
    metadata
)
SELECT
    o.id,
    'persons'::text,
    v.status_key,
    v.status_label,
    v.sort_order,
    true,
    false,
    NULL::text,
    v.metadata
FROM public.orgs o
CROSS JOIN (
    VALUES
        (
            'active'::text,
            'Active'::text,
            10::int,
            jsonb_build_object(
                'applies_to_profiles', jsonb_build_array('child_lifecycle', 'person_generic'),
                'applies_to_roles', jsonb_build_array('child', 'parent', 'guardian', 'employee'),
                'seed_source', 'migration_20260602120000_person_status_applicability_metadata'
            )
        ),
        (
            'future_start',
            'Future Start',
            20,
            jsonb_build_object(
                'applies_to_profiles', jsonb_build_array('child_lifecycle'),
                'applies_to_roles', jsonb_build_array('child'),
                'seed_source', 'migration_20260602120000_person_status_applicability_metadata'
            )
        ),
        (
            'withdrawn',
            'Withdrawn',
            40,
            jsonb_build_object(
                'applies_to_profiles', jsonb_build_array('child_lifecycle'),
                'applies_to_roles', jsonb_build_array('child'),
                'seed_source', 'migration_20260602120000_person_status_applicability_metadata'
            )
        ),
        (
            'graduated',
            'Graduated',
            50,
            jsonb_build_object(
                'applies_to_profiles', jsonb_build_array('child_lifecycle'),
                'applies_to_roles', jsonb_build_array('child'),
                'seed_source', 'migration_20260602120000_person_status_applicability_metadata'
            )
        ),
        (
            'inactive',
            'Inactive',
            60,
            jsonb_build_object(
                'applies_to_profiles', jsonb_build_array('child_lifecycle', 'person_generic'),
                'applies_to_roles', jsonb_build_array('child', 'parent', 'guardian', 'employee'),
                'seed_source', 'migration_20260602120000_person_status_applicability_metadata'
            )
        ),
        (
            'archived',
            'Archived',
            70,
            jsonb_build_object(
                'applies_to_profiles', jsonb_build_array('child_lifecycle', 'person_generic'),
                'applies_to_roles', jsonb_build_array('child', 'parent', 'guardian', 'employee'),
                'seed_source', 'migration_20260602120000_person_status_applicability_metadata'
            )
        )
) AS v(status_key, status_label, sort_order, metadata)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = o.id
      AND sd.entity_type = 'persons'
      AND sd.status_key = v.status_key
);
