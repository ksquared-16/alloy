-- Documents D6 — document requirements and document-specific waivers hold at the database. Rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated certification environment (certenv-*) carrying
-- migrations 20261208090000, 20261209090000, 20261209090100, 20261209090200, 20261210093500 and 20261212090000, or
-- locally inside BEGIN … ROLLBACK. The invariants seed their own rows in the first organization and RAISE when one
-- fails.
--
-- Covers: draft → validated → published lifecycle; compare-and-swap publish; immutable published versions; governed
-- validate/publish; compatibility with the published Studio type (existence, subject grain); scope / timing / effective
-- range validation; duplicate refusal; waiver policy eligibility, grain, subject resolution, cross-organization refusal,
-- reason, single active waiver, revocation and re-grant; waivers neither deleted nor edited; a waiver never touches a
-- document; published or waived requirements archived, not deleted; the QA fixture purge (a registered QA organization,
-- the named run's `qa_<run>_` key namespace, archived — every refusal leaves every row; the guards' purge bypass is
-- unreachable by a service-role session that sets the setting itself); service-role only.
DO $$
DECLARE
    -- Tenant organizations: never a registered QA organization (the purge must be refused in them).
    v_org uuid := (SELECT id FROM public.orgs WHERE id NOT IN ('4acc9386-c485-486f-aa1f-05d83499d142', 'ad53fee2-2570-460f-9300-f0e106c473b6')
                    ORDER BY created_at NULLS LAST, id LIMIT 1);
    v_org2 uuid := (SELECT id FROM public.orgs WHERE id NOT IN ('4acc9386-c485-486f-aa1f-05d83499d142', 'ad53fee2-2570-460f-9300-f0e106c473b6')
                      AND id <> (SELECT id FROM public.orgs WHERE id NOT IN ('4acc9386-c485-486f-aa1f-05d83499d142', 'ad53fee2-2570-460f-9300-f0e106c473b6')
                                  ORDER BY created_at NULLS LAST, id LIMIT 1) ORDER BY id LIMIT 1);
    h uuid := 'd6000000-0000-4000-8000-0000000000a1';
    h_org2 uuid := 'd6000000-0000-4000-8000-0000000000a2';
    c1 uuid := 'd6000000-0000-4000-8000-0000000000c1';
    c_org2 uuid := 'd6000000-0000-4000-8000-0000000000c2';
    actor uuid := 'd6000000-0000-4000-8000-0000000000f1';
    req uuid := 'd6000000-0000-4000-8000-000000000101';
    req_w uuid := 'd6000000-0000-4000-8000-000000000102';
    req_bad uuid := 'd6000000-0000-4000-8000-000000000103';
    req_dup uuid := 'd6000000-0000-4000-8000-000000000104';
    v1 uuid := 'd6000000-0000-4000-8000-000000000201';
    v2 uuid := 'd6000000-0000-4000-8000-000000000202';
    vw uuid := 'd6000000-0000-4000-8000-000000000203';
    vbad uuid := 'd6000000-0000-4000-8000-000000000204';
    vdup uuid := 'd6000000-0000-4000-8000-000000000205';
    v_qa uuid := '4acc9386-c485-486f-aa1f-05d83499d142';  -- QA Shared (web/lib/qa/sharedQaRegistry.ts)
    h_qa uuid := 'd6000000-0000-4000-8000-0000000000a3';
    c_qa uuid := 'd6000000-0000-4000-8000-0000000000c3';
    req_qa uuid := 'd6000000-0000-4000-8000-000000000105';
    vqa uuid := 'd6000000-0000-4000-8000-000000000206';
    rows_before text;
    w1 uuid;
    r jsonb;
    s text;
    docs_before bigint;
    passes text[] := ARRAY[]::text[];
