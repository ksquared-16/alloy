-- Allow operators to adjust intake metadata on payload.meta and CRM FKs on submitted form_submissions
-- while keeping captured answers (values, signatures, option selections) immutable.

CREATE OR REPLACE FUNCTION public.form_submission_canonical_capture(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT jsonb_build_object(
        'values',
        COALESCE(p -> 'values', '{}'::jsonb),
        'signatures',
        COALESCE(p -> 'signatures', '{}'::jsonb),
        'option_values_by_field_id',
        COALESCE(p -> 'option_values_by_field_id', '{}'::jsonb)
    );
$$;

COMMENT ON FUNCTION public.form_submission_canonical_capture(jsonb) IS
    'Subset of form_submissions.payload frozen after submit; meta and other keys may still be updated for intake review.';

CREATE OR REPLACE FUNCTION public.enforce_form_submissions_submitted_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM 'submitted'::text AND OLD.status IS DISTINCT FROM 'void'::text THEN
        RETURN NEW;
    END IF;

    IF NEW.form_definition_version_id IS DISTINCT FROM OLD.form_definition_version_id
        OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id
    THEN
        RAISE EXCEPTION 'form_submissions: finalized rows cannot change payload or form version linkage';
    END IF;

    IF public.form_submission_canonical_capture(NEW.payload) IS DISTINCT FROM public.form_submission_canonical_capture(OLD.payload)
    THEN
        RAISE EXCEPTION 'form_submissions: finalized rows cannot change captured answers';
    END IF;

    IF OLD.status = 'submitted'::text AND NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status <> 'void'::text THEN
            RAISE EXCEPTION 'form_submissions: submitted rows may only transition to void';
        END IF;
    ELSIF OLD.status = 'void'::text AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'form_submissions: void rows cannot change status';
    END IF;

    RETURN NEW;
END;
$$;
