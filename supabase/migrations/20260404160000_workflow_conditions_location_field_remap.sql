-- Remap workflow_conditions from legacy job-scoped / booking_* paths to location.* semantics.
-- Runtime also resolves these aliases (see web/lib/workflowRun.ts); this keeps DB rows aligned.
--
-- Baseline table (see 20260329165048_remote_schema.sql) uses column "field" (text), not "field_path".
-- Newer admin payloads may use target_entity + field_path when those columns exist.

DO $migrate$
DECLARE
  has_field_path boolean;
  has_target_entity boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workflow_conditions'
      AND column_name = 'field_path'
  ) INTO has_field_path;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workflow_conditions'
      AND column_name = 'target_entity'
  ) INTO has_target_entity;

  IF has_field_path AND has_target_entity THEN
    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field_path = 'beds'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('bedrooms', 'booking_bedrooms')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field_path = 'baths'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('bathrooms', 'booking_bathrooms')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field_path = 'square_footage_tier_key'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('square_footage', 'booking_square_footage')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field_path = 'home_type_key'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('home_type', 'home_type_label')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field_path = 'access_method_key'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('access_method', 'access_method_id')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

  ELSIF has_field_path THEN
    UPDATE public.workflow_conditions c
    SET field_path = 'beds'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('bedrooms', 'booking_bedrooms');

    UPDATE public.workflow_conditions c
    SET field_path = 'baths'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('bathrooms', 'booking_bathrooms');

    UPDATE public.workflow_conditions c
    SET field_path = 'square_footage_tier_key'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('square_footage', 'booking_square_footage');

    UPDATE public.workflow_conditions c
    SET field_path = 'home_type_key'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('home_type', 'home_type_label');

    UPDATE public.workflow_conditions c
    SET field_path = 'access_method_key'
    WHERE trim(lower(coalesce(c.field_path, c.field, ''))) IN ('access_method', 'access_method_id');

  ELSIF has_target_entity THEN
    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field = 'beds'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('bedrooms', 'booking_bedrooms')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field = 'baths'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('bathrooms', 'booking_bathrooms')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field = 'square_footage_tier_key'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('square_footage', 'booking_square_footage')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field = 'home_type_key'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('home_type', 'home_type_label')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

    UPDATE public.workflow_conditions c
    SET
      target_entity = 'location',
      field = 'access_method_key'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('access_method', 'access_method_id')
      AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

  ELSE
    -- Baseline: no field_path / target_entity; runner resolves location.* from job-scoped payload.
    UPDATE public.workflow_conditions c
    SET field = 'location.beds'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('bedrooms', 'booking_bedrooms');

    UPDATE public.workflow_conditions c
    SET field = 'location.baths'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('bathrooms', 'booking_bathrooms');

    UPDATE public.workflow_conditions c
    SET field = 'location.square_footage_tier_key'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('square_footage', 'booking_square_footage');

    UPDATE public.workflow_conditions c
    SET field = 'location.home_type_key'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('home_type', 'home_type_label');

    UPDATE public.workflow_conditions c
    SET field = 'location.access_method_key'
    WHERE trim(lower(coalesce(c.field, ''))) IN ('access_method', 'access_method_id');
  END IF;
END
$migrate$;
