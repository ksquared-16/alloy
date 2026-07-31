-- Law 4, editor slice 2 — the full editor vertical: draft edit -> validate -> publish -> runtime.
--
-- Slice 3's harness proved the stage save's WRITE SHAPE survives the guard. This one proves the
-- workflow around it: that the draft has its own optimistic-concurrency token, that the token is
-- structural rather than conventional, that a stale publication cannot overwrite a newer one, and
-- that a blocked publish leaves nothing behind.
--
-- These are the scenarios application tests cannot honestly assert, because every one of them is a
-- claim about what Postgres does under concurrency and constraint.
--
-- Run after 00-stubs.sql, all three migrations, 01-scenarios.sql, 02-write-guard.sql, 03-stage-save.sql.
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
    v_res jsonb;
    v_meta jsonb;
    v_msg text;
    v_builder jsonb;
    v_rev1 uuid;
    v_rev2 uuid;
    v_num integer;
    v_token bigint;
    v_rows integer;
BEGIN
    PERFORM set_config('alloy.lifecycle_guard', 'enforce', true);

    INSERT INTO auth.users DEFAULT VALUES RETURNING id INTO v_actor;
    INSERT INTO public.orgs (name) VALUES ('Publication Workflow Org') RETURNING id INTO v_org;

    v_builder := jsonb_build_object(
        'version', 1,
        'active_process_id', 'proc-1',
        'unknown_builder_key_v1', jsonb_build_object('kept', true),
        'processes', jsonb_build_array(jsonb_build_object(
            'id', 'proc-1', 'key', 'enrollment', 'name', 'Enrollment',
            'primary_entity', 'opportunity', 'sort_order', 0, 'is_active', true,
            'stages', jsonb_build_array(
                jsonb_build_object('id', 'stage-lead', 'key', 'lead', 'label', 'Lead',
                                   'sort_order', 0, 'is_active', true,
                                   'row_grain_v1', jsonb_build_object('grain', 'child')),
                jsonb_build_object('id', 'stage-tour', 'key', 'tour', 'label', 'Tour',
                                   'sort_order', 1, 'is_active', true)
            )
        ))
    );

    INSERT INTO public.departments (org_id, key, name, metadata)
    VALUES (v_org, 'enrollment', 'Enrollment', '{}'::jsonb)
    RETURNING id INTO v_dept;

    INSERT INTO public.business_process_drafts
        (org_id, department_id, payload, draft_status, validated_at)
    VALUES (v_org, v_dept, v_builder, 'validated', now())
    RETURNING id INTO v_draft;

    -- ---------------------------------------------------------------
    -- 1. First publish establishes runtime.
    -- ---------------------------------------------------------------
    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'wf-1');
    v_rev1 := (v_res->>'revision_id')::uuid;
    PERFORM pg_temp.ok('publish -> revision 1', (v_res->>'revision_number')::int = 1);

    SELECT base_revision_id, draft_revision INTO v_rev2, v_token
    FROM public.business_process_drafts WHERE id = v_draft;
    PERFORM pg_temp.ok('draft rebased onto the publication it produced', v_rev2 = v_rev1);
    PERFORM pg_temp.ok('publish did not consume a draft-edit token', v_token = 1);

    -- ---------------------------------------------------------------
    -- 2. The draft-edit token. A payload change must advance it by exactly one.
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET payload = jsonb_set(payload, '{processes,0,stages,1,purpose}', '"Show families the school"'),
        draft_revision = 2
    WHERE id = v_draft AND draft_revision = 1;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.ok('draft edit with the current token succeeds', v_rows = 1);

    -- ---------------------------------------------------------------
    -- 3. A second editor holding the OLD token writes nothing. This is the draft-edit conflict:
    --    `base_revision_id` cannot see it, because no publish happened in between.
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET payload = jsonb_set(payload, '{processes,0,stages,1,purpose}', '"Conflicting edit"'),
        draft_revision = 2
    WHERE id = v_draft AND draft_revision = 1;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM pg_temp.ok('stale draft-edit token writes ZERO rows', v_rows = 0);

    PERFORM pg_temp.ok('the losing edit did not land',
        (SELECT payload->'processes'->0->'stages'->1->>'purpose'
         FROM public.business_process_drafts WHERE id = v_draft) = 'Show families the school');

    -- ---------------------------------------------------------------
    -- 4. The token is STRUCTURAL: a writer cannot change the payload without advancing it.
    --    Without this the compare-and-set would be a convention every future caller must remember.
    -- ---------------------------------------------------------------
    BEGIN
        UPDATE public.business_process_drafts
        SET payload = jsonb_set(payload, '{processes,0,stages,1,purpose}', '"Token-less write"')
        WHERE id = v_draft;
        PERFORM pg_temp.ok('payload change without advancing the token REJECTED', false);
    EXCEPTION WHEN serialization_failure THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        PERFORM pg_temp.ok('payload change without advancing the token REJECTED: ' || v_msg, true);
    END;

    -- Non-payload updates are exempt: validation and publish rebasing are not configuration edits.
    UPDATE public.business_process_drafts
    SET validation_errors = '[]'::jsonb, draft_status = 'draft'
    WHERE id = v_draft;
    PERFORM pg_temp.ok('a non-payload draft update needs no token', true);

    -- ---------------------------------------------------------------
    -- 5. The draft edit did NOT move runtime. `publication_required` is literal.
    -- ---------------------------------------------------------------
    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('runtime projection unchanged by draft edits',
        v_meta->'lifecycle_builder_v1'->'processes'->0->'stages'->1->>'purpose' IS NULL);
    PERFORM pg_temp.ok('draft edits never fired the lifecycle projection guard', true);

    -- ---------------------------------------------------------------
    -- 6. A publish blocked by validation creates NOTHING.
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET draft_status = 'draft',
        validation_errors = jsonb_build_array(jsonb_build_object(
            'code', 'dangling_stage_reference',
            'message', 'Stage "tour" move_to_stage "lead_to_tour" targets a transition that does not exist.'))
    WHERE id = v_draft;

    SELECT count(*) INTO v_num FROM public.business_process_revisions WHERE department_id = v_dept;
    BEGIN
        PERFORM public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'wf-blocked');
        PERFORM pg_temp.ok('publish with blocking issues REJECTED', false);
    EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        PERFORM pg_temp.ok('publish with blocking issues REJECTED: ' || v_msg, true);
    END;

    PERFORM pg_temp.ok('blocked publish created no revision',
        (SELECT count(*) FROM public.business_process_revisions WHERE department_id = v_dept) = v_num);
    PERFORM pg_temp.ok('blocked publish created no publication act',
        (SELECT count(*) FROM public.configuration_publications
         WHERE subject_id = v_dept AND domain_key = 'business_process') = 1);

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('blocked publish left runtime on revision 1',
        v_meta->'lifecycle_builder_v1'->'processes'->0->'stages'->1->>'purpose' IS NULL);

    -- ---------------------------------------------------------------
    -- 7. A valid publish: exactly one revision, one publication act, runtime updated atomically.
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET draft_status = 'validated', validation_errors = '[]'::jsonb, validated_at = now()
    WHERE id = v_draft;

    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'wf-2');
    v_rev2 := (v_res->>'revision_id')::uuid;
    PERFORM pg_temp.ok('publish -> revision 2', (v_res->>'revision_number')::int = 2);
    PERFORM pg_temp.ok('exactly two revisions exist',
        (SELECT count(*) FROM public.business_process_revisions WHERE department_id = v_dept) = 2);
    PERFORM pg_temp.ok('exactly two publication acts exist',
        (SELECT count(*) FROM public.configuration_publications
         WHERE subject_id = v_dept AND domain_key = 'business_process') = 2);

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('runtime projection now carries the draft edit',
        v_meta->'lifecycle_builder_v1'->'processes'->0->'stages'->1->>'purpose' = 'Show families the school');
    PERFORM pg_temp.ok('unknown fields survived load -> save -> publish',
        v_meta->'lifecycle_builder_v1'->>'unknown_builder_key_v1' IS NOT NULL
        AND v_meta->'lifecycle_builder_v1'->'processes'->0->'stages'->0->'row_grain_v1'->>'grain' = 'child');

    -- ---------------------------------------------------------------
    -- 8. THE STALE PUBLICATION CONFLICT.
    --    Editor A is based on revision 2. Someone else publishes revision 3. A tries to publish.
    -- ---------------------------------------------------------------
    -- Editor A's world: still based on revision 2.
    UPDATE public.business_process_drafts
    SET base_revision_id = v_rev2,
        payload = jsonb_set(payload, '{processes,0,stages,1,label}', '"Tour (edited by A)"'),
        draft_revision = draft_revision + 1,
        draft_status = 'validated',
        validated_at = now(),
        validation_errors = '[]'::jsonb
    WHERE id = v_draft;

    -- Someone else publishes revision 3 out from under A.
    INSERT INTO public.business_process_revisions
        (org_id, department_id, revision_number, payload, payload_checksum, published_by)
    VALUES (v_org, v_dept, 3, v_builder, 'wf-3-other', v_actor)
    RETURNING id INTO v_rev1;
    INSERT INTO public.configuration_publications
        (org_id, domain_key, subject_id, revision_id, revision_number, payload_checksum, published_by)
    VALUES (v_org, 'business_process', v_dept, v_rev1, 3, 'wf-3-other', v_actor);

    SELECT count(*) INTO v_num FROM public.business_process_revisions WHERE department_id = v_dept;

    BEGIN
        PERFORM public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'wf-4-from-A');
        PERFORM pg_temp.ok('STALE PUBLICATION BLOCKED', false);
    EXCEPTION WHEN serialization_failure THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        PERFORM pg_temp.ok('STALE PUBLICATION BLOCKED: ' || v_msg, true);
    END;

    PERFORM pg_temp.ok('no revision 4 was created',
        (SELECT count(*) FROM public.business_process_revisions WHERE department_id = v_dept) = v_num);
    PERFORM pg_temp.ok('revision 3 remains the latest publication',
        (SELECT revision_number FROM public.configuration_publications
         WHERE subject_id = v_dept AND domain_key = 'business_process'
         ORDER BY revision_number DESC LIMIT 1) = 3);
    PERFORM pg_temp.ok('A''s unpublished edit is still safely in the draft, not silently rebased',
        (SELECT payload->'processes'->0->'stages'->1->>'label'
         FROM public.business_process_drafts WHERE id = v_draft) = 'Tour (edited by A)');

    -- ---------------------------------------------------------------
    -- 9. Publication history stays immutable and append-only throughout.
    -- ---------------------------------------------------------------
    BEGIN
        UPDATE public.business_process_revisions SET payload_checksum = 'tampered'
        WHERE department_id = v_dept AND revision_number = 2;
        PERFORM pg_temp.ok('revision UPDATE blocked', false);
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.ok('revision UPDATE blocked', true);
    END;

    RAISE NOTICE '--- PUBLICATION WORKFLOW: ALL SCENARIOS PASSED ---';
END $outer$;
