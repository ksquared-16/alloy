-- =============================================================================
-- Enrollment pipeline alignment (v1)
-- - Status definitions for Enrollment opportunities (org-scoped)
-- - Work-unit queue_definition buckets aligned to those statuses
-- - Add Update Status action placement in drawer (record_header)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Status definitions (Enrollment orgs): upsert canonical list + deactivate extras
-- ---------------------------------------------------------------------------

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
desired AS (
    SELECT *
    FROM (VALUES
        ('new_inquiry'::text, 'New Inquiry'::text, 10, 'intake'::text),
        ('contact_attempted'::text, 'Contact Attempted'::text, 20, 'intake'::text),
        ('tour_scheduled'::text, 'Tour Scheduled'::text, 30, 'qualification'::text),
        ('tour_completed'::text, 'Tour Completed'::text, 40, 'execution'::text),
        ('tour_no_show'::text, 'Tour No Show'::text, 50, 'execution'::text),
        ('follow_up_attempted'::text, 'Follow Up Attempted'::text, 60, 'execution'::text),
        ('enrolling'::text, 'Enrolling'::text, 70, 'decision'::text),
        ('waitlisted'::text, 'Waitlisted'::text, 80, 'decision'::text),
        ('enrolled'::text, 'Enrolled'::text, 90, 'success'::text),
        ('lost'::text, 'Lost'::text, 100, 'failure'::text)
    ) AS v(status_key, status_label, sort_order, lifecycle_stage)
),
updated AS (
    UPDATE public.status_definitions sd
    SET
        status_label = d.status_label,
        sort_order = d.sort_order,
        is_active = true,
        is_system = false,
        industry_key = NULL,
        metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_stage', d.lifecycle_stage),
        updated_at = now()
    FROM enrollment_orgs eo
    JOIN desired d ON true
    WHERE sd.org_id = eo.org_id
      AND sd.entity_type = 'opportunities'
      AND sd.status_key = d.status_key
    RETURNING sd.id
),
inserted AS (
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
        eo.org_id,
        'opportunities'::text,
        d.status_key,
        d.status_label,
        d.sort_order,
        true,
        false,
        NULL::text,
        jsonb_build_object('lifecycle_stage', d.lifecycle_stage)
    FROM enrollment_orgs eo
    JOIN desired d ON true
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.status_definitions sd
        WHERE sd.org_id = eo.org_id
          AND sd.entity_type = 'opportunities'
          AND sd.status_key = d.status_key
    )
    RETURNING id
)
UPDATE public.status_definitions sd
SET is_active = false,
    updated_at = now()
WHERE sd.org_id IN (SELECT org_id FROM enrollment_orgs)
  AND sd.entity_type = 'opportunities'
  AND sd.status_key NOT IN (SELECT status_key FROM desired)
  AND sd.is_active = true;

-- ---------------------------------------------------------------------------
-- 2) Enrollment pipeline work unit queue_definition buckets
--    - One bucket per operational stage status_key
--    - Needs Attention remains exception lane
-- ---------------------------------------------------------------------------

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
SET queue_definition = (
    jsonb_build_object(
        'version', 1,
        'entity_type', 'opportunity',
        'ui', jsonb_build_object(
            'layout', 'pipeline_with_attention',
            'primary_total_label', 'Pipeline families',
            -- total queue is internal (not a stage bucket) but used for KPI totals
            'primary_total_queue', 'pipeline_total',
            'sections', jsonb_build_array(
                jsonb_build_object(
                    'key', 'pipeline',
                    'label', 'Pipeline',
                    'queue_keys', jsonb_build_array(
                        'new_inquiry',
                        'contact_attempted',
                        'tour_scheduled',
                        'tour_completed',
                        'tour_no_show',
                        'follow_up_attempted',
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
                'priority', 'attention',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'tour_completed',
                'label', 'Tour Completed',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('tour_completed'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','asc')),
                'limit', 50,
                'priority', 'attention',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'tour_no_show',
                'label', 'Tour No Show',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('tour_no_show'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','asc')),
                'limit', 50,
                'priority', 'attention',
                'display', 'list'
            ),
            jsonb_build_object(
                'key', 'follow_up_attempted',
                'label', 'Follow Up Attempted',
                'filters', jsonb_build_array(jsonb_build_object('type','status','operator','in','values', jsonb_build_array('follow_up_attempted'))),
                'sort', jsonb_build_array(jsonb_build_object('field','updated_at','direction','asc')),
                'limit', 50,
                'priority', 'attention',
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
    )
),
updated_at = now()
WHERE wu.id IN (SELECT work_unit_id FROM pipeline_wus);

-- ---------------------------------------------------------------------------
-- 3) Add Update Status (update_status_add_note) placement to drawer (record_header secondary)
--    - Reuse existing action definition (org-scoped) seeded by prior migrations
-- ---------------------------------------------------------------------------

WITH enrollment_depts AS (
    SELECT d.id AS department_id, d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
enrollment_wus AS (
    SELECT wu.id AS work_unit_id, wu.department_id, ed.org_id
    FROM public.work_units wu
    JOIN enrollment_depts ed ON ed.department_id = wu.department_id
),
def_ids AS (
    SELECT ad.id AS action_definition_id, ad.org_id
    FROM public.action_definitions ad
    JOIN enrollment_depts ed ON ed.org_id = ad.org_id
    WHERE ad.key = 'update_status_add_note'
      AND ad.is_active = true
),
desired_placements AS (
    SELECT
        ew.org_id,
        di.action_definition_id,
        'record_header'::text AS surface,
        'secondary'::text AS slot,
        'opportunity'::text AS entity_type,
        ew.department_id,
        ew.work_unit_id,
        NULL::text AS section_key,
        40 AS order_index,
        'button'::text AS display_style,
        true AS is_active
    FROM enrollment_wus ew
    JOIN def_ids di ON di.org_id = ew.org_id
)
INSERT INTO public.action_placements (
    org_id,
    action_definition_id,
    surface,
    slot,
    entity_type,
    department_id,
    work_unit_id,
    section_key,
    order_index,
    display_style,
    is_active
)
SELECT
    dp.org_id,
    dp.action_definition_id,
    dp.surface,
    dp.slot,
    dp.entity_type,
    dp.department_id,
    dp.work_unit_id,
    dp.section_key,
    dp.order_index,
    dp.display_style,
    true
FROM desired_placements dp
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id = dp.org_id
      AND ap.action_definition_id = dp.action_definition_id
      AND ap.surface = dp.surface
      AND ap.slot = dp.slot
      AND ap.entity_type IS NOT DISTINCT FROM dp.entity_type
      AND ap.department_id IS NOT DISTINCT FROM dp.department_id
      AND ap.work_unit_id IS NOT DISTINCT FROM dp.work_unit_id
      AND ap.section_key IS NOT DISTINCT FROM dp.section_key
);

