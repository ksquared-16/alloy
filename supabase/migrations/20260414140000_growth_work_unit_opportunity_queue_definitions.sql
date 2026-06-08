-- =============================================================================
-- Growth work units — opportunity queue_definition (v1) for existing WUs only
-- =============================================================================
-- Org: cleaning / Alloy Bend (same as 20260409090000_cleaning_org_departments_and_work_units_seed).
-- Does NOT insert departments or work units — updates queue_definition JSON only.
-- =============================================================================

UPDATE public.work_units wu
SET
    queue_definition =
        jsonb_build_object(
            'version',
            1,
            'entity_type',
            'opportunity',
            'filters',
            jsonb_build_object(
                'status_keys',
                jsonb_build_array('new', 'needs_a_quote'),
                'quote_state',
                'no_positive_quote'
            ),
            'sort',
            jsonb_build_object('by', 'created_at', 'direction', 'desc'),
            'limit',
            100
        ),
    updated_at = now()
FROM public.departments d
WHERE wu.department_id = d.id
    AND d.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
    AND d.key = 'growth'
    AND wu.key = 'new_leads';

UPDATE public.work_units wu
SET
    queue_definition =
        jsonb_build_object(
            'version',
            1,
            'entity_type',
            'opportunity',
            'filters',
            jsonb_build_object('quote_state', 'quoted_not_booked'),
            'sort',
            jsonb_build_object('by', 'updated_at', 'direction', 'desc'),
            'limit',
            100
        ),
    updated_at = now()
FROM public.departments d
WHERE wu.department_id = d.id
    AND d.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
    AND d.key = 'growth'
    AND wu.key = 'unbooked_quotes';
