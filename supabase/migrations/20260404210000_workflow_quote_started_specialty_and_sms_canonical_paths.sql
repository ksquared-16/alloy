-- Phase 1: Prevent "Quote started: Set opportunity stage" from running on specialty intake.
-- Runtime evaluates workflow_conditions with AND semantics (see web/lib/workflowRun.ts).
-- Specialty quote_start emits root specialty_cleaning=true and persists quote_input.specialty_request on the opportunity.
--
-- Phase 2: Normalize SMS / message action templates to canonical location.* paths (enriched in enrichWorkflowEventPayloadEntities).

-- ---------------------------------------------------------------------------
-- Phase 1: conditions (idempotent per workflow)
-- ---------------------------------------------------------------------------

INSERT INTO public.workflow_conditions (workflow_id, field, operator, value, org_id)
SELECT w.id, 'specialty_cleaning', 'neq', 'true', w.org_id
FROM public.workflows w
WHERE w.name = 'Quote started: Set opportunity stage'
  AND w.event_type = 'quote_started'
  AND w.entity_type = 'opportunity'
  AND NOT EXISTS (
    SELECT 1
    FROM public.workflow_conditions c
    WHERE c.workflow_id = w.id
      AND c.field = 'specialty_cleaning'
      AND lower(trim(c.operator)) IN ('neq', 'not_equals')
      AND c.value = 'true'
  );

INSERT INTO public.workflow_conditions (workflow_id, field, operator, value, org_id)
SELECT w.id, 'opportunity.metadata.quote_input.specialty_request', 'neq', 'true', w.org_id
FROM public.workflows w
WHERE w.name = 'Quote started: Set opportunity stage'
  AND w.event_type = 'quote_started'
  AND w.entity_type = 'opportunity'
  AND NOT EXISTS (
    SELECT 1
    FROM public.workflow_conditions c
    WHERE c.workflow_id = w.id
      AND c.field = 'opportunity.metadata.quote_input.specialty_request'
      AND lower(trim(c.operator)) IN ('neq', 'not_equals')
      AND c.value = 'true'
  );

-- ---------------------------------------------------------------------------
-- Phase 2: template token rewrites (send_message + create_message body/template)
-- ---------------------------------------------------------------------------

UPDATE public.workflow_actions wa
SET payload = (
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          wa.payload::text,
                          '{{opportunity.metadata.quote_input.square_footage}}',
                          '{{location.square_footage_tier_key}}'
                        ),
                        '{{opportunity.metadata.bedrooms}}',
                        '{{location.beds}}'
                      ),
                      '{{opportunity.metadata.bathrooms}}',
                      '{{location.baths}}'
                    ),
                    '{{opportunity.metadata.access_method}}',
                    '{{location.access_method_key}}'
                  ),
                  '{{opportunity.metadata.access_note}}',
                  '{{location.access_notes}}'
                ),
                '{{location.address_line1}}',
                '{{location.address1}}'
              ),
              '{{job.metadata.bedrooms}}',
              '{{location.beds}}'
            ),
            '{{job.metadata.bathrooms}}',
            '{{location.baths}}'
          ),
          '{{job.metadata.square_footage}}',
          '{{location.square_footage_tier_key}}'
        ),
        '{{job.metadata.home_type}}',
        '{{location.home_type_key}}'
      ),
      '{{job.metadata.access_method}}',
      '{{location.access_method_key}}'
    ),
    '{{job.metadata.access_note}}',
    '{{location.access_notes}}'
  ),
  '{{job.metadata.address}}',
  '{{location.address1}}'
)
)::jsonb
WHERE wa.action_type IN ('send_message', 'create_message')
  AND (
    wa.payload::text LIKE '%{{opportunity.metadata.quote_input.square_footage}}%'
    OR wa.payload::text LIKE '%{{opportunity.metadata.bedrooms}}%'
    OR wa.payload::text LIKE '%{{opportunity.metadata.bathrooms}}%'
    OR wa.payload::text LIKE '%{{opportunity.metadata.access_method}}%'
    OR wa.payload::text LIKE '%{{opportunity.metadata.access_note}}%'
    OR wa.payload::text LIKE '%{{location.address_line1}}%'
    OR wa.payload::text LIKE '%{{job.metadata.bedrooms}}%'
    OR wa.payload::text LIKE '%{{job.metadata.bathrooms}}%'
    OR wa.payload::text LIKE '%{{job.metadata.square_footage}}%'
    OR wa.payload::text LIKE '%{{job.metadata.home_type}}%'
    OR wa.payload::text LIKE '%{{job.metadata.access_method}}%'
    OR wa.payload::text LIKE '%{{job.metadata.access_note}}%'
    OR wa.payload::text LIKE '%{{job.metadata.address}}%'
  );
