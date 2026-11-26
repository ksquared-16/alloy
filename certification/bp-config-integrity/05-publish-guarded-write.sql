-- Regression proof for the guarded projection write in the publication RPCs.
--
-- 20260807090000 added publish idempotency by CREATE OR REPLACE and dropped the
-- capability-token calls that 20260730130000 had added, so BOTH publish and
-- rollback were blocked by the platform's own guard from 2026-08-07 onward.
-- 20260810220000 restores them.
--
-- This proves all three properties that must hold together: publishing works,
-- direct writes are still refused, and the token does not survive the RPC.
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
    v_org   uuid;
    v_dept  uuid;
    v_actor uuid;
    v_draft uuid;
    v_res   jsonb;
    v_rev1  uuid;
    v_proj  jsonb;
    v_token text;
    v_msg   text;
BEGIN
    -- auth.users.id has no default in this schema; supply one explicitly.
    INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO v_actor;
    INSERT INTO public.orgs (name, slug) VALUES ('Publish Guard Test Org', 'publish-guard-test-' || substr(gen_random_uuid()::text, 1, 8)) RETURNING id INTO v_org;
    INSERT INTO public.departments (org_id, key, name, metadata)
    VALUES (v_org, 'guarded', 'Guarded',
            jsonb_build_object('lifecycle_builder_v1',
                jsonb_build_object('version', 1, 'processes', '[]'::jsonb)))
    RETURNING id INTO v_dept;

    -- -----------------------------------------------------------------------
    -- 1. The static guarantee: both RPCs still carry the capability token.
    --    A future CREATE OR REPLACE that drops it fails here rather than
    --    silently breaking publication again.
    -- -----------------------------------------------------------------------
    PERFORM pg_temp.ok('publish RPC holds the projection-write token',
        (SELECT pg_get_functiondef(p.oid) LIKE '%lifecycle_projection_write%'
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'publish_business_process_revision_v1'));

    PERFORM pg_temp.ok('rollback RPC holds the projection-write token',
        (SELECT pg_get_functiondef(p.oid) LIKE '%lifecycle_projection_write%'
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'rollback_business_process_to_revision_v1'));

    -- -----------------------------------------------------------------------
    -- 2. Publishing works through the canonical path, with NO escape hatch.
    -- -----------------------------------------------------------------------
    INSERT INTO public.business_process_drafts (org_id, department_id, payload, draft_status)
    VALUES (v_org, v_dept,
            jsonb_build_object('version', 1, 'processes', jsonb_build_array(
                jsonb_build_object('id','p1','key','admissions','name','Admissions',
                                   'primary_entity','customer_members','sort_order',1,'is_active',true,
                                   'stages', jsonb_build_array(
                                       jsonb_build_object('id','s1','key','applied','label','Applied',
                                                          'sort_order',1,'is_active',true))))),
            'draft')
    RETURNING id INTO v_draft;
    -- `business_process_drafts_validation_shape` requires the validation fields to
    -- arrive together with the status, so validate in a second statement.
    UPDATE public.business_process_drafts
       SET draft_status = 'validated', validated_at = now(), validation_errors = '[]'::jsonb
     WHERE id = v_draft;

    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'checksum-1');
    v_rev1 := (v_res->>'revision_id')::uuid;
    PERFORM pg_temp.ok('canonical publish succeeds (no bypass)', v_rev1 IS NOT NULL);
    PERFORM pg_temp.ok('publish reports revision 1', (v_res->>'revision_number')::int = 1);

    -- The runtime projection actually moved — the guard did not silently no-op it.
    SELECT metadata -> 'lifecycle_builder_v1' INTO v_proj FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('runtime projection updated by publish',
        v_proj -> 'processes' -> 0 ->> 'key' = 'admissions');

    -- -----------------------------------------------------------------------
    -- 3. The token must NOT survive the RPC. It is transaction-local, so a token
    --    left set would authorize every later write in this same transaction.
    -- -----------------------------------------------------------------------
    v_token := nullif(current_setting('alloy.lifecycle_write', true), '');
    PERFORM pg_temp.ok('capability token released after publish', v_token IS NULL);

    -- -----------------------------------------------------------------------
    -- 4. Direct writes are STILL refused. Repairing publication must not weaken
    --    the guard that correctly blocked a certification fixture.
    -- -----------------------------------------------------------------------
    BEGIN
        UPDATE public.departments
           SET metadata = jsonb_set(metadata, '{lifecycle_builder_v1}',
                                    jsonb_build_object('version', 1, 'processes', '[]'::jsonb, 'tampered', true))
         WHERE id = v_dept;
        PERFORM pg_temp.ok('direct projection write refused', false);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        PERFORM pg_temp.ok('direct projection write refused',
            v_msg LIKE '%publication-owned%');
    END;

    -- The refusal above aborted only its own subtransaction; the published
    -- projection must be intact.
    SELECT metadata -> 'lifecycle_builder_v1' INTO v_proj FROM public.departments WHERE id = v_dept;
    PERFORM pg_temp.ok('published projection survives the refused tamper',
        v_proj -> 'processes' -> 0 ->> 'key' = 'admissions' AND v_proj ->> 'tampered' IS NULL);

    -- -----------------------------------------------------------------------
    -- 5. Idempotency from 20260807090000 is preserved by the repair.
    -- -----------------------------------------------------------------------
    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, 'checksum-1');
    PERFORM pg_temp.ok('republish with the same checksum is idempotent',
        (v_res->>'revision_id')::uuid = v_rev1);

    RAISE NOTICE 'ALL PUBLISH-GUARD ASSERTIONS PASSED';
    RAISE EXCEPTION 'rollback test transaction' USING ERRCODE = 'query_canceled';
EXCEPTION WHEN query_canceled THEN
    RAISE NOTICE 'test data rolled back';
END $outer$;
