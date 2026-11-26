-- A CHILD (OR PARTICIPATION) WITH AN ENROLLMENT JOURNEY IS NOT HARD-DELETED UNDER IT.
--
-- Enrollment database & lifecycle integrity (Director authorization). process_instances.subject_id (the
-- child) and context_id (the participation) are polymorphic, so no foreign key protects them. Deleting a
-- child therefore left its journey — and the journey's packet session and participant link — pointing at
-- nothing. Measured on deployed staging (2026-10-19): 254 Enrollment journeys whose child no longer exists
-- (a certification fixture reset whose journey delete failed on the session RESTRICT and was ignored), and
-- the product could create the same state: Delete Lead and DELETE /api/admin/customer-members/[id]
-- hard-delete children and participations and never touch their journeys.
--
-- This is the RESTRICT the polymorphic reference cannot declare, for the two references a journey depends
-- on, in the same spirit as the existing RESTRICTs that already stop a child with an agreement, placement,
-- schedule or attendance from being hard-deleted:
--   * customer_members      BEFORE DELETE → refused while a child-subject journey references the row
--                                           (child_has_enrollment_journey);
--   * opportunity_customer_members BEFORE DELETE → refused while a journey is anchored to it
--                                           (participation_has_enrollment_journey).
-- It fires for cascaded deletes too (a household delete cascading to its children). Archiving a child
-- (is_active = false) is unaffected; a cleanup that removes the journey first (sessions, then the
-- journey) is unaffected. Nothing existing is changed: no table, column, row or existing constraint.
-- Idempotent (CREATE OR REPLACE; DROP TRIGGER IF EXISTS).

CREATE OR REPLACE FUNCTION public.refuse_delete_under_enrollment_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
    IF TG_TABLE_NAME = 'customer_members' THEN
        IF EXISTS (SELECT 1 FROM public.process_instances p WHERE p.subject_type = 'child' AND p.subject_id = OLD.id) THEN
            RAISE EXCEPTION 'child_has_enrollment_journey' USING ERRCODE = '23503',
                DETAIL = format('customer_member=%s', OLD.id),
                HINT = 'Archive the child, or remove the Enrollment journey (its packet sessions first) before deleting the child.';
        END IF;
    ELSIF TG_TABLE_NAME = 'opportunity_customer_members' THEN
        IF EXISTS (SELECT 1 FROM public.process_instances p WHERE p.context_type = 'enrollment_participation' AND p.context_id = OLD.id) THEN
            RAISE EXCEPTION 'participation_has_enrollment_journey' USING ERRCODE = '23503',
                DETAIL = format('participation=%s', OLD.id),
                HINT = 'Remove the Enrollment journey anchored to this participation before deleting it.';
        END IF;
    END IF;
    RETURN OLD;
END;
$fn$;

COMMENT ON FUNCTION public.refuse_delete_under_enrollment_journey() IS
    'Enrollment integrity: the RESTRICT a polymorphic journey reference cannot declare — no child or participation is hard-deleted under its Enrollment journey.';

REVOKE ALL ON FUNCTION public.refuse_delete_under_enrollment_journey() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refuse_delete_under_enrollment_journey() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_customer_members_retained_by_enrollment_journey ON public.customer_members;
CREATE TRIGGER trg_customer_members_retained_by_enrollment_journey
    BEFORE DELETE ON public.customer_members
    FOR EACH ROW EXECUTE FUNCTION public.refuse_delete_under_enrollment_journey();

DROP TRIGGER IF EXISTS trg_participations_retained_by_enrollment_journey ON public.opportunity_customer_members;
CREATE TRIGGER trg_participations_retained_by_enrollment_journey
    BEFORE DELETE ON public.opportunity_customer_members
    FOR EACH ROW EXECUTE FUNCTION public.refuse_delete_under_enrollment_journey();
