-- ATOMIC TEMPORAL PERSISTENCE FOR A COMBINED PARTICIPATION CHANGE
--
-- WHY THIS EXISTS. `applyChildParticipationEdit` mutates operational effective-dated truth in place
-- — `child_placements` (program, room, start date) and `schedule_assignments` (terms) — once a
-- participation has materialised, emitting none of the change events supersession emits. The
-- effective-dating doctrine (`docs/platform/core/effective-dated-assignment-doctrine.md`) forbids
-- that: a change to a defining fact creates a successor.
--
-- Converging it needs something that did not exist. A single operator edit can change placement AND
-- schedule truth together; the canonical services are separate TypeScript functions with no shared
-- transaction; the Supabase client cannot open one; and `supersedeChildPlacement` is NOT
-- retry-idempotent — a retry finds its own successor and supersedes THAT, chaining spurious rows. So
-- all-or-nothing requires one server-side transaction. One function body is one.
--
-- WHAT THIS IS NOT. It is not a second Placement or Scheduling policy engine. It decides nothing:
-- no eligibility, no authorization, no choice of room or pattern, no event. TypeScript still decides
-- that a change is required, validates intent, authorizes, picks the values and emits the events.
-- This owns exactly four things TypeScript cannot own across two tables: atomic persistence,
-- supersession linkage, truth-interval integrity, and concurrency/retry protection.
--
-- SECURITY INVOKER, deliberately. It runs with the caller's privileges, so RLS still applies and it
-- adds no privilege surface — unlike a SECURITY DEFINER function, which would land in the family the
-- 2026-09/11 RPC execute boundaries exist to keep closed. It follows
-- `materialize_participation_and_stamp_provenance`, which is INVOKER for the same reason.
--
-- NOT YET WIRED. No application code calls this. The canonical services are unchanged in this
-- migration, deliberately: the behavioural matrix this needs — rollback on partner failure, stale
-- concurrent edit, retry replay — can only be proved against a live database, and rewiring the write
-- path for enrollment truth on unproven transactional SQL would be the riskiest possible order of
-- work. Wiring happens in the follow-up that can run those tests.

-- ---------------------------------------------------------------------------
-- 1. IDEMPOTENCY LEDGER
--
--    The repository convention is an attempts row under a unique index —
--    `processing_commit_attempts (plan_id, execution_idempotency_key)`. Same shape here.
--
--    The insert happens FIRST, before any temporal write, and that ordering is the mechanism rather
--    than bookkeeping: a concurrent duplicate blocks on the unique index until the first transaction
--    commits or aborts. If it committed, the duplicate sees the conflict and returns the stored
--    result without touching a row. If it aborted, the attempt row rolled back with it, so the retry
--    is free to proceed. There is no window in which a second attempt can supersede the successor the
--    first one created.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.participation_change_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    enrollment_agreement_id uuid NOT NULL
        REFERENCES public.child_enrollment_agreements (id) ON DELETE CASCADE,
    idempotency_key text NOT NULL,
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT participation_change_attempts_key_nonempty
        CHECK (char_length(btrim(idempotency_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_participation_change_attempts_key
    ON public.participation_change_attempts (org_id, enrollment_agreement_id, idempotency_key);

-- A new public table has no RLS and Supabase's default privileges grant `authenticated` SELECT, so
-- it is world-readable across tenants the moment it exists unless this says otherwise.
ALTER TABLE public.participation_change_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access participation_change_attempts"
    ON public.participation_change_attempts;
CREATE POLICY "service role full access participation_change_attempts"
    ON public.participation_change_attempts
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. THE PRIMITIVE
-- ---------------------------------------------------------------------------
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

    -- ── PLACEMENT ──
    IF p_placement IS NOT NULL THEN
        -- FOR UPDATE is the concurrency boundary: a second edit blocks here rather than reading a row
        -- that is about to stop being current and branching the chain from it.
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
        -- Strictly after the prior start, and after any prior end, so the superseded row always
        -- asserts a non-empty interval. A zero-length prior row would publish a period of care that
        -- never happened, which is what `canceled` is for.
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

        INSERT INTO public.schedule_assignments (
            org_id, enrollment_agreement_id, schedule_pattern_id, customer_member_id,
            subject_type, is_primary, start_date, end_date, status, assignment_kind,
            source_key, supersedes_assignment_id, metadata, created_by, updated_by
        ) VALUES (
            p_org_id, p_enrollment_agreement_id,
            COALESCE((p_assignment ->> 'schedule_pattern_id')::uuid, v_prior_asg.schedule_pattern_id),
            v_prior_asg.customer_member_id,
            'child', true, v_start, NULL, v_status, v_prior_asg.assignment_kind,
            COALESCE(p_assignment ->> 'source_key', 'operator'),
            v_prior_asg.id,
            COALESCE(p_assignment -> 'metadata', '{}'::jsonb),
            p_actor, p_actor
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

REVOKE EXECUTE ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.apply_participation_operational_change(
    uuid, uuid, text, date, uuid, jsonb, jsonb, uuid, uuid) IS
'Atomic temporal persistence for a combined participation change. Closes prior placement and/or child '
'primary schedule-assignment truth intervals and inserts their successors in ONE transaction. Owns '
'persistence, supersession linkage, interval integrity and retry/concurrency protection only — every '
'domain decision, authorization and event stays in TypeScript. SECURITY INVOKER: RLS applies.';

-- ---------------------------------------------------------------------------
-- 3. SELF-TEST — catalog shape, read from the catalog rather than assumed.
--
--    Scoped to what this migration is responsible for, per `migrationSelfTestScope.test.ts`: an
--    estate-wide claim inside a narrow migration turns another lane's work into a refusal to apply
--    this one. It asserts structure, not behaviour — rollback, stale-edit and replay semantics need a
--    live database and belong in the test matrix, not in a one-shot embedded guard.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_secdef boolean;
    v_acl    text;
BEGIN
    SELECT p.prosecdef, coalesce(array_to_string(p.proacl::text[], ','), '')
      INTO v_secdef, v_acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'apply_participation_operational_change';

    IF v_secdef IS NULL THEN
        RAISE EXCEPTION 'apply_participation_operational_change was not created';
    END IF;

    -- The doctrine turns on this: a DEFINER function would bypass RLS and join the family the RPC
    -- execute boundaries exist to keep shut.
    IF v_secdef THEN
        RAISE EXCEPTION 'apply_participation_operational_change is SECURITY DEFINER; it must be INVOKER';
    END IF;

    IF v_acl ILIKE '%authenticated=X%' OR v_acl ILIKE '%anon=X%'
       OR v_acl ILIKE '%{=X%' OR v_acl ILIKE '%,=X%' THEN
        RAISE EXCEPTION 'apply_participation_operational_change is executable by a client principal: %', v_acl;
    END IF;
    IF v_acl NOT ILIKE '%service_role=X%' THEN
        RAISE EXCEPTION 'apply_participation_operational_change has no service_role EXECUTE; the supported path cannot call it';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'participation_change_attempts' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'participation_change_attempts has no row level security';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = 'ux_participation_change_attempts_key'
    ) THEN
        RAISE EXCEPTION 'the idempotency unique index is missing; retry protection is the index, not the code';
    END IF;

    RAISE NOTICE 'apply_participation_operational_change: INVOKER, client-closed, service_role granted, idempotency index present';
END;
$selftest$;
