-- =============================================================================
-- Childcare: Opportunity / Inquiry drawer — workflow layout (org-scoped)
-- =============================================================================
-- Updates `record_drawer_layouts` for childcare orgs only (industry key childcare).
-- Does not change global `record_layouts`.
--
-- Intent:
-- - Hide generic field-definition sections (identity, quote, booking, etc.)
-- - Re-group inquiry fields into a few workflow sections
-- - Keep `inquiry_children` expanded and ordered for enrollment review
-- - Status duplicate removed from body via `suppress_body_status` (UI reads this flag)
-- =============================================================================

WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
)
UPDATE public.record_drawer_layouts r
SET
    config_json = COALESCE(r.config_json, '{}'::jsonb)
        || jsonb_build_object(
            'version',
            2,
            'inquiry_drawer_mode',
            'workflow_v1',
            'suppress_body_status',
            true,
            'overview_section_order',
            jsonb_build_array(
                'inquiry_enrollment',
                'inquiry_tuition',
                'inquiry_children',
                'inquiry_source_external',
                'inquiry_tour_followup'
            ),
            'overview_hidden_sections',
            to_jsonb(
                ARRAY[
                    'identity'::text,
                    'opportunity'::text,
                    'relationships'::text,
                    'booking'::text,
                    'quote'::text,
                    'promo'::text,
                    'inquiry'::text,
                    'enrollment'::text,
                    'program'::text,
                    'source'::text,
                    'tour'::text,
                    'follow_up'::text,
                    'details'::text,
                    'specialty_quote'::text,
                    'opportunity_details'::text,
                    'customer_booking'::text,
                    'record_info'::text,
                    'notes'::text
                ]
            ),
            'inquiry_workflow_sections',
            jsonb_build_array(
                jsonb_build_object(
                    'key',
                    'inquiry_enrollment',
                    'title',
                    'Enrollment needs',
                    'field_keys',
                    jsonb_build_array(
                        'desired_start_date'::text,
                        'program_type'::text,
                        'schedule_type'::text,
                        'quote_total'::text,
                        'estimated_price_cents'::text,
                        'monetary_value_cents'::text
                    ),
                    'default_expanded',
                    true
                ),
                jsonb_build_object(
                    'key',
                    'inquiry_source_external',
                    'title',
                    'Source & external',
                    'field_keys',
                    jsonb_build_array(
                        'inquiry_source'::text,
                        'source'::text,
                        'external_source'::text,
                        'external_id'::text,
                        'discount_code'::text,
                        'discount_program_id'::text
                    ),
                    'default_expanded',
                    false
                ),
                jsonb_build_object(
                    'key',
                    'inquiry_tour_followup',
                    'title',
                    'Tour & follow-up',
                    'field_keys',
                    jsonb_build_array('tour_date'::text, 'follow_up_notes'::text),
                    'default_expanded',
                    true
                )
            )
        ),
    updated_at = now()
FROM childcare_orgs c
WHERE r.org_id = c.org_id
  AND r.entity_type = 'opportunity'
  AND r.surface = 'drawer'
  AND r.key = 'default'
  AND COALESCE(r.is_active, true) = true;
