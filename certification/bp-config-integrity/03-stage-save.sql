-- Law 4, editor slice 1 — proof that the MIGRATED stage save survives the guard in `enforce`.
--
-- The vitest suite proves the orchestrator's write shape. What it cannot prove is that the shape
-- is acceptable to Postgres, and that is the question that actually matters: before this slice a
-- stage save issued 4-6 whole-column `UPDATE departments` statements that each changed
-- `lifecycle_builder_v1`, so under `enforce` the first would succeed and the rest would fail —
-- a torn stage. This harness executes the new sequence against the real trigger.
--
-- Run after 00-stubs.sql, both migrations, 01-scenarios.sql and 02-write-guard.sql.
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
    v_payload jsonb;
    v_msg text;
    v_builder jsonb;
BEGIN
    -- The guard defaults to enforce; be explicit so this file proves the end state even if the
    -- database it runs against has been set to `warn` for the rollout.
    PERFORM set_config('alloy.lifecycle_guard', 'enforce', true);

    INSERT INTO auth.users DEFAULT VALUES RETURNING id INTO v_actor;
    INSERT INTO public.orgs (name) VALUES ('Stage Save Org') RETURNING id INTO v_org;

    v_builder := jsonb_build_object(
        'version', 1,
        'active_process_id', 'proc-1',
        'unknown_builder_key_v1', jsonb_build_object('kept', true),
        'processes', jsonb_build_array(jsonb_build_object(
            'id', 'proc-1',
            'key', 'enrollment',
            'name', 'Enrollment',
            'primary_entity', 'opportunity',
            'sort_order', 0,
            'is_active', true,
            'stages', jsonb_build_array(jsonb_build_object(
                'id', 'stage-tour',
                'key', 'tour',
                'label', 'Tour',
                'sort_order', 0,
                'is_active', true,
                'row_grain_v1', jsonb_build_object('grain', 'child')
            ))
        ))
    );

    INSERT INTO public.departments (org_id, key, name, metadata)
    VALUES (v_org, 'enrollment', 'Enrollment',
            jsonb_build_object('lifecycle_progression_requirements_v1', jsonb_build_object('stages', '{}'::jsonb)))
    RETURNING id INTO v_dept;

    INSERT INTO public.business_process_drafts
        (org_id, department_id, payload, draft_status, validated_at)
    VALUES (v_org, v_dept, v_builder, 'validated', now())
    RETURNING id INTO v_draft;

    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'stage-save-1');
    PERFORM pg_temp.ok('setup: published revision 1', (v_res->>'revision_number')::int = 1);

    -- ---------------------------------------------------------------
    -- 1. The draft write. This is the ONE write a stage save makes to configuration.
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET payload = jsonb_set(
            payload,
            '{processes,0,stages,0,stage_operating_plan_v1}',
            jsonb_build_object('version', 1, 'stage_key', 'tour', 'journey_segment', 'family')
        ),
        draft_status = 'draft',
        validation_errors = '[]'::jsonb,
        updated_at = now()
    WHERE id = v_draft;
    PERFORM pg_temp.ok('stage draft write succeeds under enforce', true);

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('draft write did NOT change the runtime projection',
        v_meta->'lifecycle_builder_v1'->'processes'->0->'stages'->0->'stage_operating_plan_v1' IS NULL);

    SELECT payload INTO v_payload FROM public.business_process_drafts WHERE id = v_draft;
    PERFORM pg_temp.ok('unknown fields survived the draft write',
        v_payload->'unknown_builder_key_v1'->>'kept' = 'true'
        AND v_payload->'processes'->0->'stages'->0->'row_grain_v1'->>'grain' = 'child');

    -- ---------------------------------------------------------------
    -- 2. The field-rules COMPANION: a whole-column metadata write that rewrites the identical
    --    builder alongside a changed sibling. This is the shape the guard must permit, and the
    --    reason the trigger compares values rather than counting writes.
    -- ---------------------------------------------------------------
    UPDATE public.departments
    SET metadata = jsonb_build_object(
            'lifecycle_builder_v1', metadata->'lifecycle_builder_v1',
            'lifecycle_progression_requirements_v1', jsonb_build_object('stages', jsonb_build_object('tour', jsonb_build_object('field_rules', '[]'::jsonb))),
            'lifecycle_builder_stage_field_rules_v1', jsonb_build_object('by_stage_key', jsonb_build_object('tour', jsonb_build_object('required_rule_ids', '[]'::jsonb)))
        ),
        updated_at = now()
    WHERE id = v_dept;
    PERFORM pg_temp.ok('companion field-rules write succeeds: identical builder passes the guard', true);

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('companion write preserved the projection byte-for-byte',
        v_meta->'lifecycle_builder_v1' = v_builder);
    PERFORM pg_temp.ok('companion write landed its sibling keys',
        v_meta->'lifecycle_builder_stage_field_rules_v1'->'by_stage_key' ? 'tour');

    -- ---------------------------------------------------------------
    -- 3. The pre-migration shape still fails. If a future edit reintroduces a direct builder
    --    write in the companion, this is what catches it.
    -- ---------------------------------------------------------------
    BEGIN
        UPDATE public.departments
        SET metadata = jsonb_set(
                metadata,
                '{lifecycle_builder_v1,processes,0,stages,0,stage_operating_plan_v1}',
                jsonb_build_object('version', 1, 'stage_key', 'tour', 'journey_segment', 'family')
            )
        WHERE id = v_dept;
        PERFORM pg_temp.ok('un-migrated stage write REJECTED', false);
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        PERFORM pg_temp.ok('un-migrated stage write REJECTED: ' || v_msg, true);
    END;

    -- ---------------------------------------------------------------
    -- 4. Publishing the draft is what finally moves runtime — `publication_required` is literal.
    -- ---------------------------------------------------------------
    UPDATE public.business_process_drafts
    SET draft_status = 'validated', validated_at = now()
    WHERE id = v_draft;

    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'stage-save-2');
    PERFORM pg_temp.ok('publish -> revision 2', (v_res->>'revision_number')::int = 2);

    SELECT metadata INTO v_meta FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('runtime projection now carries the stage edit',
        v_meta->'lifecycle_builder_v1'->'processes'->0->'stages'->0->'stage_operating_plan_v1'->>'stage_key' = 'tour');
    PERFORM pg_temp.ok('publication preserved the unrelated sibling keys',
        v_meta->'lifecycle_builder_stage_field_rules_v1'->'by_stage_key' ? 'tour');
    PERFORM pg_temp.ok('publication preserved unknown fields',
        v_meta->'lifecycle_builder_v1'->'processes'->0->'stages'->0->'row_grain_v1'->>'grain' = 'child');

    RAISE NOTICE '--- STAGE SAVE: ALL SCENARIOS PASSED ---';
END $outer$;
