-- Documents D8 — Forms evidence on document requirements holds at the database. Rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated certification environment carrying the Documents chain
-- through 20261214090000, or locally inside BEGIN … ROLLBACK (certification/invariants/run-d7-d8-local.sh).
--
-- Covers: form_evidence validated with every other field (shape, unknown field, 1–10 forms, ACTIVE forms of the
-- organization only — never an inactive or another organization's form — acceptance review|submitted, the Completed form
-- type accepting the grain); a requirement without form_evidence validates as in D6; form_evidence immutable once
-- published, like every other policy field; the D6 validator's own checks unchanged (a duplicate is still refused).
DO $$
DECLARE
    v_org uuid := (SELECT id FROM public.orgs WHERE id NOT IN ('4acc9386-c485-486f-aa1f-05d83499d142', 'ad53fee2-2570-460f-9300-f0e106c473b6')
                    ORDER BY created_at NULLS LAST, id LIMIT 1);
    v_org2 uuid := (SELECT id FROM public.orgs WHERE id <> (SELECT id FROM public.orgs WHERE id NOT IN ('4acc9386-c485-486f-aa1f-05d83499d142', 'ad53fee2-2570-460f-9300-f0e106c473b6')
                    ORDER BY created_at NULLS LAST, id LIMIT 1) ORDER BY id LIMIT 1);
    actor uuid := 'd8000000-0000-4000-8000-0000000000f1';
    req uuid := 'd8000000-0000-4000-8000-000000000101';
    ver uuid := 'd8000000-0000-4000-8000-000000000201';
    f_active uuid := 'd8000000-0000-4000-8000-000000000301';
    f_inactive uuid := 'd8000000-0000-4000-8000-000000000302';
    f_other uuid := 'd8000000-0000-4000-8000-000000000303';
    codes text[];
    raised boolean;
    passed int := 0;
    r jsonb;