BEGIN
    IF v_org IS NULL OR v_org2 IS NULL THEN RAISE EXCEPTION 'need two organizations'; END IF;
    PERFORM public.document_configuration_seed(v_org);
    IF NOT EXISTS (SELECT 1 FROM public.document_types t JOIN public.document_type_versions tv ON tv.id = t.published_version_id
                    WHERE t.org_id = v_org AND t.key = 'immunization_record' AND 'child' = ANY (tv.subject_types) AND t.status = 'active') THEN
        RAISE EXCEPTION 'precondition: the seeded immunization_record type is not published for children';
    END IF;

    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (h, v_org, 'D6 household', 996001);
    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (h_org2, v_org2, 'D6 foreign', 996002);
    INSERT INTO public.customer_members (id, org_id, customer_id, display_name) VALUES (c1, v_org, h, 'D6 Child');
    INSERT INTO public.customer_members (id, org_id, customer_id, display_name) VALUES (c_org2, v_org2, h_org2, 'D6 Foreign Child');
    SELECT count(*) INTO docs_before FROM public.documents;

    -- 1. Lifecycle: a draft validates and publishes; a revision supersedes by compare-and-swap.
    INSERT INTO public.document_requirements (id, org_id, key, created_by) VALUES (req, v_org, 'd6_immunization', actor);
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, label, document_type_key, subject_type, created_by)
        VALUES (v1, v_org, req, 1, 'Immunization record on file', 'immunization_record', 'child', actor);
    r := public.document_requirement_validate(v_org, v1, actor);
    IF NOT (r ->> 'valid')::boolean THEN RAISE EXCEPTION '1a: a compatible draft did not validate: %', r; END IF;
    r := public.document_requirement_publish(v_org, req, v1, NULL, actor);
    IF (SELECT published_version_id FROM public.document_requirements WHERE id = req) <> v1 THEN RAISE EXCEPTION '1b: not published'; END IF;
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, label, document_type_key, subject_type, timing, created_by)
        VALUES (v2, v_org, req, 2, 'Immunization record on file (30 days)', 'immunization_record', 'child', '{"kind":"within_days","days":30}', actor);
    PERFORM public.document_requirement_validate(v_org, v2, actor);
    BEGIN
        PERFORM public.document_requirement_publish(v_org, req, v2, NULL, actor);
        RAISE EXCEPTION '1c: a stale publish was accepted';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
    END;
    PERFORM public.document_requirement_publish(v_org, req, v2, v1, actor);
    IF (SELECT status FROM public.document_requirement_versions WHERE id = v1) <> 'superseded'
       OR (SELECT status FROM public.document_requirement_versions WHERE id = v2) <> 'published' THEN
        RAISE EXCEPTION '1d: supersession not recorded';
    END IF;
    passes := passes || 'lifecycle_and_compare_and_swap'::text;

    -- 2. Published versions never change; validation and publication are governed.
    BEGIN
        UPDATE public.document_requirement_versions SET label = 'edited' WHERE id = v2;
        RAISE EXCEPTION '2a: a published version was edited';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.document_requirements SET published_version_id = v1 WHERE id = req;
        RAISE EXCEPTION '2b: the published pointer moved outside publish';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO public.document_requirement_versions (org_id, requirement_id, version_number, status, label, document_type_key, subject_type)
            VALUES (v_org, req, 9, 'validated', 'x', 'immunization_record', 'child');
        RAISE EXCEPTION '2c: a version was created validated';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    passes := passes || 'immutable_and_governed'::text;

    -- 3. Compatibility with the published Studio type, and shape validation.
    INSERT INTO public.document_requirements (id, org_id, key) VALUES (req_bad, v_org, 'd6_bad');
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, label, document_type_key, subject_type, scope, timing, effective_from, effective_until)
        VALUES (vbad, v_org, req_bad, 1, 'Bad', 'immunization_record', 'household', '{"kind":"business_process"}', '{"kind":"within_days","days":0}', '2027-01-01', '2026-01-01');
    r := public.document_requirement_validate(v_org, vbad, actor);
    IF (r ->> 'valid')::boolean THEN RAISE EXCEPTION '3a: an incompatible draft validated'; END IF;
    FOREACH s IN ARRAY ARRAY['subject_type_not_accepted_by_type', 'scope_process_required', 'timing_days_range', 'effective_range_inverted'] LOOP
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'problems') e WHERE e ->> 'code' = s) THEN RAISE EXCEPTION '3b: problem % not reported: %', s, r; END IF;
    END LOOP;
    UPDATE public.document_requirement_versions SET document_type_key = 'no_such_type', subject_type = 'child', scope = '{"kind":"all"}',
           timing = '{"kind":"immediate"}', effective_from = NULL, effective_until = NULL WHERE id = vbad;
    r := public.document_requirement_validate(v_org, vbad, actor);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'problems') e WHERE e ->> 'code' = 'document_type_not_published') THEN
        RAISE EXCEPTION '3c: an unknown type was accepted: %', r;
    END IF;
    BEGIN
        PERFORM public.document_requirement_publish(v_org, req_bad, vbad, NULL, actor);
        RAISE EXCEPTION '3d: an invalid draft published';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    passes := passes || 'type_compatibility_and_shape'::text;

    -- 4. One live definition per (type, grain, scope).
    INSERT INTO public.document_requirements (id, org_id, key) VALUES (req_dup, v_org, 'd6_dup');
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, label, document_type_key, subject_type)
        VALUES (vdup, v_org, req_dup, 1, 'Dup', 'immunization_record', 'child');
    r := public.document_requirement_validate(v_org, vdup, actor);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'problems') e WHERE e ->> 'code' = 'requirement_duplicate') THEN
        RAISE EXCEPTION '4: a duplicate requirement validated: %', r;
    END IF;
    passes := passes || 'duplicate_refused'::text;

    -- 5. Waivers: policy eligibility first.
    BEGIN
        PERFORM public.document_requirement_waiver_grant(v_org, req, 'child', c1, 'Parent declined', NULL, actor);
        RAISE EXCEPTION '5a: a non-waivable requirement was waived';
    EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS s = MESSAGE_TEXT;
        IF s NOT LIKE 'document_requirement_not_waivable%' THEN RAISE EXCEPTION '5a: wrong refusal %', s; END IF;
    END;
    -- A waivable requirement on another (scoped) definition.
    INSERT INTO public.document_requirements (id, org_id, key) VALUES (req_w, v_org, 'd6_waivable');
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, label, document_type_key, subject_type, scope, waivable)
        VALUES (vw, v_org, req_w, 1, 'Waivable', 'immunization_record', 'child', '{"kind":"business_process","process_key":"enrollment_process"}', true);
    PERFORM public.document_requirement_validate(v_org, vw, actor);
    PERFORM public.document_requirement_publish(v_org, req_w, vw, NULL, actor);
    BEGIN
        PERFORM public.document_requirement_waiver_grant(v_org, req_w, 'household', h, 'Wrong grain', NULL, actor);
        RAISE EXCEPTION '5b: a waiver of the wrong grain was granted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        PERFORM public.document_requirement_waiver_grant(v_org, req_w, 'child', c_org2, 'Foreign child', NULL, actor);
        RAISE EXCEPTION '5c: another organization''s subject was waived';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    BEGIN
        PERFORM public.document_requirement_waiver_grant(v_org2, req_w, 'child', c1, 'Foreign org', NULL, actor);
        RAISE EXCEPTION '5d: another organization waived this requirement';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    BEGIN
        PERFORM public.document_requirement_waiver_grant(v_org, req_w, 'child', c1, '  ', NULL, actor);
        RAISE EXCEPTION '5e: a waiver without a reason was granted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    r := public.document_requirement_waiver_grant(v_org, req_w, 'child', c1, 'Medical exemption on file with the director', NULL, actor);
    w1 := (r ->> 'waiver_id')::uuid;
    IF (SELECT requirement_version_id FROM public.document_requirement_waivers WHERE id = w1) <> vw THEN RAISE EXCEPTION '5f: provenance missing'; END IF;
    BEGIN
        PERFORM public.document_requirement_waiver_grant(v_org, req_w, 'child', c1, 'Second', NULL, actor);
        RAISE EXCEPTION '5g: a second active waiver was granted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    passes := passes || 'waiver_eligibility_and_scope'::text;

    -- 6. Waivers change only through the functions; never edited, never deleted.
    BEGIN
        INSERT INTO public.document_requirement_waivers (org_id, requirement_id, requirement_version_id, subject_type, subject_id, reason, granted_by)
            VALUES (v_org, req_w, vw, 'child', c1, 'direct', actor);
        RAISE EXCEPTION '6a: a direct waiver insert was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        UPDATE public.document_requirement_waivers SET reason = 'rewritten' WHERE id = w1;
        RAISE EXCEPTION '6b: a waiver was edited';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        DELETE FROM public.document_requirement_waivers WHERE id = w1;
        RAISE EXCEPTION '6c: a waiver was deleted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    passes := passes || 'waiver_history_governed'::text;

    -- 7. Revocation, double revocation refused, re-grant allowed; the history is kept.
    BEGIN
        PERFORM public.document_requirement_waiver_revoke(v_org, w1, '', actor);
        RAISE EXCEPTION '7a: a revocation without a reason was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    PERFORM public.document_requirement_waiver_revoke(v_org, w1, 'Exemption withdrawn', actor);
    BEGIN
        PERFORM public.document_requirement_waiver_revoke(v_org, w1, 'Again', actor);
        RAISE EXCEPTION '7b: a revoked waiver was revoked again';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        PERFORM public.document_requirement_waiver_revoke(v_org2, w1, 'Foreign revoke', actor);
        RAISE EXCEPTION '7c: another organization revoked the waiver';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    PERFORM public.document_requirement_waiver_grant(v_org, req_w, 'child', c1, 'Re-granted after review', NULL, actor);
    IF (SELECT count(*) FROM public.document_requirement_waivers WHERE requirement_id = req_w AND subject_id = c1) <> 2 THEN
        RAISE EXCEPTION '7d: history not kept';
    END IF;
    passes := passes || 'revocation_and_history'::text;

    -- 8. A waiver never touches a document (no placeholder row, no status change).
    IF (SELECT count(*) FROM public.documents) <> docs_before THEN RAISE EXCEPTION '8: documents changed'; END IF;
    passes := passes || 'waiver_touches_no_document'::text;

    -- 9. A published or waived requirement is archived, never deleted; archived requirements are not waived.
    BEGIN
        DELETE FROM public.document_requirements WHERE id = req;
        RAISE EXCEPTION '9a: a published requirement was deleted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE public.document_requirements SET status = 'archived', archived_by = actor WHERE id = req_w;
    BEGIN
        PERFORM public.document_requirement_waiver_grant(v_org, req_w, 'child', c1, 'After archive', NULL, actor);
        RAISE EXCEPTION '9b: an archived requirement was waived';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    DELETE FROM public.document_requirements WHERE id = req_dup;  -- never published, never waived: deletable
    passes := passes || 'archive_not_delete'::text;

    -- 10. Service-role only.
    IF has_table_privilege('authenticated', 'public.document_requirements', 'SELECT')
       OR has_table_privilege('authenticated', 'public.document_requirement_waivers', 'INSERT')
       OR has_function_privilege('authenticated', 'public.document_requirement_publish(uuid, uuid, uuid, uuid, uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.document_requirement_waiver_revoke(uuid, uuid, text, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '10: a D6 object is reachable by a client role';
    END IF;
    passes := passes || 'service_role_only'::text;

    -- 11. The QA fixture purge: only a registered QA organization's ARCHIVED requirement in the named run's key
    --     namespace, with its versions and waivers; every refusal leaves every row; nothing else.
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_qa) THEN
        INSERT INTO public.orgs (id, name, slug) VALUES (v_qa, 'ZZ Alloy QA', 'zz-alloy-qa');
    END IF;
    PERFORM public.document_configuration_seed(v_qa);
    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (h_qa, v_qa, 'D6 QA household', 996003);
    INSERT INTO public.customer_members (id, org_id, customer_id, display_name) VALUES (c_qa, v_qa, h_qa, 'D6 QA Child');
    -- (a) a tenant's published, waived, ARCHIVED requirement whose key is exactly in the run's namespace
    INSERT INTO public.document_requirements (id, org_id, key) VALUES (req_dup, v_org, 'qa_d6inv0001_tenant');
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, label, document_type_key, subject_type, waivable, scope)
        VALUES (vdup, v_org, req_dup, 1, 'Tenant', 'immunization_record', 'child', true, '{"kind":"business_process","process_key":"qa_fixture_process"}');
    PERFORM public.document_requirement_validate(v_org, vdup, actor);
    PERFORM public.document_requirement_publish(v_org, req_dup, vdup, NULL, actor);
    PERFORM public.document_requirement_waiver_grant(v_org, req_dup, 'child', c1, 'Tenant waiver', NULL, actor);
    UPDATE public.document_requirements SET status = 'archived' WHERE id = req_dup;
    -- (b) the run's own fixture in QA Shared, published and waived, still ACTIVE
    INSERT INTO public.document_requirements (id, org_id, key) VALUES (req_qa, v_qa, 'qa_d6inv0001_fixture');
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, label, document_type_key, subject_type, waivable, scope)
        VALUES (vqa, v_qa, req_qa, 1, 'Fixture', 'immunization_record', 'child', true, '{"kind":"business_process","process_key":"qa_fixture_process"}');
    PERFORM public.document_requirement_validate(v_qa, vqa, actor);
    PERFORM public.document_requirement_publish(v_qa, req_qa, vqa, NULL, actor);
    PERFORM public.document_requirement_waiver_grant(v_qa, req_qa, 'child', c_qa, 'Fixture waiver', NULL, actor);
    rows_before := (SELECT md5(string_agg(t, '|' ORDER BY t)) FROM (
        SELECT 'r' || id || status || key FROM public.document_requirements WHERE id IN (req, req_dup, req_qa)
        UNION ALL SELECT 'v' || id || status FROM public.document_requirement_versions WHERE requirement_id IN (req, req_dup, req_qa)
        UNION ALL SELECT 'w' || id || state FROM public.document_requirement_waivers WHERE requirement_id IN (req, req_dup, req_qa)) x(t));
    BEGIN  -- a tenant org, even with the run's own key namespace
        PERFORM public.document_requirement_purge(v_org, req_dup, 'qar_d6inv0001');
        RAISE EXCEPTION '11a: a tenant requirement was purged';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN  -- a tenant org's real requirement
        PERFORM public.document_requirement_purge(v_org, req, 'qar_d6inv0001');
        RAISE EXCEPTION '11a: a tenant requirement was purged';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN  -- this run's fixture, still active
        PERFORM public.document_requirement_purge(v_qa, req_qa, 'qar_d6inv0001');
        RAISE EXCEPTION '11b: an active fixture requirement was purged';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE public.document_requirements SET status = 'archived' WHERE id = req_qa;
    BEGIN  -- another run
        PERFORM public.document_requirement_purge(v_qa, req_qa, 'qar_d6inv0002');
        RAISE EXCEPTION '11c: another run purged the fixture';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN  -- no run / malformed run
        PERFORM public.document_requirement_purge(v_qa, req_qa, NULL);
        RAISE EXCEPTION '11c: a purge without a QA run succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM public.document_requirement_purge(v_qa, req_qa, 'qa_d6inv0001');
        RAISE EXCEPTION '11c: a malformed QA run id was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN  -- the right run, named through another organization
        PERFORM public.document_requirement_purge(v_org2, req_qa, 'qar_d6inv0001');
        RAISE EXCEPTION '11c: another organization purged the fixture';
    EXCEPTION WHEN insufficient_privilege OR no_data_found THEN NULL;
    END;
    BEGIN  -- a service-role session that sets the purge setting itself still meets every history guard
        SET LOCAL ROLE service_role;
        PERFORM set_config('alloy.document_requirement_purge', 'on', true);
        DELETE FROM public.document_requirement_waivers WHERE requirement_id = req_dup;
        RAISE EXCEPTION '11e: the purge bypass was reachable outside the purge function';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        SET LOCAL ROLE service_role;
        PERFORM set_config('alloy.document_requirement_purge', 'on', true);
        DELETE FROM public.document_requirements WHERE id = req_dup;
        RAISE EXCEPTION '11e: the purge bypass was reachable outside the purge function';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE public.document_requirements SET status = 'active' WHERE id = req_qa;  -- compare with the pre-refusal state
    IF rows_before IS DISTINCT FROM (SELECT md5(string_agg(t, '|' ORDER BY t)) FROM (
        SELECT 'r' || id || status || key FROM public.document_requirements WHERE id IN (req, req_dup, req_qa)
        UNION ALL SELECT 'v' || id || status FROM public.document_requirement_versions WHERE requirement_id IN (req, req_dup, req_qa)
        UNION ALL SELECT 'w' || id || state FROM public.document_requirement_waivers WHERE requirement_id IN (req, req_dup, req_qa)) x(t)) THEN
        RAISE EXCEPTION '11f: a refused purge changed rows';
    END IF;
    UPDATE public.document_requirements SET status = 'archived' WHERE id = req_qa;
    r := public.document_requirement_purge(v_qa, req_qa, 'qar_d6inv0001');
    IF (r ->> 'versions')::int <> 1 OR (r ->> 'waivers')::int <> 1
       OR EXISTS (SELECT 1 FROM public.document_requirements WHERE id = req_qa)
       OR EXISTS (SELECT 1 FROM public.document_requirement_versions WHERE requirement_id = req_qa)
       OR EXISTS (SELECT 1 FROM public.document_requirement_waivers WHERE requirement_id = req_qa) THEN
        RAISE EXCEPTION '11d: the fixture purge left rows: %', r;
    END IF;
    -- The guards are back in force after the purge: real history is still undeletable.
    BEGIN
        DELETE FROM public.document_requirements WHERE id = req;
        RAISE EXCEPTION '11e: the purge setting leaked past the purge';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF NOT EXISTS (SELECT 1 FROM public.document_requirements WHERE id = req_dup)
       OR NOT EXISTS (SELECT 1 FROM public.document_requirement_waivers WHERE requirement_id = req_dup) THEN
        RAISE EXCEPTION '11e: the tenant qa_ requirement lost history';
    END IF;
    IF has_function_privilege('authenticated', 'public.document_requirement_purge(uuid, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.document_requirement_purge(uuid, uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.document_requirement_purge_active()', 'EXECUTE')
       OR to_regprocedure('public.document_requirement_purge(uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION '11g: the purge is reachable by a client role, or an unbound signature survives';
    END IF;
    passes := passes || 'qa_fixture_purge_only'::text;

    RAISE NOTICE 'D6 invariants PASS %/%: %', array_length(passes, 1), 11, array_to_string(passes, ', ');
    IF array_length(passes, 1) <> 11 THEN RAISE EXCEPTION 'D6 invariants incomplete'; END IF;
END;
$$;
