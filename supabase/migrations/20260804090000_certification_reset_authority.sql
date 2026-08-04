-- Certification reset authority — a single governed exemption to Processing immutability.
--
-- @see docs/handoffs/firefly-certification-deletion-contract.md
--
-- THE PROBLEM
--
-- Three tables in the certification deletion graph are append-only by trigger:
--   processing_plan_operations   trg_processing_plan_operations_immutable
--   processing_facts             trg_processing_facts_immutable
--   processing_commit_attempts   trg_processing_commit_attempts_append_only
--
-- Each raises unconditionally on UPDATE OR DELETE. The certification reset requires those rows to
-- reach zero for one named non-production org. Both rules are deliberate, so the exemption has to
-- be explicit, narrow, and auditable rather than a flag that turns immutability off.
--
-- THE SHAPE OF THE EXEMPTION
--
--   * DELETE only. UPDATE stays impossible for everyone, always — the reset needs removal, never
--     rewriting, and a rewrite is the failure mode the ledger exists to prevent.
--   * Transaction-local. The authorization lives in `set_config(..., is_local => true)`, so it
--     evaporates at COMMIT or ROLLBACK and cannot leak into a later statement on a pooled
--     connection.
--   * Org-bound. The guard compares the ROW's org_id to the authorized org. A permit for one org
--     cannot delete another's history even inside the same transaction.
--   * Purpose-bound. A fixed purpose string must match; an empty or wrong purpose is refused.
--   * Not reachable by clients. The RPC is REVOKEd from anon and authenticated. Only service_role
--     may call it, and only through the certification reset utility.
--   * Audited. Every grant of the authority writes a workflow_event naming org, purpose and actor.

-- ---------------------------------------------------------------------------------------------
-- 1. The authorization predicate
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.certification_reset_authorized(p_org_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    SET search_path = public
AS $cert_auth$
DECLARE
    v_org  text := current_setting('alloy.certification_reset_org', true);
    v_purp text := current_setting('alloy.certification_reset_purpose', true);
BEGIN
    -- Absent settings are the normal case: every ordinary path lands here and gets false.
    IF v_org IS NULL OR v_org = '' OR v_purp IS NULL OR v_purp = '' THEN
        RETURN false;
    END IF;
    IF v_purp <> 'certification_baseline_reset' THEN
        RETURN false;
    END IF;
    IF p_org_id IS NULL THEN
        RETURN false;
    END IF;
    RETURN v_org = p_org_id::text;
END;
$cert_auth$;

COMMENT ON FUNCTION public.certification_reset_authorized(uuid) IS
    'True only inside a transaction that set alloy.certification_reset_org/_purpose locally for this exact org. Used by append-only guards to permit certification-reset DELETEs.';

-- ---------------------------------------------------------------------------------------------
-- 2. Re-declare the three guards to honour the exemption on DELETE only
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.processing_plan_operations_immutable_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
AS $d1_ops_guard$
BEGIN
    IF TG_OP = 'DELETE' AND public.certification_reset_authorized(OLD.org_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'processing_plan_operations rows are immutable; build a new plan version instead';
END;
$d1_ops_guard$;

CREATE OR REPLACE FUNCTION public.processing_facts_immutable_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
AS $facts_guard$
BEGIN
    IF TG_OP = 'DELETE' AND public.certification_reset_authorized(OLD.org_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'processing_facts rows are immutable; append a corrected fact instead';
END;
$facts_guard$;

CREATE OR REPLACE FUNCTION public.processing_commit_attempts_append_only_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
AS $attempts_guard$
BEGIN
    IF TG_OP = 'DELETE' AND public.certification_reset_authorized(OLD.org_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'processing_commit_attempts is append-only; record a new attempt instead';
END;
$attempts_guard$;

-- ---------------------------------------------------------------------------------------------
-- 3. The atomic reset RPC
-- ---------------------------------------------------------------------------------------------
--
-- One transaction. A plpgsql function body is atomic with respect to its caller: any exception
-- rolls the whole thing back. That is the property the previous sequential client-side deletion
-- lacked — it committed leaves (documents, communications, bookings) and then failed on a root,
-- leaving the tenant half-deleted with no way to tell from the outside.
--
-- The caller supplies the certified ID graph resolved by the dry run, so execute deletes exactly
-- what was reported. Ids absent from the database are simply not deleted — that is what makes a
-- retry against a partially reset tenant safe rather than an error.

CREATE OR REPLACE FUNCTION public.certification_reset_execute(
    p_org_id uuid,
    p_purpose text,
    p_actor text,
    p_graph jsonb
)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $cert_reset$
DECLARE
    v_counts jsonb := '{}'::jsonb;
    v_n bigint;
    v_blockers text := '';

    v_opps        uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'opportunity_ids','[]'))::uuid);
    v_customers   uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'customer_ids','[]'))::uuid);
    v_persons     uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'person_ids','[]'))::uuid);
    v_members     uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'customer_member_ids','[]'))::uuid);
    v_threads     uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'thread_ids','[]'))::uuid);
    v_documents   uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'document_ids','[]'))::uuid);
    v_forms       uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'form_submission_ids','[]'))::uuid);
    v_packets     uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'form_packet_session_ids','[]'))::uuid);
    v_contacts    uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'contact_ids','[]'))::uuid);
    v_tasks       uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'operational_task_ids','[]'))::uuid);
    v_events      uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'workflow_event_ids','[]'))::uuid);
    v_cases       uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'processing_case_ids','[]'))::uuid);
    v_plans       uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_graph->'processing_plan_ids','[]'))::uuid);
