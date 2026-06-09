-- =============================================================================
-- inquiry_child placement fields — option_source cascade metadata on config
-- Location → programs_for_location → rooms_for_location_program
-- =============================================================================

UPDATE public.field_definitions
SET config = (
    COALESCE(config, '{}'::jsonb)
    - 'option_set_key'
    || '{"option_source":"programs_for_location","depends_on_field_key":"location_id"}'::jsonb
)
WHERE entity_type = 'inquiry_child'
  AND field_key = 'desired_program_type';

UPDATE public.field_definitions
SET config = COALESCE(config, '{}'::jsonb) || '{"option_source":"locations"}'::jsonb
WHERE entity_type = 'inquiry_child'
  AND field_key = 'location_id';

UPDATE public.field_definitions
SET config = (
    COALESCE(config, '{}'::jsonb)
    || '{"option_source":"rooms_for_location_program","depends_on_field_key":"desired_program_type"}'::jsonb
)
WHERE entity_type = 'inquiry_child'
  AND field_key = 'program_room_cohort_key';

UPDATE public.field_definitions
SET config = (
    COALESCE(config, '{}'::jsonb)
    || '{"option_source":"option_set","option_set_key":"childcare_schedule_type"}'::jsonb
)
WHERE entity_type = 'inquiry_child'
  AND field_key = 'desired_schedule_type';
