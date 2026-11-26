WITH units AS (
    SELECT
        'work_unit' AS source,
        w.created_at AS at,
        jsonb_build_object(
            'work_unit_id', w.id,
            'key', w.key,
            'name', w.name,
            'department_id', w.department_id,
            'is_active', w.is_active,
            'has_placement_key', (w.metadata ? 'placement_priority_v1'),
            'placement_enabled', w.metadata -> 'placement_priority_v1' ->> 'enabled',
            'placement_profile_id', w.metadata -> 'placement_priority_v1' ->> 'profile_id',
            'queue_keys_enabled', w.metadata -> 'placement_priority_v1' -> 'queue_keys_enabled'
        ) AS detail
    FROM public.work_units w
    WHERE w.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
depts AS (
    SELECT
        'department' AS source,
        d.created_at AS at,
        jsonb_build_object(
            'department_id', d.id,
            'key', d.key,
            'name', d.name,
            'has_placement_key', (d.metadata ? 'placement_priority_v1'),
            'placement_enabled', d.metadata -> 'placement_priority_v1' ->> 'enabled',
            'placement_profile_id', d.metadata -> 'placement_priority_v1' ->> 'profile_id',
            'queue_keys_enabled', d.metadata -> 'placement_priority_v1' -> 'queue_keys_enabled'
        ) AS detail
    FROM public.departments d
    WHERE d.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
views AS (
    SELECT
        'work_view' AS source,
        d.created_at AS at,
        jsonb_build_object(
            'department_id', d.id,
            'process_key', p ->> 'key',
            'view_id', v ->> 'id',
            'label', v ->> 'label',
            'row_grain_v1', v ->> 'row_grain_v1',
            'queue_layout_id', v ->> 'queue_layout_id',
            'focus_panel_layout_id', v ->> 'focus_panel_layout_id',
            'compat_queue_key', v ->> 'compat_queue_key',
            'visible_in_runtime', v ->> 'visible_in_runtime'
        ) AS detail
    FROM public.departments d,
         jsonb_array_elements(d.metadata -> 'lifecycle_builder_v1' -> 'processes') p,
         jsonb_array_elements(p -> 'work_views_v1') v
    WHERE d.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
)
SELECT source, at, detail
FROM (SELECT * FROM units UNION ALL SELECT * FROM depts UNION ALL SELECT * FROM views) x
ORDER BY at DESC
LIMIT 200
