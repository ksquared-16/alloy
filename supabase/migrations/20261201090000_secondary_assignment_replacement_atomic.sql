-- REPLACING A SECONDARY ASSIGNMENT IS ONE TRANSACTION.
--
-- `createOperationalAssignment` (assignment.create / assignment.change_room with a predecessor)
-- replaced a secondary in two PostgREST calls. #1532 reordered them (successor first, guarded
-- close, compensating delete) so a refusal could no longer lose the commitment, but a crash between
-- the calls still left two live rows, and a retried request could chain a second successor. This
-- function makes the replacement one statement-level unit: the predecessor is locked, checked,
-- closed and succeeded in a single transaction, and any refusal — including the consistency
-- trigger on the successor INSERT — rolls the close back with it.
--
-- WHY NOT `apply_participation_operational_change`. It is the canonical temporal primitive, but it
-- selects only the child PRIMARY row (`is_primary`, `subject_type = 'child'`), inserts
-- `'child', true` literally, requires an enrollment agreement, and keys its idempotency table on
-- `enrollment_agreement_id NOT NULL`. Secondaries are proposed (pre-enrolment, no agreement) or
-- staff (never an agreement) as often as they are committed child rows; widening that primitive would
-- change its contract for every primary caller. This is its sibling: the same lock-check-close-insert
-- shape, the same SECURITY INVOKER + service_role-only grant, scoped to `is_primary = false`.
--
-- IDEMPOTENCY WITHOUT A NEW TABLE. The lineage already records what happened: the successor names its
-- predecessor (`supersedes_assignment_id`). The caller's replacement key is stored on the successor
-- (`metadata.replacement_key`). A retry finds the predecessor already superseded BY THAT KEY and is
-- answered with the successor it created; any other request against a superseded predecessor is
-- stale. Concurrent replacements serialise on the predecessor's row lock, so at most one succeeds.
--
-- WHAT IT DOES NOT DECIDE. The caller (TypeScript service) still resolves the subject's site, validates
-- the pattern and the room, derives the successor's status and builds the row. This function binds the
-- predecessor to that subject and scope and performs the replacement; it introduces no category,
-- overlap or location policy.
--
-- Re-runnable: CREATE OR REPLACE only, no DDL on tables.