BEGIN
    -- --- authorization -----------------------------------------------------------------------
    IF p_purpose IS DISTINCT FROM 'certification_baseline_reset' THEN
        RAISE EXCEPTION 'certification_reset_execute: unrecognised purpose %', coalesce(p_purpose, '(null)');
    END IF;
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'certification_reset_execute: org id is required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = p_org_id) THEN
        RAISE EXCEPTION 'certification_reset_execute: org % does not exist in this database', p_org_id;
    END IF;

    -- Transaction-local ONLY. Dies at COMMIT or ROLLBACK; cannot outlive this call.
    PERFORM set_config('alloy.certification_reset_org', p_org_id::text, true);
    PERFORM set_config('alloy.certification_reset_purpose', 'certification_baseline_reset', true);

    -- --- preflight: restrictive FKs that would abort mid-transaction ---------------------------
    -- These tables hold ON DELETE RESTRICT references to customer_members / persons and are NOT in
    -- the certification graph. Empty today; if they ever hold rows the delete must fail HERE, with
    -- a name, rather than deep inside the sequence.
    SELECT string_agg(t, ', ') INTO v_blockers FROM (
        SELECT 'child_attendance_events' AS t WHERE EXISTS (SELECT 1 FROM public.child_attendance_events WHERE org_id = p_org_id)
        UNION ALL SELECT 'child_enrollment_agreements' WHERE EXISTS (SELECT 1 FROM public.child_enrollment_agreements WHERE org_id = p_org_id)
        UNION ALL SELECT 'child_placements' WHERE EXISTS (SELECT 1 FROM public.child_placements WHERE org_id = p_org_id)
        UNION ALL SELECT 'schedule_assignments' WHERE EXISTS (SELECT 1 FROM public.schedule_assignments WHERE org_id = p_org_id)
    ) blockers;
    IF v_blockers IS NOT NULL AND v_blockers <> '' THEN
        RAISE EXCEPTION 'certification_reset_execute: RESTRICT-bearing tables still hold rows for this org (%). They are outside the certification graph and must be resolved before a reset can complete.', v_blockers;
    END IF;

    -- --- deletion, FK-safe order, all inside this transaction ----------------------------------
    -- Every statement is org-scoped in addition to the id list. Widening the id list can never
    -- widen tenancy.

    DELETE FROM public.communication_message_reads WHERE message_id IN (
        SELECT id FROM public.communication_messages WHERE org_id = p_org_id AND thread_id = ANY(v_threads));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('communication_message_reads', v_n);

    DELETE FROM public.communication_messages WHERE org_id = p_org_id AND thread_id = ANY(v_threads);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('communication_messages', v_n);

    DELETE FROM public.communication_scheduled_sends WHERE org_id = p_org_id
        AND (entity_id = ANY(v_opps) OR recipient_person_id = ANY(v_persons));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('communication_scheduled_sends', v_n);

    DELETE FROM public.communication_threads WHERE org_id = p_org_id AND id = ANY(v_threads);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('communication_threads', v_n);

    -- Processing graph. The three exempted tables are in here; the guards permit these DELETEs
    -- because of the transaction-local context set above, and nothing else.
    DELETE FROM public.processing_plan_operations WHERE org_id = p_org_id AND plan_id = ANY(v_plans);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_plan_operations', v_n);

    DELETE FROM public.processing_commit_attempts WHERE org_id = p_org_id AND case_id = ANY(v_cases);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_commit_attempts', v_n);

    DELETE FROM public.processing_approvals WHERE org_id = p_org_id AND case_id = ANY(v_cases);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_approvals', v_n);

    DELETE FROM public.processing_exceptions WHERE org_id = p_org_id AND case_id = ANY(v_cases);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_exceptions', v_n);

    DELETE FROM public.processing_resolutions WHERE org_id = p_org_id AND case_id = ANY(v_cases);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_resolutions', v_n);

    DELETE FROM public.processing_facts WHERE org_id = p_org_id AND case_id = ANY(v_cases);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_facts', v_n);

    DELETE FROM public.processing_case_sources WHERE org_id = p_org_id AND processing_case_id = ANY(v_cases);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_case_sources', v_n);

    DELETE FROM public.processing_commit_plans WHERE org_id = p_org_id AND case_id = ANY(v_cases);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_commit_plans', v_n);

    DELETE FROM public.processing_cases WHERE org_id = p_org_id AND id = ANY(v_cases);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('processing_cases', v_n);

    -- Forms, documents, tasks
    DELETE FROM public.form_packet_session_items WHERE org_id = p_org_id AND packet_session_id = ANY(v_packets);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('form_packet_session_items', v_n);

    DELETE FROM public.form_packet_sessions WHERE org_id = p_org_id AND id = ANY(v_packets);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('form_packet_sessions', v_n);

    DELETE FROM public.form_submission_signatures WHERE org_id = p_org_id AND form_submission_id = ANY(v_forms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('form_submission_signatures', v_n);

    DELETE FROM public.form_submission_documents WHERE org_id = p_org_id AND form_submission_id = ANY(v_forms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('form_submission_documents', v_n);

    DELETE FROM public.form_submissions WHERE org_id = p_org_id AND id = ANY(v_forms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('form_submissions', v_n);

    DELETE FROM public.document_field_values WHERE document_id = ANY(v_documents);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('document_field_values', v_n);

    DELETE FROM public.document_versions WHERE document_id = ANY(v_documents);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('document_versions', v_n);

    DELETE FROM public.documents WHERE org_id = p_org_id AND id = ANY(v_documents);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('documents', v_n);

    DELETE FROM public.operational_tasks WHERE org_id = p_org_id AND id = ANY(v_tasks);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('operational_tasks', v_n);

    DELETE FROM public.tour_bookings WHERE org_id = p_org_id AND opportunity_id = ANY(v_opps);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('tour_bookings', v_n);

    DELETE FROM public.field_values WHERE org_id = p_org_id
        AND entity_type IN ('opportunities','persons','customers','customer_members')
        AND (entity_id = ANY(v_opps) OR entity_id = ANY(v_persons) OR entity_id = ANY(v_customers) OR entity_id = ANY(v_members));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('field_values', v_n);

    DELETE FROM public.process_instances WHERE org_id = p_org_id
        AND (context_id = ANY(v_opps) OR subject_id = ANY(v_members));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('process_instances', v_n);

    DELETE FROM public.opportunity_persons WHERE org_id = p_org_id AND opportunity_id = ANY(v_opps);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('opportunity_persons', v_n);

    DELETE FROM public.opportunity_customer_members WHERE org_id = p_org_id AND opportunity_id = ANY(v_opps);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('opportunity_customer_members', v_n);

    DELETE FROM public.opportunities WHERE org_id = p_org_id AND id = ANY(v_opps);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('opportunities', v_n);

    -- Identities last.
    DELETE FROM public.customer_member_contacts WHERE org_id = p_org_id AND customer_member_id = ANY(v_members);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_member_contacts', v_n);

    DELETE FROM public.contacts WHERE org_id = p_org_id AND id = ANY(v_contacts);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('contacts', v_n);

    DELETE FROM public.customer_members WHERE org_id = p_org_id AND id = ANY(v_members);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_members', v_n);

    DELETE FROM public.customer_persons WHERE org_id = p_org_id
        AND (customer_id = ANY(v_customers) OR person_id = ANY(v_persons));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_persons', v_n);

    DELETE FROM public.person_relationships WHERE org_id = p_org_id
        AND (from_person_id = ANY(v_persons) OR to_person_id = ANY(v_persons));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('person_relationships', v_n);

    DELETE FROM public.person_locations WHERE org_id = p_org_id AND person_id = ANY(v_persons);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('person_locations', v_n);

    DELETE FROM public.customers WHERE org_id = p_org_id AND id = ANY(v_customers);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customers', v_n);

    DELETE FROM public.persons WHERE org_id = p_org_id AND id = ANY(v_persons);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('persons', v_n);

    -- Workflow events last: they are the history of everything above.
    DELETE FROM public.workflow_events WHERE org_id = p_org_id AND id = ANY(v_events);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('workflow_events', v_n);

    -- --- audit -------------------------------------------------------------------------------
    -- The grant of this authority is itself operational history worth keeping. It names the org,
    -- the purpose and the actor, and carries the actual counts.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, action_type, payload, occurred_at)
    VALUES (
        p_org_id,
        'certification.reset.executed',
        'certification_reset',
        p_org_id,
        'delete',
        jsonb_build_object('purpose', p_purpose, 'actor', coalesce(p_actor, 'unknown'), 'deleted', v_counts),
        now()
    );

    RETURN jsonb_build_object('ok', true, 'org_id', p_org_id, 'deleted', v_counts);
END;
$cert_reset$;

COMMENT ON FUNCTION public.certification_reset_execute(uuid, text, text, jsonb) IS
    'Governed non-production certification reset. Deletes a supplied certified ID graph for ONE org in ONE transaction, permitting DELETE on append-only Processing tables via a transaction-local authorization. Not an operator capability.';

-- Clients must never reach this. service_role only.
REVOKE ALL ON FUNCTION public.certification_reset_execute(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.certification_reset_execute(uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.certification_reset_execute(uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.certification_reset_execute(uuid, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.certification_reset_authorized(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.certification_reset_authorized(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.certification_reset_authorized(uuid) FROM authenticated;
