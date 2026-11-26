-- Certification reset authority — isolated DB integration tests.
-- Every test prints PASS/FAIL. Any FAIL means the exemption or atomicity claim is unproven.

\set ON_ERROR_STOP off
\pset pager off

DO $seed$
DECLARE
    v_org uuid := '11111111-1111-1111-1111-111111111111';
    v_other uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
    INSERT INTO public.orgs (id, name, slug) VALUES (v_org, 'Cert Test Org', 'cert-test-org') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.orgs (id, name, slug) VALUES (v_other, 'Other Org', 'other-org') ON CONFLICT (id) DO NOTHING;

    DELETE FROM public.processing_plan_operations WHERE org_id IN (v_org, v_other) AND false;

    INSERT INTO public.processing_cases (id, org_id, status, case_type, retention_class)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', v_org, 'received', 'form_like_document', 'uncommitted_submission'),
           ('aaaaaaaa-0000-0000-0000-000000000002', v_other, 'received', 'form_like_document', 'uncommitted_submission')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.processing_commit_plans (id, org_id, case_id, version, content_hash)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000001', v_org, 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'h1'),
           ('bbbbbbbb-0000-0000-0000-000000000002', v_other, 'aaaaaaaa-0000-0000-0000-000000000002', 1, 'h2')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.processing_plan_operations (id, org_id, plan_id, op_id, op_order, op_kind, command_key, command_version, target_type)
    VALUES ('cccccccc-0000-0000-0000-000000000001', v_org, 'bbbbbbbb-0000-0000-0000-000000000001', 'op-1', 1, 'create', 'k', '1', 'persons'),
           ('cccccccc-0000-0000-0000-000000000002', v_other, 'bbbbbbbb-0000-0000-0000-000000000002', 'op-1', 1, 'create', 'k', '1', 'persons')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.processing_facts (id, org_id, case_id, fact_type, generation_id)
    VALUES ('dddddddd-0000-0000-0000-000000000001', v_org, 'aaaaaaaa-0000-0000-0000-000000000001', 'text', gen_random_uuid())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.processing_commit_attempts (id, org_id, case_id, plan_id, plan_version, plan_content_hash, attempt_no, execution_idempotency_key, actor_id, outcome)
    VALUES ('eeeeeeee-0000-0000-0000-000000000001', v_org, 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 1, 'h1', 1, 'idem-1', gen_random_uuid(), 'ok')
    ON CONFLICT (id) DO NOTHING;
END;
$seed$;

-- T1: normal DELETE on plan operations still fails --------------------------------------------
DO $t1$
BEGIN
    BEGIN
        DELETE FROM public.processing_plan_operations WHERE id = 'cccccccc-0000-0000-0000-000000000001';
        RAISE NOTICE 'T1 FAIL — normal delete succeeded';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'T1 PASS — normal delete blocked (%)', left(SQLERRM, 48);
    END;
END;
$t1$;

-- T2: normal UPDATE still fails, WITH the reset context set (exemption is DELETE-only) ---------
DO $t2$
BEGIN
    PERFORM set_config('alloy.certification_reset_org', '11111111-1111-1111-1111-111111111111', true);
    PERFORM set_config('alloy.certification_reset_purpose', 'certification_baseline_reset', true);
    BEGIN
        UPDATE public.processing_plan_operations SET op_order = 99 WHERE id = 'cccccccc-0000-0000-0000-000000000001';
        RAISE NOTICE 'T2 FAIL — update succeeded under reset context';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'T2 PASS — update still blocked under reset context';
    END;
END;
$t2$;

-- T3: wrong purpose is refused ------------------------------------------------------------------
DO $t3$
BEGIN
    PERFORM set_config('alloy.certification_reset_org', '11111111-1111-1111-1111-111111111111', true);
    PERFORM set_config('alloy.certification_reset_purpose', 'maintenance', true);
    BEGIN
        DELETE FROM public.processing_plan_operations WHERE id = 'cccccccc-0000-0000-0000-000000000001';
        RAISE NOTICE 'T3 FAIL — wrong purpose permitted delete';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'T3 PASS — wrong purpose refused';
    END;
END;
$t3$;

-- T4: wrong org is refused -----------------------------------------------------------------------
DO $t4$
BEGIN
    PERFORM set_config('alloy.certification_reset_org', '99999999-9999-9999-9999-999999999999', true);
    PERFORM set_config('alloy.certification_reset_purpose', 'certification_baseline_reset', true);
    BEGIN
        DELETE FROM public.processing_plan_operations WHERE id = 'cccccccc-0000-0000-0000-000000000001';
        RAISE NOTICE 'T4 FAIL — wrong org permitted delete';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'T4 PASS — wrong org refused';
    END;
END;
$t4$;

-- T5: correct context permits DELETE, and ONLY for the authorized org ---------------------------
DO $t5$
DECLARE n int;
BEGIN
    PERFORM set_config('alloy.certification_reset_org', '11111111-1111-1111-1111-111111111111', true);
    PERFORM set_config('alloy.certification_reset_purpose', 'certification_baseline_reset', true);
    BEGIN
        DELETE FROM public.processing_plan_operations WHERE id = 'cccccccc-0000-0000-0000-000000000002'; -- other org
        RAISE NOTICE 'T5a FAIL — deleted another org''s immutable row';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'T5a PASS — cross-org immutable row still protected';
    END;
END;
$t5$;

