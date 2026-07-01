-- Enrollment demo: queue rows should open on row click (not as a business action button).
-- Remove the `open_record` queue_row placement for opportunity.
-- Idempotent.

DELETE FROM public.action_placements p
USING public.action_definitions d
WHERE p.action_definition_id = d.id
  AND d.org_id IS NULL
  AND d.key = 'open_record'
  AND p.surface = 'queue_row'
  AND p.slot = 'row_inline'
  AND p.entity_type = 'opportunity';

