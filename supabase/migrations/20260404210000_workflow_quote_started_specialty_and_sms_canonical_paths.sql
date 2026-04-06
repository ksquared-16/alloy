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
-- One legacy token per UPDATE (avoids fragile deeply nested replace()).
-- ---------------------------------------------------------------------------

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{opportunity.metadata.quote_input.square_footage}}',
  '{{location.square_footage_tier_key}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{opportunity.metadata.quote_input.square_footage}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{opportunity.metadata.bedrooms}}',
  '{{location.beds}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{opportunity.metadata.bedrooms}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{opportunity.metadata.bathrooms}}',
  '{{location.baths}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{opportunity.metadata.bathrooms}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{opportunity.metadata.access_method}}',
  '{{location.access_method_key}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{opportunity.metadata.access_method}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{opportunity.metadata.access_note}}',
  '{{location.access_notes}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{opportunity.metadata.access_note}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{location.address_line1}}',
  '{{location.address1}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{location.address_line1}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{job.metadata.bedrooms}}',
  '{{location.beds}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{job.metadata.bedrooms}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{job.metadata.bathrooms}}',
  '{{location.baths}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{job.metadata.bathrooms}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{job.metadata.square_footage}}',
  '{{location.square_footage_tier_key}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{job.metadata.square_footage}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{job.metadata.home_type}}',
  '{{location.home_type_key}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{job.metadata.home_type}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{job.metadata.access_method}}',
  '{{location.access_method_key}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{job.metadata.access_method}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{job.metadata.access_note}}',
  '{{location.access_notes}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{job.metadata.access_note}}%';

UPDATE public.workflow_actions
SET payload = replace(
  payload::text,
  '{{job.metadata.address}}',
  '{{location.address1}}'
)::jsonb
WHERE action_type IN ('send_message', 'create_message')
  AND payload::text LIKE '%{{job.metadata.address}}%';
