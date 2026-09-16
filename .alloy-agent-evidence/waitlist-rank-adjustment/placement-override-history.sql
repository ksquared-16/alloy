WITH overrides AS (
    SELECT
        'override' AS source,
        o.created_at AS at,
        jsonb_build_object(
            'override_id', o.id,
            'candidate_id', o.placement_candidate_id,
            'opportunity_id', c.opportunity_id,
            'cohort_key', o.program_room_cohort_key,
            'pin_ordinal', o.payload ->> 'pin_ordinal',
            'is_active', o.is_active,
            'created_at', o.created_at,
            'updated_at', o.updated_at,
            'released_at', o.released_at,
            'created_by', o.created_by,
            'released_by', o.released_by,
            'reason', o.reason
        ) AS detail
    FROM public.placement_overrides o
    JOIN public.placement_candidates c ON c.id = o.placement_candidate_id
    WHERE o.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      AND o.override_kind = 'pin'
),
adjustments AS (
    SELECT
        'event' AS source,
        e.occurred_at AS at,
        jsonb_build_object(
            'event_id', e.id,
            'event_type', e.event_type,
            'candidate_id', e.payload ->> 'placement_candidate_id',
            'opportunity_id', e.entity_id,
            'override_id', e.payload ->> 'placement_override_id',
            'cohort_key', e.payload ->> 'program_room_cohort_key',
            'pin_ordinal', e.payload ->> 'pin_ordinal',
            'from_position', e.payload ->> 'from_position',
            'to_position', e.payload ->> 'to_position',
            'position_total', e.payload ->> 'position_total',
            'action', e.payload ->> 'action',
            'actor_user_id', e.payload ->> 'actor_user_id',
            'reason', e.payload ->> 'reason',
            'occurred_at', e.occurred_at
        ) AS detail
    FROM public.workflow_events e
    WHERE e.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      AND e.event_type LIKE 'opportunity_waitlist_manual_adjustment_%'
)
SELECT source, at, detail
FROM (SELECT * FROM overrides UNION ALL SELECT * FROM adjustments) history
ORDER BY at DESC
LIMIT 300