CREATE OR REPLACE FUNCTION public.replace_secondary_schedule_assignment(
    p_org_id uuid,
    p_prior_assignment_id uuid,
    -- The subject the caller resolved: 'child' with p_customer_member_id (or the agreement), or
    -- 'staff' with p_subject_person_id. The predecessor must be that subject's.
    p_subject_type text,
    p_customer_member_id uuid,
    p_enrollment_agreement_id uuid,
    p_subject_person_id uuid,
    p_replacement_key text,
    p_actor uuid,
    -- {site_location_id, room_location_id, program_category_id, operational_assignment_type_id,
    --  schedule_pattern_id, start_date, end_date, status, commitment_kind, assignment_kind,
    --  source_key, metadata}
    p_successor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_prior   public.schedule_assignments;
    v_key     text := btrim(coalesce(p_replacement_key, ''));
    v_start   date;
    v_close   date;
    v_site    uuid;
    v_new     public.schedule_assignments;
    v_replay  public.schedule_assignments;
BEGIN
    IF v_key = '' THEN
        RAISE EXCEPTION 'replacement_key_required';
    END IF;
    IF p_successor IS NULL THEN
        RAISE EXCEPTION 'successor_required';
    END IF;

    -- ── THE PREDECESSOR, LOCKED, AND ONLY IF IT IS THIS SUBJECT'S IN THIS ORG ──
    SELECT * INTO v_prior
      FROM public.schedule_assignments
     WHERE id = p_prior_assignment_id
       AND org_id = p_org_id
     FOR UPDATE;

    IF NOT FOUND
       OR v_prior.subject_type IS DISTINCT FROM p_subject_type
       OR (p_subject_type = 'child' AND NOT (
               (p_customer_member_id IS NOT NULL AND v_prior.customer_member_id = p_customer_member_id)
            OR (p_enrollment_agreement_id IS NOT NULL AND v_prior.enrollment_agreement_id = p_enrollment_agreement_id)))
       OR (p_subject_type = 'staff' AND (p_subject_person_id IS NULL OR v_prior.subject_person_id IS DISTINCT FROM p_subject_person_id))
       OR p_subject_type NOT IN ('child', 'staff') THEN
        -- One answer for "absent" and "someone else's": the caller learns nothing about other subjects.
        RAISE EXCEPTION 'prior_not_found';
    END IF;

    IF v_prior.is_primary THEN
        RAISE EXCEPTION 'primary_not_supported: primary rows supersede through the primary paths';
    END IF;

    -- ── NOT LIVE: A RETRY OF THIS REPLACEMENT, OR STALE ──
    IF v_prior.status <> ALL (ARRAY['planned', 'active', 'ending']) THEN
        SELECT * INTO v_replay
          FROM public.schedule_assignments
         WHERE org_id = p_org_id
           AND supersedes_assignment_id = v_prior.id
           AND metadata ->> 'replacement_key' = v_key
         ORDER BY created_at
         LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('ok', true, 'replayed', true,
                'prior_id', v_prior.id, 'prior_end_date', v_prior.end_date,
                'successor', to_jsonb(v_replay));
        END IF;
        RAISE EXCEPTION 'stale_predecessor: assignment % is % and was not replaced by this request',
            v_prior.id, v_prior.status;
    END IF;

    -- ── SCOPE: A REPLACEMENT STAYS AT ITS SITE ──
    v_site := (p_successor ->> 'site_location_id')::uuid;
    IF v_site IS DISTINCT FROM v_prior.site_location_id THEN
        RAISE EXCEPTION 'site_mismatch: the successor must stay at the predecessor''s site';
    END IF;

    v_start := (p_successor ->> 'start_date')::date;
    IF v_start IS NULL THEN
        RAISE EXCEPTION 'successor_start_date_required';
    END IF;
    IF v_start <= v_prior.start_date
       OR (v_prior.end_date IS NOT NULL AND v_start <= v_prior.end_date) THEN
        RAISE EXCEPTION 'invalid_successor_start: % must be after prior start % and prior end %',
            v_start, v_prior.start_date, v_prior.end_date;
    END IF;
    v_close := v_start - INTERVAL '1 day';

    -- ── CLOSE AND SUCCEED, TOGETHER ──
    UPDATE public.schedule_assignments
       SET status = 'superseded',
           end_date = v_close,
           updated_by = p_actor,
           updated_at = now()
     WHERE id = v_prior.id AND org_id = p_org_id;

    -- Subject identity comes from the locked predecessor, never from the payload: a replacement
    -- cannot move a commitment to another subject.
    INSERT INTO public.schedule_assignments (
        org_id, subject_type, enrollment_agreement_id, customer_member_id, subject_person_id,
        site_location_id, room_location_id, program_category_id, operational_assignment_type_id,
        is_primary, commitment_kind, schedule_pattern_id, start_date, end_date, status,
        assignment_kind, source_key, supersedes_assignment_id, metadata, created_by, updated_by
    ) VALUES (
        p_org_id, v_prior.subject_type, v_prior.enrollment_agreement_id, v_prior.customer_member_id,
        v_prior.subject_person_id,
        v_site,
        (p_successor ->> 'room_location_id')::uuid,
        (p_successor ->> 'program_category_id')::uuid,
        (p_successor ->> 'operational_assignment_type_id')::uuid,
        false,
        COALESCE(p_successor ->> 'commitment_kind', v_prior.commitment_kind),
        (p_successor ->> 'schedule_pattern_id')::uuid,
        v_start,
        (p_successor ->> 'end_date')::date,
        p_successor ->> 'status',
        COALESCE(p_successor ->> 'assignment_kind', v_prior.assignment_kind),
        COALESCE(p_successor ->> 'source_key', 'operator'),
        v_prior.id,
        COALESCE(p_successor -> 'metadata', '{}'::jsonb) || jsonb_build_object('replacement_key', v_key),
        p_actor, p_actor
    )
    RETURNING * INTO v_new;

    RETURN jsonb_build_object('ok', true, 'replayed', false,
        'prior_id', v_prior.id, 'prior_end_date', v_close,
        'successor', to_jsonb(v_new));
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.replace_secondary_schedule_assignment(
    uuid, uuid, text, uuid, uuid, uuid, text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_secondary_schedule_assignment(
    uuid, uuid, text, uuid, uuid, uuid, text, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_secondary_schedule_assignment(
    uuid, uuid, text, uuid, uuid, uuid, text, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_secondary_schedule_assignment(
    uuid, uuid, text, uuid, uuid, uuid, text, uuid, jsonb) TO service_role;

-- SELF-TEST. Catalog-only; writes nothing.
DO $selftest$
DECLARE
    v_oid oid;
BEGIN
    SELECT p.oid INTO v_oid
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'replace_secondary_schedule_assignment';
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'selftest: replace_secondary_schedule_assignment is not installed';
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
        RAISE EXCEPTION 'selftest: the function became SECURITY DEFINER, which bypasses RLS entirely';
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'selftest: a client role holds EXECUTE on the replacement primitive';
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'selftest: service_role lost EXECUTE; the server-side caller cannot run';
    END IF;
    IF position('FOR UPDATE' IN pg_get_functiondef(v_oid)) = 0 THEN
        RAISE EXCEPTION 'selftest: the predecessor is no longer locked, so concurrent replacements could branch';
    END IF;
END
$selftest$;
