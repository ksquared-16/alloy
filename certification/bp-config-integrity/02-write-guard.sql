-- Law 4 completion — proof that publication is the ONLY sanctioned writer of the published
-- business-process projection, and that the guard is narrow enough not to break anything else.
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
    v_bare uuid;
    v_actor uuid;
    v_draft uuid;
    v_rev1 uuid;
    v_res jsonb;
    v_meta jsonb;
    v_msg text;
    v_num integer;
BEGIN
    INSERT INTO auth.users DEFAULT VALUES RETURNING id INTO v_actor;
    INSERT INTO public.orgs (name) VALUES ('Guard Org') RETURNING id INTO v_org;

    -- ---------------------------------------------------------------
    -- Setup: a department with PUBLISHED configuration.
    -- ---------------------------------------------------------------
    INSERT INTO public.departments (org_id, key, name, metadata)
    VALUES (v_org, 'enrollment', 'Enrollment',
            jsonb_build_object('unrelated_key', jsonb_build_object('keep', true)))
    RETURNING id INTO v_dept;

    INSERT INTO public.business_process_drafts
        (org_id, department_id, payload, draft_status, validated_at)
    VALUES (v_org, v_dept,
            jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'mark', 'published'),
            'validated', now())
    RETURNING id INTO v_draft;

    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'sum-1');
    v_rev1 := (v_res->>'revision_id')::uuid;
    PERFORM pg_temp.ok('publish still works with the guard installed',
        (v_res->>'revision_number')::int = 1);

    -- ---------------------------------------------------------------
    -- 1. A direct write to the published projection is REJECTED.
    --    This is the whole point of the slice.
    -- ---------------------------------------------------------------
    BEGIN
        UPDATE public.departments
        SET metadata = jsonb_set(metadata, '{lifecycle_builder_v1}',
                                 jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'mark', 'BYPASS'))
        WHERE id = v_dept;
        PERFORM pg_temp.ok('direct lifecycle projection write REJECTED', false);
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        PERFORM pg_temp.ok('direct lifecycle projection write REJECTED: ' || v_msg, true);
    END;

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('rejected bypass left the projection untouched',
        v_meta->'lifecycle_builder_v1'->>'mark' = 'published');

    -- ---------------------------------------------------------------
    -- 2. A whole-column replace (the applyVerticalBootstrap shape) is REJECTED.
    -- ---------------------------------------------------------------
    BEGIN
        UPDATE public.departments
        SET metadata = jsonb_build_object('onboarding_lane', 'primary', 'audience', 'families')
        WHERE id = v_dept;
        PERFORM pg_temp.ok('bootstrap-style whole-column replace REJECTED', false);
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM pg_temp.ok('bootstrap-style whole-column replace REJECTED', true);
    END;

    -- ---------------------------------------------------------------
    -- 3. Deleting the projection is REJECTED (lifecycleActivationOwned shape).
    -- ---------------------------------------------------------------
    BEGIN
        UPDATE public.departments SET metadata = metadata - 'lifecycle_builder_v1' WHERE id = v_dept;
        PERFORM pg_temp.ok('projection DELETE rejected', false);
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM pg_temp.ok('projection DELETE rejected', true);
    END;

    -- ---------------------------------------------------------------
    -- 4. NARROWNESS — unrelated department metadata still writes freely.
    --    Category-F writers must keep working untouched.
    -- ---------------------------------------------------------------
    UPDATE public.departments
    SET metadata = jsonb_set(metadata, '{lifecycle_activation_v1}', jsonb_build_object('active', true))
    WHERE id = v_dept;
    PERFORM pg_temp.ok('sibling key lifecycle_activation_v1 writes freely', true);

    UPDATE public.departments
    SET metadata = jsonb_set(metadata, '{opportunity_attention_rules}', '[]'::jsonb)
    WHERE id = v_dept;
    PERFORM pg_temp.ok('sibling key opportunity_attention_rules writes freely', true);

    UPDATE public.departments SET name = 'Enrollment Renamed' WHERE id = v_dept;
    PERFORM pg_temp.ok('non-metadata column updates freely', true);

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('published projection survived all sibling writes',
        v_meta->'lifecycle_builder_v1'->>'mark' = 'published');
    PERFORM pg_temp.ok('original unrelated metadata preserved throughout',
        v_meta->'unrelated_key'->>'keep' = 'true');

    -- ---------------------------------------------------------------
    -- 5. INITIALIZATION is allowed — a seed may create configuration that does not exist.
    -- ---------------------------------------------------------------
    INSERT INTO public.departments (org_id, key, name, metadata)
    VALUES (v_org, 'billing', 'Billing', '{}'::jsonb)
    RETURNING id INTO v_bare;

    UPDATE public.departments
    SET metadata = jsonb_set(metadata, '{lifecycle_builder_v1}',
                             jsonb_build_object('version', 1, 'processes', '[]'::jsonb))
    WHERE id = v_bare;
    PERFORM pg_temp.ok('bootstrap MAY initialize absent configuration', true);

    -- ...but having initialized it, it may not then overwrite it.
    BEGIN
        UPDATE public.departments
        SET metadata = jsonb_set(metadata, '{lifecycle_builder_v1}',
                                 jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'mark', 'SECOND'))
        WHERE id = v_bare;
        PERFORM pg_temp.ok('bootstrap may NOT overwrite established configuration', false);
    EXCEPTION WHEN insufficient_privilege THEN
        PERFORM pg_temp.ok('bootstrap may NOT overwrite established configuration', true);
    END;

    -- A department created WITH configuration in the INSERT is fine (nothing to overwrite).
    INSERT INTO public.departments (org_id, key, name, metadata)
    VALUES (v_org, 'compliance', 'Compliance',
            jsonb_build_object('lifecycle_builder_v1', jsonb_build_object('version', 1, 'processes', '[]'::jsonb)));
    PERFORM pg_temp.ok('department may be CREATED with configuration', true);

    -- ---------------------------------------------------------------
    -- 6. The explicit migration/repair escape hatch works, and is scoped to its transaction.
    -- ---------------------------------------------------------------
    PERFORM public.begin_lifecycle_projection_write('migration');
    UPDATE public.departments
    SET metadata = jsonb_set(metadata, '{lifecycle_builder_v1}',
                             jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'mark', 'repaired'))
    WHERE id = v_dept;
    PERFORM pg_temp.ok('explicit migration mode permits a repair write', true);

    BEGIN
        PERFORM public.begin_lifecycle_projection_write('whatever');
        PERFORM pg_temp.ok('invalid write mode rejected', false);
    EXCEPTION WHEN invalid_parameter_value THEN
        PERFORM pg_temp.ok('invalid write mode rejected', true);
    END;

    -- ---------------------------------------------------------------
    -- 7. Rollback still works through the guard.
    -- ---------------------------------------------------------------
    v_res := public.rollback_business_process_to_revision_v1(v_org, v_dept, v_rev1, v_actor);
    PERFORM pg_temp.ok('rollback works through the guard',
        (v_res->>'revision_number')::int = 2);

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('rollback restored the published payload over the repair',
        v_meta->'lifecycle_builder_v1'->>'mark' = 'published');

    -- ---------------------------------------------------------------
    -- 8. Runtime projection agrees with the latest publication.
    -- ---------------------------------------------------------------
    SELECT r.payload INTO v_meta
    FROM public.configuration_publications cp
    JOIN public.business_process_revisions r ON r.id = cp.revision_id
    WHERE cp.org_id = v_org AND cp.domain_key = 'business_process' AND cp.subject_id = v_dept
    ORDER BY cp.revision_number DESC LIMIT 1;

    PERFORM pg_temp.ok('runtime projection == latest publication payload',
        v_meta = (SELECT metadata->'lifecycle_builder_v1' FROM public.departments WHERE id = v_dept));

    -- ---------------------------------------------------------------
    -- 9. A draft may stay incomplete without ever becoming runtime truth.
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET payload = jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'mark', 'INCOMPLETE'),
        draft_status = 'draft',
        validation_errors = '[{"code":"dangling_transition"}]'::jsonb,
        validated_at = NULL
    WHERE id = v_draft;
    PERFORM pg_temp.ok('an invalid draft may be saved', true);

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('invalid draft did NOT become runtime truth',
        v_meta->'lifecycle_builder_v1'->>'mark' = 'published');

    BEGIN
        PERFORM public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'sum-x');
        PERFORM pg_temp.ok('invalid draft cannot publish', false);
    EXCEPTION WHEN check_violation THEN
        PERFORM pg_temp.ok('invalid draft cannot publish', true);
    END;

    SELECT count(*) INTO v_num FROM public.business_process_revisions
    WHERE org_id = v_org AND department_id = v_dept;
    PERFORM pg_temp.ok('no revision created by the refused publish', v_num = 2);

    RAISE NOTICE '--- WRITE GUARD: ALL SCENARIOS PASSED ---';
END
$outer$;
