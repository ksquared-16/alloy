-- Schedule assignments — restore the invariant the canonical reader still assumes.
--
-- ─── THE DEFECT ───
--
-- `getOperationalScheduleAssignmentForAgreement` asks for "the operational schedule assignment for
-- this agreement" and finishes with `.maybeSingle()`, which ERRORS when more than one row matches.
-- Slice 1 backed that assumption with
-- `ux_schedule_assignments_one_operational_per_agreement`, and
-- `20260725030801_operational_assignment_foundation_v1.sql` deliberately dropped it when assignments
-- became multi-subject and multi-type — correctly, because "one operational row per agreement" is
-- wrong once staff and secondary assignments share the table.
--
-- The reader was never narrowed to match. So nothing has enforced its assumption since: two
-- concurrent creates can both pass the application-level "does one already exist?" check and both
-- insert, and from then on EVERY read of that agreement raises `db_error`, which the public layer
-- deliberately does not forward — a permanent 500 on a wedged enrollment. Placements kept their
-- index and converge; assignments could not.
--
-- ─── WHY NOT `ORDER BY ... LIMIT 1` ───
--
-- Because that hides contradictory canonical truth and picks an arbitrary winner. Two operational
-- primary assignments for one agreement is not a presentation problem to be tie-broken; it is a
-- state that must not exist.
--
-- ─── THE PREDICATE IS THE READER'S, EXACTLY ───
--
-- Not the old broad index. This matches the reader's filters term for term — child subject, primary,
-- an agreement, operational status — so it enforces precisely what the reader assumes and blocks
-- nothing else. Staff assignments (subject_type = 'staff'), secondary assignments
-- (is_primary = false) and proposed ones are untouched; `is_primary = true` is written only by
-- `createInitialScheduleAssignment` and `supersedeScheduleAssignment`, the two canonical committed
-- child writers.
--
-- Censused before creating: zero violating agreements on the deployed primary and zero locally.
-- Re-runnable, and it asserts the invariant rather than assuming the CREATE succeeded.
CREATE UNIQUE INDEX IF NOT EXISTS ux_schedule_assignments_one_operational_primary_child
    ON public.schedule_assignments (org_id, enrollment_agreement_id)
    WHERE subject_type = 'child'
      AND is_primary
      AND enrollment_agreement_id IS NOT NULL
      AND status = ANY (ARRAY['planned'::text, 'active'::text, 'ending'::text]);

DO $$
DECLARE
    violations integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'ux_schedule_assignments_one_operational_primary_child'
    ) THEN
        RAISE EXCEPTION 'the operational primary child uniqueness index was not created';
    END IF;

    SELECT count(*) INTO violations FROM (
        SELECT 1 FROM public.schedule_assignments
        WHERE subject_type = 'child' AND is_primary AND enrollment_agreement_id IS NOT NULL
          AND status = ANY (ARRAY['planned'::text, 'active'::text, 'ending'::text])
        GROUP BY org_id, enrollment_agreement_id
        HAVING count(*) > 1
    ) d;
    IF violations > 0 THEN
        RAISE EXCEPTION 'contradictory operational assignments remain: % agreement(s)', violations;
    END IF;
END
$$;
