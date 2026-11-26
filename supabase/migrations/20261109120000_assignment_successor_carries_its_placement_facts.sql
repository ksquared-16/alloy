-- THE ASSIGNMENT SUCCESSOR WAS DROPPING THE CHILD'S ROOM.
--
-- `20261108120000` added `apply_participation_operational_change`. Its `child_placements` branch
-- copies every meaningful column from the prior row. Its `schedule_assignments` branch does not: the
-- successor INSERT names 15 columns and omits five that the prior row can carry —
-- `site_location_id`, `room_location_id`, `program_category_id`, `operational_assignment_type_id`
-- and `commitment_kind`.
--
-- MEASURED BEHAVIOURALLY, not inferred, on the certification stack (`alloy-cert`, 2026-09-30) by
-- superseding a real child primary assignment through the function and diffing prior against
-- successor (`web/tests/access/live/participationOperationalChange.live.test.ts`, scenario 6):
--
--   room_location_id                 a room uuid  ->  NULL   LOST
--   operational_assignment_type_id   a type uuid  ->  NULL   LOST
--   program_category_id              NULL         ->  NULL   latent: unset in this data, would be lost
--   commitment_kind                  'committed'  ->  'committed'
--                                    latent: the column DEFAULT happens to equal the prior value, so
--                                    a non-default commitment would be quietly rewritten, not emptied
--   site_location_id                 preserved - NOT by this function, but because
--                                    `validate_schedule_assignments_consistency` DERIVES it from the
--                                    agreement (`NEW.site_location_id := v_agreement_site`)
--
-- So the loss in fact today is the child's ROOM and the ASSIGNMENT TYPE. An earlier draft of this
-- migration also claimed the site was dropped; measuring it showed the trigger backfills that one,
-- and the claim is corrected here rather than left to read as proven. The INSERT still names
-- `site_location_id` explicitly: depending on a trigger to repair a column the writer forgot is not
-- the same as writing it correctly.
--
-- Nothing called the function yet, so nothing was lost. This is the gap closing before the first
-- caller, which is the only cheap moment to close it.
--
-- WHY A SUPERSESSION MUST CARRY THESE. The doctrine's law is that a change to a defining fact
-- creates a successor and the successor IS the new current truth. Every reader resolves "where is
-- this child today" from the operational row. A successor that is missing the room is not a
-- narrower record of the same truth — it is a different and false truth, published silently, to
-- exactly the partners the change event is supposed to inform. A supersession that drops a fact the
-- caller never asked to change is a correction masquerading as an operational change, and the
-- doctrine keeps those apart deliberately.
--
-- WHAT THIS DOES NOT CHANGE. The placement branch, the idempotency gate, the FOR UPDATE boundary,
-- the stale-row preconditions, the interval arithmetic, the derived successor status, SECURITY
-- INVOKER, and the client-closed ACL are all reproduced unchanged. Only the assignment INSERT's
-- column list grows. The caller-supplied overrides keep their precedence: an explicit
-- `schedule_pattern_id` in `p_assignment` still wins, and the copied columns are prior-row values,
-- never defaults.
--
-- Re-runnable: CREATE OR REPLACE only, no DDL on tables.

