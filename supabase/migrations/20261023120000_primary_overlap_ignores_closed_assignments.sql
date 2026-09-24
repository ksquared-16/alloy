-- Overlap validation must ignore assignments that are no longer in effect.
--
-- ─── THE DEFECT, FOUND BY HOSTED CERTIFICATION ───
--
-- `validate_schedule_assignments_primary_overlap` refuses a new primary assignment whose dates
-- overlap an existing one — and it looks at EVERY row regardless of status. So a `canceled`
-- assignment still blocks its own correction: the whole point of cancelling a record created in
-- error is to record the right one in its place, usually over the very same dates, and that insert
-- was refused with a raw trigger error. The public layer does not forward a `db_error`, so a
-- partner received a 500 on a legitimate call.
--
-- Measured directly: create a primary assignment, cancel it, insert the replacement over the same
-- dates -> "Overlapping primary assignment periods are not allowed for the same subject". The
-- uniqueness index added alongside `cancel` already excluded non-operational rows; this trigger was
-- the half that did not follow, so cancellation freed the invariant but not the calendar.
--
-- ─── THE FIX ───
--
-- Overlap is a statement about periods that are IN EFFECT. A cancelled, superseded or ended
-- assignment asserts nothing about the future, so it cannot conflict with anything. The predicate
-- now names the same operational statuses every reader and the uniqueness index already use, so
-- there is one definition of "in effect" rather than two that disagree.
--
-- What is deliberately unchanged: two OPERATIONAL primary assignments still cannot overlap, for
-- children and for staff alike. This narrows the rule to closed rows only.
CREATE OR REPLACE FUNCTION public.validate_schedule_assignments_primary_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_primary IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- A row being written into a closed state cannot conflict with anything either.
  IF NEW.status <> ALL (ARRAY['planned'::text, 'active'::text, 'ending'::text]) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.schedule_assignments sa
    WHERE sa.org_id = NEW.org_id
      AND sa.id IS DISTINCT FROM NEW.id
      AND sa.is_primary IS TRUE
      AND sa.subject_type = NEW.subject_type
      -- Only periods still in effect can be overlapped. `canceled`, `superseded` and `ended`
      -- assert nothing about the calendar.
      AND sa.status = ANY (ARRAY['planned'::text, 'active'::text, 'ending'::text])
      AND (
        (
          NEW.subject_type = 'child'
          AND sa.enrollment_agreement_id = NEW.enrollment_agreement_id
        )
        OR (
          NEW.subject_type = 'staff'
          AND sa.subject_person_id = NEW.subject_person_id
        )
      )
      AND public.schedule_assignment_date_ranges_overlap(
        sa.start_date,
        sa.end_date,
        NEW.start_date,
        NEW.end_date
      )
  ) THEN
    RAISE EXCEPTION
      'Overlapping primary assignment periods are not allowed for the same subject'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

-- Prove both halves: a closed row no longer blocks its correction, and two live rows still cannot
-- overlap. Rolled back so the check leaves nothing behind.
DO $$
DECLARE
    v_org uuid; v_ag uuid; v_cm uuid; v_pat uuid; v_id uuid; v_blocked boolean := false;
BEGIN
    SELECT ea.org_id, ea.id, ea.customer_member_id INTO v_org, v_ag, v_cm
      FROM public.child_enrollment_agreements ea
     WHERE NOT EXISTS (SELECT 1 FROM public.schedule_assignments sa
                        WHERE sa.enrollment_agreement_id = ea.id AND sa.is_primary)
     LIMIT 1;
    SELECT id INTO v_pat FROM public.schedule_patterns WHERE org_id = v_org LIMIT 1;
    IF v_ag IS NULL OR v_pat IS NULL THEN
        RAISE NOTICE 'no clean fixture available; skipping the in-migration behavioural check';
        RETURN;
    END IF;

    INSERT INTO public.schedule_assignments (org_id, subject_type, enrollment_agreement_id,
        customer_member_id, schedule_pattern_id, is_primary, start_date, status, assignment_kind, source_key)
    VALUES (v_org, 'child', v_ag, v_cm, v_pat, true, '2099-03-01', 'planned', 'base', 'migration-selftest')
    RETURNING id INTO v_id;

    UPDATE public.schedule_assignments SET status = 'canceled' WHERE id = v_id;

    INSERT INTO public.schedule_assignments (org_id, subject_type, enrollment_agreement_id,
        customer_member_id, schedule_pattern_id, is_primary, start_date, status, assignment_kind, source_key)
    VALUES (v_org, 'child', v_ag, v_cm, v_pat, true, '2099-03-01', 'planned', 'base', 'migration-selftest-2');

    BEGIN
        INSERT INTO public.schedule_assignments (org_id, subject_type, enrollment_agreement_id,
            customer_member_id, schedule_pattern_id, is_primary, start_date, status, assignment_kind, source_key)
        VALUES (v_org, 'child', v_ag, v_cm, v_pat, true, '2099-03-01', 'planned', 'base', 'migration-selftest-3');
    EXCEPTION WHEN others THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'two live overlapping primary assignments were allowed';
    END IF;

    RAISE EXCEPTION 'selftest complete';
EXCEPTION WHEN others THEN
    IF SQLERRM <> 'selftest complete' THEN RAISE; END IF;
END
$$;
