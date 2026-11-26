-- Documents D7 — the review lifecycle, validity dates and their append-only history hold at the database. Rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated certification environment (certenv-*) carrying the
-- Documents chain through 20261213090000, or locally inside BEGIN … ROLLBACK (certification/invariants/run-d7-local.sh).
-- The invariants seed their own rows in the first organization and RAISE when one fails.
--
-- Covers: first decision; rejection and reopen need a reason; a decided version is re-reviewed only with re-review
-- authority and a reason; only the current version; never an unavailable (quarantined / deleted) document; validity
-- dates on the current version only, never inverted, review untouched; every decision and date change appended to
-- document_version_review_events; the history neither edited nor deleted directly, yet removed by cascade with its
-- document (so a governed teardown leaves no residue); D5's document_set_version_review unchanged; service-role only.
DO $$
DECLARE
    v_org uuid := (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1);
    v_org2 uuid := (SELECT id FROM public.orgs WHERE id <> (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1) ORDER BY id LIMIT 1);
    actor uuid := 'd7000000-0000-4000-8000-0000000000f1';
    d1 uuid := 'd7000000-0000-4000-8000-000000000101';
    d_held uuid := 'd7000000-0000-4000-8000-000000000102';
    d_gone uuid := 'd7000000-0000-4000-8000-000000000103';
    v1 uuid;
    v2 uuid;
    v_held uuid;
    r jsonb;
    n int;
    raised boolean;
    passed int := 0;
