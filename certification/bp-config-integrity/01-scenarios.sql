-- Law 4 scenario proof against real Postgres.
\set ON_ERROR_STOP on
\pset pager off

CREATE OR REPLACE FUNCTION pg_temp.ok(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF cond THEN RAISE NOTICE 'PASS  %', label;
    ELSE RAISE EXCEPTION 'FAIL  %', label;
    END IF;
END $$;

DO $outer$
DECLARE
    v_org uuid;
    v_dept uuid;
    v_actor uuid;
    v_draft uuid;
    v_rev1 uuid; v_rev2 uuid;
    v_res jsonb;
    v_num integer;
    v_msg text;
    v_projection jsonb;
    v_count integer;
BEGIN
    INSERT INTO auth.users DEFAULT VALUES RETURNING id INTO v_actor;
    INSERT INTO public.orgs (name) VALUES ('Test Org') RETURNING id INTO v_org;
    INSERT INTO public.departments (org_id, key, name, metadata)
    VALUES (v_org, 'enrollment', 'Enrollment',
            jsonb_build_object('unrelated_key', jsonb_build_object('keep', true)))
    RETURNING id INTO v_dept;

    -- ---------------------------------------------------------------
    -- 1. An UNVALIDATED draft must not publish (Law 3 boundary).
    -- ---------------------------------------------------------------
    INSERT INTO public.business_process_drafts (org_id, department_id, payload, draft_status)
    VALUES (v_org, v_dept, jsonb_build_object('version', 1, 'processes', '[]'::jsonb), 'draft')
    RETURNING id INTO v_draft;

    BEGIN
        PERFORM public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'sum-a');
        PERFORM pg_temp.ok('unvalidated draft rejected', false);
    EXCEPTION WHEN check_violation THEN
        PERFORM pg_temp.ok('unvalidated draft rejected', true);
    END;

    -- ---------------------------------------------------------------
    -- 2. First publish succeeds (no prior publication, base_revision_id NULL).
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET draft_status = 'validated', validated_at = now(), validation_errors = '[]'::jsonb
    WHERE id = v_draft;

    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'sum-a');
    v_rev1 := (v_res->>'revision_id')::uuid;
    PERFORM pg_temp.ok('first publish -> revision 1', (v_res->>'revision_number')::int = 1);

    SELECT count(*) INTO v_count FROM public.configuration_publications
    WHERE org_id = v_org AND domain_key = 'business_process' AND subject_id = v_dept;
    PERFORM pg_temp.ok('publication row recorded on the generic table', v_count = 1);

    SELECT count(*) INTO v_count FROM public.workflow_events
    WHERE org_id = v_org AND event_type = 'configuration.business_process.published';
    PERFORM pg_temp.ok('audit event emitted', v_count = 1);

    -- Runtime projection written in the SAME transaction, siblings preserved.
    SELECT metadata INTO v_projection FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('runtime projection written',
        v_projection->'lifecycle_builder_v1'->>'version' = '1');
    PERFORM pg_temp.ok('projection preserves unrelated metadata siblings',
        v_projection->'unrelated_key'->>'keep' = 'true');

    -- Draft was rebased onto what was just published.
    PERFORM pg_temp.ok('draft rebased onto new revision',
        (SELECT base_revision_id FROM public.business_process_drafts WHERE id = v_draft) = v_rev1);

    -- ---------------------------------------------------------------
    -- 3. THE CORE LAW 4 TEST — a stale draft must not overwrite a newer publication.
    -- ---------------------------------------------------------------
    -- Second publish from the (correctly rebased) draft succeeds -> revision 2.
    UPDATE public.business_process_drafts
    SET payload = jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'edit', 'second'),
        draft_status = 'validated', validated_at = now()
    WHERE id = v_draft;
    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'sum-b');
    v_rev2 := (v_res->>'revision_id')::uuid;
    PERFORM pg_temp.ok('rebased draft publishes -> revision 2', (v_res->>'revision_number')::int = 2);

    -- Now simulate a stale editor: draft still points at revision 1 while revision 2 is current.
    UPDATE public.business_process_drafts
    SET base_revision_id = v_rev1,
        payload = jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'edit', 'STALE'),
        draft_status = 'validated', validated_at = now()
    WHERE id = v_draft;

    BEGIN
        PERFORM public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'sum-stale');
        PERFORM pg_temp.ok('STALE DRAFT BLOCKED', false);
    EXCEPTION WHEN serialization_failure THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        PERFORM pg_temp.ok('STALE DRAFT BLOCKED: ' || v_msg, true);
    END;

    -- The stale write must not have landed anywhere.
    SELECT max(revision_number) INTO v_num FROM public.business_process_revisions
    WHERE org_id = v_org AND department_id = v_dept;
    PERFORM pg_temp.ok('no revision created by the blocked publish', v_num = 2);

    SELECT metadata INTO v_projection FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('runtime projection still the newer revision, not the stale payload',
        v_projection->'lifecycle_builder_v1'->>'edit' = 'second');

    -- ---------------------------------------------------------------
    -- 4. Revisions are immutable.
    -- ---------------------------------------------------------------
    BEGIN
        UPDATE public.business_process_revisions SET payload = '{}'::jsonb WHERE id = v_rev1;
        PERFORM pg_temp.ok('revision UPDATE blocked', false);
    EXCEPTION WHEN feature_not_supported THEN
        PERFORM pg_temp.ok('revision UPDATE blocked', true);
    END;

    BEGIN
        DELETE FROM public.business_process_revisions WHERE id = v_rev1;
        PERFORM pg_temp.ok('revision DELETE blocked', false);
    EXCEPTION WHEN feature_not_supported THEN
        PERFORM pg_temp.ok('revision DELETE blocked', true);
    END;

    -- ---------------------------------------------------------------
    -- 5. Rollback is forward-only: restores payload as a NEW revision.
    -- ---------------------------------------------------------------
    v_res := public.rollback_business_process_to_revision_v1(v_org, v_dept, v_rev1, v_actor);
    PERFORM pg_temp.ok('rollback creates revision 3 (forward-only)',
        (v_res->>'revision_number')::int = 3);
    PERFORM pg_temp.ok('rollback records provenance',
        (v_res->>'rolled_back_from_revision_id')::uuid = v_rev1);

    SELECT metadata INTO v_projection FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('rollback rewrote the runtime projection to revision 1 payload',
        v_projection->'lifecycle_builder_v1'->'edit' IS NULL);

    SELECT count(*) INTO v_count FROM public.business_process_revisions
    WHERE org_id = v_org AND department_id = v_dept;
    PERFORM pg_temp.ok('history is append-only (3 revisions retained)', v_count = 3);

    -- ---------------------------------------------------------------
    -- 6. After rollback the draft is rebased, so a normal publish works again.
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET payload = jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'edit', 'after-rollback'),
        draft_status = 'validated', validated_at = now()
    WHERE id = v_draft;
    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'sum-d');
    PERFORM pg_temp.ok('publish resumes after rollback -> revision 4',
        (v_res->>'revision_number')::int = 4);

    RAISE NOTICE '--- ALL SCENARIOS PASSED ---';
END
$outer$;
