-- =============================================================================
-- Enrollment pipeline queue_definition — grouped operational buckets (v1 correction)
--
-- Goals:
-- - Do NOT change status_definitions
-- - Update work_units.queue_definition only (Enrollment pipeline work unit)
-- - Group statuses into operational buckets (not 1:1 status buckets)
-- - Keep Needs Attention separate as exception lane
-- - Keep pipeline_total internal (not in UI pipeline section)
-- - Idempotent: safe to re-run
-- =============================================================================

WITH enrollment_depts AS (
    SELECT d.id AS department_id, d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
pipeline_wus AS (
    SELECT wu.id AS work_unit_id, wu.department_id, ed.org_id
    FROM public.work_units wu
    JOIN enrollment_depts ed ON ed.department_id = wu.department_id
    WHERE lower(coalesce(wu.key, '')) = 'enrollment_pipeline'
)
UPDATE public.work_units wu
SET
    queue_definition = jsonb_build_object(
        'version', 1,
        'entity_type', 'opportunity',
        'ui', jsonb_build_object(
            'layout', 'pipeline_with_attention',
            'primary_total_label', 'Pipeline families',
            'primary_total_queue', 'pipeline_total',
            'sections', jsonb_build_array(
                jsonb_build_object(
                    'key', 'pipeline',
                    'label', 'Pipeline',
                    'queue_keys', jsonb_build_array(
                        'new_inquiry',
                        'contact_attempted',
                        'tour_scheduled',
                        'tour_completed_follow_up',
                        'enrolling',
                        'waitlisted',
                        'enrolled',
                        'lost'
                    )
                ),
                jsonb_build_object(
                    'key', 'attention',
                    'label', 'Needs Attention',
                    'tone', 'critical',
                    'queue_keys', jsonb_build_array('needs_attention')
                )
            ),
            'row_preview', jsonb_build_object(
                'variant', 'crm_compact',
                'fields', jsonb_build_array(
                    'title',
                    'status',
                    'primary_contact',
                    'phone',
                    'email',
                    'child_name',
                    'program',
                    'desired_start_date',
                    'tour_date'
                ),
                'actions', jsonb_build_array('open', 'call', 'email')
            )
        ),
        'queues', jsonb_build_array(
            -- Internal total (not shown as a pipeline bucket)
            jsonb_build_object(
                'key', 'pipeline_total',
                'label', 'Pipeline total',
                'description', 'Total count for pipeline (internal).',
                'filters', jsonb_build_array(),
                'sort', jsonb_build_array(jsonb_build_object('field', 'updated_at', 'direction', 'desc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),

            -- Visible pipeline buckets (grouped)
            jsonb_build_object(
                'key', 'new_inquiry',
                'label', 'New Inquiry',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('new_inquiry'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','desc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'contact_attempted',
                'label', 'Contact Attempted',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('contact_attempted'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','desc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'tour_scheduled',
                'label', 'Tour Scheduled',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('tour_scheduled'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','asc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'tour_completed_follow_up',
                'label', 'Tour completed / follow up',
                -- Grouped: tour_completed + follow_up_attempted (+ tour_no_show so it maps into an operational bucket)
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('tour_completed','follow_up_attempted','tour_no_show'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','asc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'enrolling',
                'label', 'Enrolling',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('enrolling'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','desc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'waitlisted',
                'label', 'Waitlisted',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('waitlisted'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','desc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'enrolled',
                'label', 'Enrolled',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('enrolled'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','desc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'lost',
                'label', 'Lost',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('lost'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','desc')),
                'limit', 50,
                'priority', 'standard',
                'display', 'list'
            ),

            -- Separate exception lane
            jsonb_build_object(
                'key', 'needs_attention',
                'label', 'Needs attention',
                'description', 'Records requiring intervention (exceptions).',
                'filters', jsonb_build_array(jsonb_build_object('type','exception','operator','exists')),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','asc')),
                'limit', 50,
                'priority', 'critical',
                'display', 'list'
            )
        )
    ),
    updated_at = now()
WHERE wu.id IN (SELECT work_unit_id FROM pipeline_wus);

