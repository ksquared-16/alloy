-- AN OMITTED FIELD AND AN EXPLICIT NULL ARE NOT THE SAME INSTRUCTION.
--
-- Found while wiring `childPlacementService.supersedeChildPlacement` to the primitive, which is the
-- point of wiring: the shipped service and the primitive disagreed about what an absent field means.
--
-- The service resolves placement fields as `trimOrNull(input.programCategoryId)`, and both mounted
-- callers (`app/api/v1/placements/move/route.ts` and `app/api/admin/child-placements/route.ts`)
-- turn a missing body field into an explicit `null`. So in the shipped system, superseding without
-- naming a room CLEARS the room. The primitive used `COALESCE(p_placement ->> 'room_location_id',
-- v_prior_plc.room_location_id)`, which cannot distinguish "the caller said null" from "the caller
-- said nothing" and resolves both to the prior value.
--
-- Wiring the service to the primitive as it stood would therefore have changed public `/api/v1`
-- behaviour invisibly: a documented field that used to clear would silently retain. That is not a
-- refactor. `?` (key presence) expresses the distinction the callers already rely on:
--
--   key absent          -> inherit the prior row's value
--   key present, null   -> write NULL, clearing the fact deliberately
--   key present, value  -> write the value
--
-- WHY THE ASSIGNMENT BRANCH IS DELIBERATELY DIFFERENT. It keeps COALESCE for room, site, type,
-- program category and commitment kind, because the primitive does not accept those from the caller
-- at all for assignments - the assignment payload carries only `start_date`, `schedule_pattern_id`,
-- `source_key` and `metadata`. There is no caller intent to distinguish, so inheriting is the whole
-- point (that was the 20261109120000 repair). Adding key-presence there would invent a capability
-- the callers cannot express.
--
-- Behaviour-preserving by construction: every existing caller passes both placement keys explicitly,
-- so every existing call resolves exactly as it did before.
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
            -- KEY PRESENCE, not COALESCE. An explicit null means "clear this"; an absent key means
            -- "leave it alone". COALESCE cannot tell those apart and silently turns the first into
            -- the second.
            CASE WHEN p_placement ? 'program_category_id'
                 THEN (p_placement ->> 'program_category_id')::uuid
                 ELSE v_prior_plc.program_category_id END,
            CASE WHEN p_placement ? 'room_location_id'
                 THEN (p_placement ->> 'room_location_id')::uuid
                 ELSE v_prior_plc.room_location_id END,
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

-- SELF-TEST. Catalog-only; writes nothing.
DO $selftest$
DECLARE
    v_def       text;
    v_plc_block text;
    v_asg_block text;
    v_missing   text[] := ARRAY[]::text[];
    v_col       text;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'apply_participation_operational_change';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'selftest: apply_participation_operational_change is not installed';
    END IF;
    IF (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'apply_participation_operational_change') THEN
        RAISE EXCEPTION 'selftest: the function became SECURITY DEFINER, which bypasses RLS entirely';
    END IF;

    -- The placement branch must ask whether the caller NAMED the field.
    IF position('p_placement ? ''program_category_id''' IN v_def) = 0
       OR position('p_placement ? ''room_location_id''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'selftest: the placement branch no longer distinguishes an absent key from an '
            'explicit null, so superseding without naming a room would silently retain it';
    END IF;

    -- The 20261109120000 repair must survive: the assignment successor still carries its facts.
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
        RAISE EXCEPTION 'selftest: the assignment successor would drop %', array_to_string(v_missing, ', ');
    END IF;

    -- The placement branch must still write every column it owns.
    v_plc_block := substring(v_def from 'INSERT INTO public\.child_placements \(([^)]*)\)');
    FOREACH v_col IN ARRAY ARRAY['site_location_id', 'room_location_id', 'program_category_id', 'reason_key'] LOOP
        IF position(v_col IN coalesce(v_plc_block, '')) = 0 THEN
            RAISE EXCEPTION 'selftest: the placement successor no longer writes %', v_col;
        END IF;
    END LOOP;

    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'apply_participation_operational_change'
           AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) > 0 THEN
        RAISE EXCEPTION 'selftest: a client role holds EXECUTE on the temporal primitive';
    END IF;
    IF NOT (SELECT has_function_privilege('service_role', p.oid, 'EXECUTE')
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'apply_participation_operational_change') THEN
        RAISE EXCEPTION 'selftest: service_role lost EXECUTE; the server-side caller cannot run';
    END IF;
END
$selftest$;
