-- =============================================================================
-- inquiry_child select fields — wire option_set_key on field_definitions.config
-- Phase A: Program Interest + Schedule Interest (no hardcoded options)
-- =============================================================================

UPDATE public.field_definitions
SET config = COALESCE(config, '{}'::jsonb) || '{"option_set_key":"childcare_program_type"}'::jsonb
WHERE entity_type = 'inquiry_child'
  AND field_key = 'desired_program_type';

UPDATE public.field_definitions
SET config = COALESCE(config, '{}'::jsonb) || '{"option_set_key":"childcare_schedule_type"}'::jsonb
WHERE entity_type = 'inquiry_child'
  AND field_key = 'desired_schedule_type';
