-- =============================================================================
-- Enrollment pipeline queue_definition v2 (Card 5)
-- Domain + grain metadata with filters_compat_v1 for unchanged execution.
-- Source of truth mirror: web/lib/config/enrollmentPipelineQueueDefinitionV2.ts
-- Idempotent: backs up prior JSON once to metadata.queue_definition_rollback_v1
-- =============================================================================

WITH enrollment_depts AS (
    SELECT d.id AS department_id, d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
pipeline_wus AS (
    SELECT wu.id AS work_unit_id, wu.department_id, ed.org_id, wu.queue_definition, wu.metadata
    FROM public.work_units wu
    JOIN enrollment_depts ed ON ed.department_id = wu.department_id
    WHERE lower(coalesce(wu.key, '')) = 'enrollment_pipeline'
),
v2_def AS (
    SELECT '{"version":2,"entity_type":"opportunity","ui":{"layout":"domain_with_attention","primary_total_label":"Pipeline families","primary_total_queue":"pipeline_total","sections":[{"key":"new_leads","label":"New Leads","queue_keys":["new_leads"]},{"key":"tours","label":"Tours","queue_keys":["tours","tours_follow_up"]},{"key":"communications_followup","label":"Communications / Follow-up","queue_keys":["communications_followup"]},{"key":"forms_documents","label":"Forms / Documents","queue_keys":["forms_documents"]},{"key":"waitlist","label":"Waitlist","queue_keys":["waitlist"]},{"key":"enrollment_offers","label":"Enrollment / Offers","queue_keys":["enrollment_offers","enrollment_completed"]},{"key":"needs_attention","label":"Needs Attention","tone":"critical","queue_keys":["needs_attention"]}],"row_preview":{"variant":"crm_compact","fields":["title","status","primary_contact","phone","email","child_name","program","desired_start_date","tour_date"],"actions":["open"]}},"queues":[{"key":"pipeline_total","label":"Pipeline total","description":"Total count for pipeline scope (internal KPI lane).","domain":"pipeline","grain":"case","filters":[],"filters_compat_v1":[],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"new_leads","label":"New Leads","icon":"user-plus","description":"New families — first touch not yet completed.","domain":"new_leads","grain":"case","aliases":["new_inquiry"],"filters":[{"type":"case_status","operator":"in","values":["new_inquiry","open"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["new_inquiry"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"communications_followup","label":"Communications / Follow-up","icon":"phone","description":"Staff has attempted contact; conversation may be in progress.","domain":"communications_followup","grain":"case","aliases":["contacted","contact_attempted"],"filters":[{"type":"case_status","operator":"in","values":["contact_attempted","contacted"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["contact_attempted","contacted"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"tours","label":"Tours","icon":"calendar","description":"A tour is on the calendar.","domain":"tours","grain":"case","aliases":["tour_scheduled"],"filters":[{"type":"case_status","operator":"in","values":["tour_scheduled"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["tour_scheduled"]}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"standard","display":"list"},{"key":"tours_follow_up","label":"Tour Completed / Follow-up","icon":"clipboard-check","description":"Post-tour decision window — completed tour, follow-up attempts, or tour no-show.","domain":"tours","grain":"case","aliases":["tour_completed_follow_up"],"filters":[{"type":"case_status","operator":"in","values":["tour_completed","follow_up_attempted","tour_no_show"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["tour_completed","follow_up_attempted","tour_no_show"]}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"standard","display":"list"},{"key":"forms_documents","label":"Forms / Documents","domain":"forms_documents","grain":"case","filters":[],"filters_compat_v1":[],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"waitlist","label":"Waitlist","icon":"clock-3","domain":"waitlist","grain":"candidate","count_unit":"children","aliases":["waitlisted"],"filters":[{"type":"candidate_status","operator":"in","values":["active","paused"]},{"type":"child_lifecycle_status","operator":"in","values":["waitlisted","offer_pending"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["waitlisted"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"enrollment_offers","label":"Enrollment / Offers","icon":"file-text","description":"Paperwork or decision in motion toward a start date.","domain":"enrollment_offers","grain":"child","count_unit":"children","aliases":["ready_to_enroll","enrolling"],"filters":[{"type":"child_lifecycle_status","operator":"in","values":["offer_pending","enrolling"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["enrolling","ready_to_enroll"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"enrollment_completed","label":"Enrolled children","icon":"check-circle-2","description":"Confirmed enrollment (child completion view).","domain":"enrollment_offers","grain":"child","count_unit":"children","aliases":["enrolled"],"filters":[{"type":"child_lifecycle_status","operator":"in","values":["enrolled"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["enrolled"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"case_closed","label":"Lost","icon":"x-circle","description":"Closed — not enrolling.","domain":"archive","grain":"case","aliases":["lost"],"filters":[{"type":"case_status","operator":"in","values":["closed","lost"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["lost"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"needs_attention","label":"Needs attention","description":"Operational intervention overlay — not a separate lifecycle pipeline.","domain":"needs_attention","grain":"case","overlay":true,"filters":[{"type":"exception","operator":"exists"}],"filters_compat_v1":[{"type":"exception","operator":"exists"}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"critical","display":"list"}]}'::jsonb AS doc
)
UPDATE public.work_units wu
SET
    metadata = CASE
        WHEN coalesce(wu.metadata, '{}'::jsonb)->>'queue_definition_rollback_v1' IS NULL
            AND wu.queue_definition IS NOT NULL
            AND wu.queue_definition <> '{}'::jsonb
        THEN coalesce(wu.metadata, '{}'::jsonb) || jsonb_build_object(
            'queue_definition_rollback_v1', wu.queue_definition,
            'convergence_v2_applied_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
        ELSE coalesce(wu.metadata, '{}'::jsonb)
    END,
    queue_definition = (SELECT doc FROM v2_def),
    updated_at = now()
FROM pipeline_wus pw
WHERE wu.id = pw.work_unit_id;

-- -----------------------------------------------------------------------------
-- Verification (manual)
-- SELECT wu.org_id, wu.key, wu.queue_definition->>'version' AS version,
--        jsonb_array_length(wu.queue_definition->'queues') AS queue_count
-- FROM public.work_units wu
-- WHERE lower(wu.key) = 'enrollment_pipeline';