CREATE OR REPLACE FUNCTION public.apply_participation_operational_change(
    p_org_id uuid,
    p_enrollment_agreement_id uuid,
    p_idempotency_key text,
    p_today date,
    p_actor uuid DEFAULT NULL,
    -- {start_date, program_category_id, room_location_id, reason_key, source_key, metadata}
    p_placement jsonb DEFAULT NULL,
    -- {start_date, schedule_pattern_id, reason_key, source_key, metadata}
    p_assignment jsonb DEFAULT NULL,
    -- Optimistic preconditions. When supplied they must name the row the caller believes is current.
    p_expected_placement_id uuid DEFAULT NULL,
    p_expected_assignment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_attempt_id     uuid;
    v_stored         jsonb;
    v_prior_plc      public.child_placements;
    v_prior_asg      public.schedule_assignments;
    v_close          date;
    v_start          date;
    v_status         text;
    v_new_plc        uuid;
    v_new_asg        uuid;
    v_result         jsonb := '{}'::jsonb;
BEGIN
    IF p_placement IS NULL AND p_assignment IS NULL THEN
        RAISE EXCEPTION 'nothing_to_change: supply p_placement, p_assignment, or both';
    END IF;
    IF p_today IS NULL THEN
        RAISE EXCEPTION 'today_required: successor state is derived from the effective date';
    END IF;

    -- ── IDEMPOTENCY GATE, before any temporal write ──
    INSERT INTO public.participation_change_attempts
        (org_id, enrollment_agreement_id, idempotency_key, result, created_by)
    VALUES (p_org_id, p_enrollment_agreement_id, btrim(p_idempotency_key), '{}'::jsonb, p_actor)
    ON CONFLICT (org_id, enrollment_agreement_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_attempt_id;

    IF v_attempt_id IS NULL THEN
        SELECT result INTO v_stored
          FROM public.participation_change_attempts
         WHERE org_id = p_org_id
           AND enrollment_agreement_id = p_enrollment_agreement_id
           AND idempotency_key = btrim(p_idempotency_key);
        RETURN jsonb_build_object('ok', true, 'replayed', true, 'result', coalesce(v_stored, '{}'::jsonb));
    END IF;

    -- ── PLACEMENT ── (unchanged from 20261108120000)
    IF p_placement IS NOT NULL THEN
        SELECT * INTO v_prior_plc
          FROM public.child_placements
         WHERE org_id = p_org_id
           AND enrollment_agreement_id = p_enrollment_agreement_id
           AND status = ANY (ARRAY['planned', 'active', 'ending'])
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'no_operational_placement: use the initial-placement path, not supersession';
        END IF;
        IF p_expected_placement_id IS NOT NULL AND p_expected_placement_id <> v_prior_plc.id THEN
            RAISE EXCEPTION 'stale_placement: caller expected % but current operational row is %',
                p_expected_placement_id, v_prior_plc.id;
        END IF;

        v_start := (p_placement ->> 'start_date')::date;
        IF v_start IS NULL THEN
            RAISE EXCEPTION 'placement_start_date_required';
        END IF;
        IF v_start <= v_prior_plc.start_date
           OR (v_prior_plc.end_date IS NOT NULL AND v_start <= v_prior_plc.end_date) THEN
            RAISE EXCEPTION 'invalid_placement_start: % must be after prior start % and prior end %',
                v_start, v_prior_plc.start_date, v_prior_plc.end_date;
        END IF;

        v_close  := v_start - INTERVAL '1 day';
        v_status := CASE WHEN v_start > p_today THEN 'planned' ELSE 'active' END;

        UPDATE public.child_placements
           SET status = 'superseded',
               end_date = v_close,
               updated_by = p_actor,
               updated_at = now()
         WHERE id = v_prior_plc.id AND org_id = p_org_id;

        INSERT INTO public.child_placements (
            org_id, enrollment_agreement_id, customer_member_id, site_location_id,
            program_category_id, room_location_id, start_date, end_date, status,
            reason_key, source_key, supersedes_placement_id, metadata, created_by, updated_by
        ) VALUES (
            p_org_id, p_enrollment_agreement_id, v_prior_plc.customer_member_id,
            v_prior_plc.site_location_id,
            COALESCE((p_placement ->> 'program_category_id')::uuid, v_prior_plc.program_category_id),
            COALESCE((p_placement ->> 'room_location_id')::uuid, v_prior_plc.room_location_id),
            v_start, NULL, v_status,
            COALESCE(p_placement ->> 'reason_key', 'operator_change'),
            COALESCE(p_placement ->> 'source_key', 'operator'),
            v_prior_plc.id,
            COALESCE(p_placement -> 'metadata', '{}'::jsonb),
            p_actor, p_actor
        )
        RETURNING id INTO v_new_plc;

        v_result := v_result || jsonb_build_object(
            'placement', jsonb_build_object(
                'prior_id', v_prior_plc.id, 'prior_end_date', v_close,
                'successor_id', v_new_plc, 'successor_status', v_status, 'successor_start', v_start));
    END IF;

    -- ── SCHEDULE ASSIGNMENT ──
    -- Scoped to the child PRIMARY row, matching
    -- `ux_schedule_assignments_one_operational_primary_child` term for term. Staff assignments and
    -- secondary rows are deliberately out of scope: they are governed by the overlap trigger, not by
    -- one-operational-row, and this primitive must not silently impose the stricter child rule on them.
    IF p_assignment IS NOT NULL THEN
        SELECT * INTO v_prior_asg
          FROM public.schedule_assignments
         WHERE org_id = p_org_id
           AND enrollment_agreement_id = p_enrollment_agreement_id
           AND subject_type = 'child'
           AND is_primary
           AND status = ANY (ARRAY['planned', 'active', 'ending'])
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'no_operational_assignment: use the initial-assignment path, not supersession';
        END IF;
        IF p_expected_assignment_id IS NOT NULL AND p_expected_assignment_id <> v_prior_asg.id THEN
            RAISE EXCEPTION 'stale_assignment: caller expected % but current operational row is %',
                p_expected_assignment_id, v_prior_asg.id;
        END IF;

        v_start := (p_assignment ->> 'start_date')::date;
        IF v_start IS NULL THEN
            RAISE EXCEPTION 'assignment_start_date_required';
        END IF;
        IF v_start <= v_prior_asg.start_date
           OR (v_prior_asg.end_date IS NOT NULL AND v_start <= v_prior_asg.end_date) THEN
            RAISE EXCEPTION 'invalid_assignment_start: % must be after prior start % and prior end %',
                v_start, v_prior_asg.start_date, v_prior_asg.end_date;
        END IF;

        v_close  := v_start - INTERVAL '1 day';
        v_status := CASE WHEN v_start > p_today THEN 'planned' ELSE 'active' END;

        UPDATE public.schedule_assignments
           SET status = 'superseded',
               end_date = v_close,
               updated_by = p_actor,
               updated_at = now()
         WHERE id = v_prior_asg.id AND org_id = p_org_id;

        -- THE REPAIR: the five columns below the `metadata` line were absent in 20261108120000.
        -- They are copied from the prior row, never defaulted, because a supersession changes only
        -- what the caller named.
        INSERT INTO public.schedule_assignments (
            org_id, enrollment_agreement_id, schedule_pattern_id, customer_member_id,
            subject_type, is_primary, start_date, end_date, status, assignment_kind,
            source_key, supersedes_assignment_id, metadata, created_by, updated_by,
            site_location_id, room_location_id, program_category_id,
            operational_assignment_type_id, commitment_kind
        ) VALUES (
            p_org_id, p_enrollment_agreement_id,
            COALESCE((p_assignment ->> 'schedule_pattern_id')::uuid, v_prior_asg.schedule_pattern_id),
            v_prior_asg.customer_member_id,
            'child', true, v_start, NULL, v_status, v_prior_asg.assignment_kind,
            COALESCE(p_assignment ->> 'source_key', 'operator'),
            v_prior_asg.id,
            COALESCE(p_assignment -> 'metadata', '{}'::jsonb),
            p_actor, p_actor,
            COALESCE((p_assignment ->> 'site_location_id')::uuid, v_prior_asg.site_location_id),
            COALESCE((p_assignment ->> 'room_location_id')::uuid, v_prior_asg.room_location_id),
            COALESCE((p_assignment ->> 'program_category_id')::uuid, v_prior_asg.program_category_id),
            COALESCE((p_assignment ->> 'operational_assignment_type_id')::uuid,
                     v_prior_asg.operational_assignment_type_id),
            COALESCE(p_assignment ->> 'commitment_kind', v_prior_asg.commitment_kind)
        )
        RETURNING id INTO v_new_asg;

        v_result := v_result || jsonb_build_object(
            'assignment', jsonb_build_object(
                'prior_id', v_prior_asg.id, 'prior_end_date', v_close,
                'successor_id', v_new_asg, 'successor_status', v_status, 'successor_start', v_start));
    END IF;

    UPDATE public.participation_change_attempts
       SET result = v_result
     WHERE id = v_attempt_id;

    RETURN jsonb_build_object('ok', true, 'replayed', false, 'result', v_result);
END;
$fn$;

-- The ACL and ownership are re-asserted because CREATE OR REPLACE preserves them, and a reader
-- should not have to know that to be sure the client roles are still closed.
REVOKE EXECUTE ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) TO service_role;

-- SELF-TEST. Catalog-only: it reads the installed function definition and the catalog ACL, and
-- writes nothing. The behavioural proof that a real successor carries a real room belongs in
-- `web/tests/access/live/participationOperationalChange.live.test.ts`, which needs fixture rows and
-- must not run inside a migration.
DO $selftest$
DECLARE
    v_def       text;
    v_asg_block text;
    v_missing   text[] := ARRAY[]::text[];
    v_col       text;
    v_secdef    boolean;
    v_client    int;
    v_service   int;
BEGIN
    SELECT pg_get_functiondef(p.oid), p.prosecdef
      INTO v_def, v_secdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'apply_participation_operational_change';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'selftest: apply_participation_operational_change is not installed';
    END IF;

    IF v_secdef THEN
        RAISE EXCEPTION 'selftest: the function became SECURITY DEFINER, which bypasses RLS entirely';
    END IF;

    -- Look only at the assignment INSERT's column list, so a name appearing anywhere else in the
    -- body (a COALESCE on the prior row, a comment) cannot make a missing column look present.
    v_asg_block := substring(v_def from 'INSERT INTO public\.schedule_assignments \(([^)]*)\)');
    IF v_asg_block IS NULL THEN
        RAISE EXCEPTION 'selftest: could not locate the schedule_assignments INSERT column list';
    END IF;

    FOREACH v_col IN ARRAY ARRAY[
        'site_location_id', 'room_location_id', 'program_category_id',
        'operational_assignment_type_id', 'commitment_kind'
    ] LOOP
        IF position(v_col IN v_asg_block) = 0 THEN
            v_missing := v_missing || v_col;
        END IF;
    END LOOP;

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'selftest: the assignment successor would drop %; a supersession must carry '
            'every fact the caller did not change', array_to_string(v_missing, ', ');
    END IF;

    SELECT count(*) INTO v_client
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'apply_participation_operational_change'
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

    IF v_client > 0 THEN
        RAISE EXCEPTION 'selftest: a client role holds EXECUTE on the temporal primitive';
    END IF;

    SELECT count(*) INTO v_service
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'apply_participation_operational_change'
       AND has_function_privilege('service_role', p.oid, 'EXECUTE');

    IF v_service <> 1 THEN
        RAISE EXCEPTION 'selftest: service_role lost EXECUTE; the server-side caller cannot run';
    END IF;
END
$selftest$;