BEGIN
    IF v_org IS NULL THEN RAISE EXCEPTION 'd7 invariants: no organization to seed'; END IF;

    INSERT INTO public.documents (id, org_id, entity_type, entity_id, doc_type, title, bucket, storage_path, mime_type, status)
    VALUES (d1, v_org, 'customer', NULL, 'immunization_record', 'D7 invariant', 'org_documents', v_org || '/d7/1.pdf', 'application/pdf', 'uploaded'),
           (d_held, v_org, 'customer', NULL, 'immunization_record', 'D7 held', 'org_documents', v_org || '/d7/2.pdf', 'application/pdf', 'uploaded'),
           (d_gone, v_org, 'customer', NULL, 'immunization_record', 'D7 cascade', 'org_documents', v_org || '/d7/3.pdf', 'application/pdf', 'uploaded');
    SELECT current_version_id INTO v1 FROM public.documents WHERE id = d1;
    SELECT current_version_id INTO v_held FROM public.documents WHERE id = d_held;
    IF v1 IS NULL OR v_held IS NULL THEN RAISE EXCEPTION 'd7 invariants: the D2 insert trigger did not create version 1'; END IF;
    UPDATE public.document_versions SET review_status = 'pending' WHERE id IN (v1, v_held);
    UPDATE public.documents SET status = 'quarantined' WHERE id = d_held;

    -- 1. First decision without re-review authority; a rejection needs a reason.
    raised := false;
    BEGIN PERFORM public.document_review_version(v_org, d1, v1, 'rejected', NULL, actor, false);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_reason_required%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 1: a rejection without a reason was accepted'; END IF;
    r := public.document_review_version(v_org, d1, v1, 'rejected', 'Illegible scan', actor, false);
    IF r->>'review_status' <> 'rejected' OR (SELECT review_status FROM public.document_versions WHERE id = v1) <> 'rejected' THEN
        RAISE EXCEPTION 'd7 invariant 1: the first decision was not recorded';
    END IF;
    passed := passed + 1;

    -- 2. A decided version is not changed without re-review authority, nor without a reason.
    raised := false;
    BEGIN PERFORM public.document_review_version(v_org, d1, v1, 'accepted', 'Second look', actor, false);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_already_decided%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 2: a decided review changed without re-review authority'; END IF;
    raised := false;
    BEGIN PERFORM public.document_review_version(v_org, d1, v1, 'accepted', NULL, actor, true);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_reason_required%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 2: a re-review without a reason was accepted'; END IF;
    r := public.document_review_version(v_org, d1, v1, 'accepted', 'Clear copy confirmed', actor, true);
    IF NOT (r->>'rereview')::boolean OR r->>'previous_review_status' <> 'rejected' THEN RAISE EXCEPTION 'd7 invariant 2: re-review not reported'; END IF;
    passed := passed + 1;

    -- 3. Reopen needs a reason and clears the reviewer; reopening an open review is refused.
    r := public.document_review_version(v_org, d1, v1, 'pending', 'Date of birth mismatch', actor, true);
    IF (SELECT review_status FROM public.document_versions WHERE id = v1) <> 'pending'
       OR (SELECT reviewed_by FROM public.document_versions WHERE id = v1) IS NOT NULL THEN
        RAISE EXCEPTION 'd7 invariant 3: reopen did not return the version to pending';
    END IF;
    raised := false;
    BEGIN PERFORM public.document_review_version(v_org, d1, v1, 'pending', 'Again', actor, true);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_already_pending%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 3: reopening an open review was accepted'; END IF;
    passed := passed + 1;

    -- 4. Every decision is in the history, in order, with its reason and the state it replaced.
    SELECT count(*) INTO n FROM public.document_version_review_events WHERE document_id = d1 AND kind = 'review';
    IF n <> 3 THEN RAISE EXCEPTION 'd7 invariant 4: expected 3 review events, found %', n; END IF;
    IF (SELECT string_agg(decision || ':' || coalesce(previous_review_status, '-'), ',' ORDER BY created_at, id)
          FROM public.document_version_review_events WHERE document_id = d1) NOT IN ('rejected:pending,accepted:rejected,reopened:accepted') THEN
        -- created_at is transaction-stable inside one DO block; order by the decision chain instead.
        IF (SELECT count(*) FROM public.document_version_review_events WHERE document_id = d1
              AND (decision, previous_review_status) IN (('rejected', 'pending'), ('accepted', 'rejected'), ('reopened', 'accepted'))) <> 3 THEN
            RAISE EXCEPTION 'd7 invariant 4: the review chain is not recorded';
        END IF;
    END IF;
    passed := passed + 1;

    -- 5. Only the current version; never an unavailable document; never another organization's.
    v2 := ((public.document_add_version(v_org, d1, 'org_documents', v_org || '/d7/1b.pdf', 'renewal.pdf', 'application/pdf', 10,
                                         repeat('a', 64), 'Renewal from the clinic', actor, '{}'::jsonb, '{}'::jsonb))->>'version_id')::uuid;
    raised := false;
    BEGIN PERFORM public.document_review_version(v_org, d1, v1, 'accepted', NULL, actor, false);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_not_current_version%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 5: a superseded version was reviewed'; END IF;
    raised := false;
    BEGIN PERFORM public.document_review_version(v_org, d_held, v_held, 'accepted', NULL, actor, false);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_document_unavailable%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 5: a quarantined document was reviewed'; END IF;
    IF v_org2 IS NOT NULL THEN
        raised := false;
        BEGIN PERFORM public.document_review_version(v_org2, d1, v2, 'accepted', NULL, actor, false);
        EXCEPTION WHEN no_data_found THEN raised := true; END;
        IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 5: another organization reviewed the document'; END IF;
    END IF;
    IF (SELECT review_status FROM public.document_versions WHERE id = v_held) <> 'pending' THEN RAISE EXCEPTION 'd7 invariant 5: the quarantined version changed'; END IF;
    passed := passed + 1;

    -- 6. Validity dates: current version only, never inverted, never on an unavailable document; review untouched.
    PERFORM public.document_review_version(v_org, d1, v2, 'accepted', NULL, actor, false);
    r := public.document_set_version_validity(v_org, d1, v2, '2026-10-20', '2027-10-19', 'From the renewal', actor);
    IF NOT (r->>'changed')::boolean OR (SELECT expires_on FROM public.document_versions WHERE id = v2) <> '2027-10-19'
       OR (SELECT review_status FROM public.document_versions WHERE id = v2) <> 'accepted' THEN
        RAISE EXCEPTION 'd7 invariant 6: validity dates not recorded, or the review was disturbed';
    END IF;
    r := public.document_set_version_validity(v_org, d1, v2, '2026-10-20', '2027-10-19', 'Same again', actor);
    IF (r->>'changed')::boolean THEN RAISE EXCEPTION 'd7 invariant 6: an unchanged date was recorded again'; END IF;
    raised := false;
    BEGIN PERFORM public.document_set_version_validity(v_org, d1, v2, '2027-01-01', '2026-01-01', NULL, actor);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_validity_range_inverted%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 6: an inverted range was accepted'; END IF;
    raised := false;
    BEGIN PERFORM public.document_set_version_validity(v_org, d1, v1, NULL, '2030-01-01', NULL, actor);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_not_current_version%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 6: a superseded version''s dates were changed'; END IF;
    raised := false;
    BEGIN PERFORM public.document_set_version_validity(v_org, d_held, v_held, NULL, '2030-01-01', NULL, actor);
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_document_unavailable%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 6: a quarantined document''s dates were changed'; END IF;
    IF (SELECT count(*) FROM public.document_version_review_events WHERE document_id = d1 AND kind = 'validity') <> 1 THEN
        RAISE EXCEPTION 'd7 invariant 6: the validity history is not one event';
    END IF;
    passed := passed + 1;

    -- 7. The history is append-only: no direct update, no direct delete.
    raised := false;
    BEGIN UPDATE public.document_version_review_events SET reason = 'rewritten' WHERE document_id = d1;
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_event_immutable%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 7: a review event was edited'; END IF;
    raised := false;
    BEGIN DELETE FROM public.document_version_review_events WHERE document_id = d1;
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_review_event_immutable%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd7 invariant 7: a review event was deleted directly'; END IF;
    passed := passed + 1;

    -- 8. …but it goes by cascade with its document, so a governed teardown leaves no residue.
    PERFORM public.document_review_version(v_org, d_gone, (SELECT current_version_id FROM public.documents WHERE id = d_gone), 'accepted', NULL, actor, false);
    IF (SELECT count(*) FROM public.document_version_review_events WHERE document_id = d_gone) <> 1 THEN RAISE EXCEPTION 'd7 invariant 8: no event to cascade'; END IF;
    DELETE FROM public.documents WHERE id = d_gone;
    IF EXISTS (SELECT 1 FROM public.document_version_review_events WHERE document_id = d_gone) THEN
        RAISE EXCEPTION 'd7 invariant 8: review history outlived its document';
    END IF;
    passed := passed + 1;

    -- 9. D5's filing review writer is unchanged (it still writes review and dates in one call).
    PERFORM public.document_set_version_review(v_org, v2, 'accepted', actor, '2026-10-21', '2027-10-20');
    IF (SELECT effective_on FROM public.document_versions WHERE id = v2) <> '2026-10-21' THEN RAISE EXCEPTION 'd7 invariant 9: document_set_version_review changed'; END IF;
    passed := passed + 1;

    -- 10. Service role only.
    IF has_function_privilege('authenticated', 'public.document_review_version(uuid,uuid,uuid,text,text,uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.document_set_version_validity(uuid,uuid,uuid,date,date,text,uuid)', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.document_version_review_events', 'SELECT')
       OR NOT has_function_privilege('service_role', 'public.document_review_version(uuid,uuid,uuid,text,text,uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'd7 invariant 10: a D7 object is reachable outside the service role';
    END IF;
    passed := passed + 1;

    RAISE NOTICE 'D7 INVARIANTS PASS %/10', passed;
END
$$;