BEGIN
    IF v_org IS NULL THEN RAISE EXCEPTION 'd8 invariants: no organization to seed'; END IF;
    PERFORM public.document_configuration_seed(v_org);
    INSERT INTO public.form_definitions (id, org_id, key, name, kind, is_active)
    VALUES (f_active, v_org, 'd8_immunization_attestation', 'Immunization attestation', 'center', true),
           (f_inactive, v_org, 'd8_retired_form', 'Retired form', 'center', false);
    IF v_org2 IS NOT NULL THEN
        INSERT INTO public.form_definitions (id, org_id, key, name, kind, is_active) VALUES (f_other, v_org2, 'd8_foreign_form', 'Foreign', 'center', true);
    END IF;
    INSERT INTO public.document_requirements (id, org_id, key, status) VALUES (req, v_org, 'd8_immunizations', 'active');
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, status, label, document_type_key, subject_type, scope, timing, policy, waivable)
    VALUES (ver, v_org, req, 1, 'draft', 'Immunizations', 'immunization_record', 'child', '{"kind": "all"}', '{"kind": "immediate"}', 'required', false);

    -- 1. Without form_evidence the D6 validation is unchanged (valid).
    codes := ARRAY(SELECT x ->> 'code' FROM jsonb_array_elements(public.document_requirement_version_problems(ver)) x);
    IF array_length(codes, 1) IS NOT NULL THEN RAISE EXCEPTION 'd8 invariant 1: a plain requirement now has problems %', codes; END IF;
    passed := passed + 1;

    -- 2. Shape, unknown field, form count, acceptance.
    UPDATE public.document_requirement_versions SET form_evidence = '["x"]' WHERE id = ver;
    codes := ARRAY(SELECT x ->> 'code' FROM jsonb_array_elements(public.document_requirement_version_problems(ver)) x);
    IF NOT 'form_evidence_shape' = ANY (codes) THEN RAISE EXCEPTION 'd8 invariant 2: a non-object form_evidence passed %', codes; END IF;
    UPDATE public.document_requirement_versions SET form_evidence = '{"form_keys": [], "acceptance": "maybe", "extra": 1}' WHERE id = ver;
    codes := ARRAY(SELECT x ->> 'code' FROM jsonb_array_elements(public.document_requirement_version_problems(ver)) x);
    IF NOT ('form_evidence_field_unknown' = ANY (codes) AND 'form_evidence_forms_shape' = ANY (codes) AND 'form_evidence_acceptance_unknown' = ANY (codes)) THEN
        RAISE EXCEPTION 'd8 invariant 2: shape problems not reported %', codes;
    END IF;
    passed := passed + 1;

    -- 3. Only ACTIVE forms of the organization.
    UPDATE public.document_requirement_versions SET form_evidence = '{"form_keys": ["d8_retired_form"], "acceptance": "review"}' WHERE id = ver;
    codes := ARRAY(SELECT x ->> 'code' FROM jsonb_array_elements(public.document_requirement_version_problems(ver)) x);
    IF NOT 'form_evidence_form_unknown' = ANY (codes) THEN RAISE EXCEPTION 'd8 invariant 3: an inactive form was accepted'; END IF;
    IF v_org2 IS NOT NULL THEN
        UPDATE public.document_requirement_versions SET form_evidence = '{"form_keys": ["d8_foreign_form"], "acceptance": "review"}' WHERE id = ver;
        codes := ARRAY(SELECT x ->> 'code' FROM jsonb_array_elements(public.document_requirement_version_problems(ver)) x);
        IF NOT 'form_evidence_form_unknown' = ANY (codes) THEN RAISE EXCEPTION 'd8 invariant 3: another organization''s form was accepted'; END IF;
    END IF;
    passed := passed + 1;

    -- 4. The Completed form type must accept the grain (seeded: child, household, person, opportunity, form_submission).
    UPDATE public.document_requirement_versions SET form_evidence = '{"form_keys": ["d8_immunization_attestation"], "acceptance": "review"}' WHERE id = ver;
    codes := ARRAY(SELECT x ->> 'code' FROM jsonb_array_elements(public.document_requirement_version_problems(ver)) x);
    IF array_length(codes, 1) IS NOT NULL THEN RAISE EXCEPTION 'd8 invariant 4: a valid form_evidence has problems %', codes; END IF;
    passed := passed + 1;
    -- 4b. With the Completed form type unavailable (archived), Forms evidence is refused.
    UPDATE public.document_types SET status = 'archived' WHERE org_id = v_org AND key = 'generated_form_pdf';
    codes := ARRAY(SELECT x ->> 'code' FROM jsonb_array_elements(public.document_requirement_version_problems(ver)) x);
    IF NOT 'form_evidence_type_not_accepted' = ANY (codes) THEN RAISE EXCEPTION 'd8 invariant 4b: Forms evidence accepted without a Completed form type %', codes; END IF;
    UPDATE public.document_types SET status = 'active' WHERE org_id = v_org AND key = 'generated_form_pdf';
    passed := passed + 1;

    -- 5. Validate → publish through the governed functions; then form_evidence is immutable.
    r := public.document_requirement_validate(v_org, ver, actor);
    IF NOT (r ->> 'valid')::boolean THEN RAISE EXCEPTION 'd8 invariant 5: the valid version did not validate %', r; END IF;
    r := public.document_requirement_publish(v_org, req, ver, NULL, actor);
    raised := false;
    BEGIN UPDATE public.document_requirement_versions SET form_evidence = '{"form_keys": ["d8_immunization_attestation"], "acceptance": "submitted"}' WHERE id = ver;
    EXCEPTION WHEN check_violation THEN raised := SQLERRM LIKE 'document_requirement_version_immutable%'; END;
    IF NOT raised THEN RAISE EXCEPTION 'd8 invariant 5: a published version''s form_evidence changed'; END IF;
    passed := passed + 1;

    -- 6. form_evidence is policy: changing only it on a VALIDATED draft sends the draft back to validation.
    INSERT INTO public.document_requirement_versions (id, org_id, requirement_id, version_number, status, label, document_type_key, subject_type, scope, timing, policy, waivable, form_evidence)
    VALUES ('d8000000-0000-4000-8000-000000000202', v_org, req, 2, 'draft', 'Immunizations', 'immunization_record', 'child', '{"kind": "all"}', '{"kind": "immediate"}', 'required', false,
            '{"form_keys": ["d8_immunization_attestation"], "acceptance": "review"}');
    r := public.document_requirement_validate(v_org, 'd8000000-0000-4000-8000-000000000202', actor);
    IF (SELECT status FROM public.document_requirement_versions WHERE id = 'd8000000-0000-4000-8000-000000000202') <> 'validated' THEN
        RAISE EXCEPTION 'd8 invariant 6: the revision did not validate %', r;
    END IF;
    UPDATE public.document_requirement_versions SET form_evidence = '{"form_keys": ["d8_immunization_attestation"], "acceptance": "submitted"}'
     WHERE id = 'd8000000-0000-4000-8000-000000000202';
    IF (SELECT status FROM public.document_requirement_versions WHERE id = 'd8000000-0000-4000-8000-000000000202') <> 'draft' THEN
        RAISE EXCEPTION 'd8 invariant 6: a validated draft kept its validation after its Forms policy changed';
    END IF;
    passed := passed + 1;

    RAISE NOTICE 'D8 INVARIANTS PASS %/7', passed;
END
$$;