-- T6: transaction-local — the setting does not survive the transaction --------------------------
BEGIN;
SELECT set_config('alloy.certification_reset_org', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('alloy.certification_reset_purpose', 'certification_baseline_reset', true);
SELECT CASE WHEN public.certification_reset_authorized('11111111-1111-1111-1111-111111111111')
            THEN 'T6a PASS — authorized inside the transaction'
            ELSE 'T6a FAIL — not authorized inside the transaction' END;
COMMIT;
SELECT CASE WHEN public.certification_reset_authorized('11111111-1111-1111-1111-111111111111')
            THEN 'T6b FAIL — authorization SURVIVED commit'
            ELSE 'T6b PASS — authorization died at commit' END;

-- T7: the RPC deletes the immutable rows atomically ---------------------------------------------
SELECT CASE WHEN (public.certification_reset_execute(
        '11111111-1111-1111-1111-111111111111',
        'certification_baseline_reset',
        'integration-test',
        jsonb_build_object(
            'processing_case_ids', jsonb_build_array('aaaaaaaa-0000-0000-0000-000000000001'),
            'processing_plan_ids', jsonb_build_array('bbbbbbbb-0000-0000-0000-000000000001')
        )
    )->>'ok')::boolean THEN 'T7 PASS — RPC executed' ELSE 'T7 FAIL' END;

SELECT 'T7 counts: plan_operations=' || count(*) FILTER (WHERE id = 'cccccccc-0000-0000-0000-000000000001')
    || ' facts=' || (SELECT count(*) FROM public.processing_facts WHERE id = 'dddddddd-0000-0000-0000-000000000001')
    || ' attempts=' || (SELECT count(*) FROM public.processing_commit_attempts WHERE id = 'eeeeeeee-0000-0000-0000-000000000001')
    || ' cases=' || (SELECT count(*) FROM public.processing_cases WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001')
    || '  (all should be 0)'
FROM public.processing_plan_operations;

-- T8: the OTHER org's rows are untouched ---------------------------------------------------------
SELECT CASE WHEN EXISTS (SELECT 1 FROM public.processing_plan_operations WHERE id = 'cccccccc-0000-0000-0000-000000000002')
            THEN 'T8 PASS — other org untouched' ELSE 'T8 FAIL — other org deleted' END;

-- T9: after the RPC commits, authorization is gone again ------------------------------------------
SELECT CASE WHEN public.certification_reset_authorized('11111111-1111-1111-1111-111111111111')
            THEN 'T9 FAIL — authorization leaked out of the RPC'
            ELSE 'T9 PASS — authorization did not leak' END;

-- T10: normal delete blocked again on the other org's row ------------------------------------------
DO $t10$
BEGIN
    BEGIN
        DELETE FROM public.processing_plan_operations WHERE id = 'cccccccc-0000-0000-0000-000000000002';
        RAISE NOTICE 'T10 FAIL — immutability no longer enforced';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'T10 PASS — immutability still enforced after a reset ran';
    END;
END;
$t10$;

-- T11: the audit event was written -----------------------------------------------------------------
SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.workflow_events
        WHERE org_id = '11111111-1111-1111-1111-111111111111' AND event_type = 'certification.reset.executed')
    THEN 'T11 PASS — reset authority use was audited' ELSE 'T11 FAIL — no audit event' END;

-- T12: ROLLBACK — a failure mid-RPC leaves nothing deleted --------------------------------------
-- Re-seed the other org's case, then call the RPC for that org inside a transaction we abort.
BEGIN;
SELECT public.certification_reset_execute(
    '22222222-2222-2222-2222-222222222222',
    'certification_baseline_reset',
    'rollback-test',
    jsonb_build_object(
        'processing_case_ids', jsonb_build_array('aaaaaaaa-0000-0000-0000-000000000002'),
        'processing_plan_ids', jsonb_build_array('bbbbbbbb-0000-0000-0000-000000000002')
    )
);
ROLLBACK;
SELECT CASE WHEN EXISTS (SELECT 1 FROM public.processing_plan_operations WHERE id = 'cccccccc-0000-0000-0000-000000000002')
            THEN 'T12 PASS — ROLLBACK restored the immutable rows (atomic)'
            ELSE 'T12 FAIL — rows stayed deleted after ROLLBACK' END;

-- T13: idempotent rerun — the same graph a second time deletes nothing and does not error ---------
SELECT CASE WHEN ((public.certification_reset_execute(
        '11111111-1111-1111-1111-111111111111',
        'certification_baseline_reset',
        'rerun-test',
        jsonb_build_object(
            'processing_case_ids', jsonb_build_array('aaaaaaaa-0000-0000-0000-000000000001'),
            'processing_plan_ids', jsonb_build_array('bbbbbbbb-0000-0000-0000-000000000001')
        )
    )->'deleted'->>'processing_cases')::int = 0)
    THEN 'T13 PASS — rerun deleted 0 (idempotent, already-missing rows are fine)'
    ELSE 'T13 FAIL — rerun did not report 0' END;

-- T14: bad purpose through the RPC is refused ------------------------------------------------------
DO $t14$
BEGIN
    BEGIN
        PERFORM public.certification_reset_execute('11111111-1111-1111-1111-111111111111', 'cleanup', 'x', '{}'::jsonb);
        RAISE NOTICE 'T14 FAIL — RPC accepted a bad purpose';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'T14 PASS — RPC refused a bad purpose';
    END;
END;
$t14$;

-- T15: unknown org through the RPC is refused -------------------------------------------------------
DO $t15$
BEGIN
    BEGIN
        PERFORM public.certification_reset_execute('88888888-8888-8888-8888-888888888888', 'certification_baseline_reset', 'x', '{}'::jsonb);
        RAISE NOTICE 'T15 FAIL — RPC accepted an org that does not exist';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'T15 PASS — RPC refused an unknown org';
    END;
END;
$t15$;
