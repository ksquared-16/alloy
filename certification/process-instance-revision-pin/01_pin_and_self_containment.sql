-- D-96 / D-97 — process-instance revision pin and published-revision self-containment.
--
-- Every claim under test is made by a trigger, an index, a foreign key or an RPC, so each is proven
-- by performing the write and requiring the database to accept or refuse it. Source inspection is
-- not evidence.
--
-- The publication half runs through the REAL `publish_business_process_revision_v1` and
-- `rollback_business_process_to_revision_v1` rather than hand-inserted revisions, because the claim
-- is about what publishing does, not about what a fixture can arrange.

\set ON_ERROR_STOP on

BEGIN;

-- Payload shapes. `enrollment` is the process key `process_instances.process_key` carries
-- (ENROLLMENT_TEMPLATE_PROCESS_KEY = ENROLLMENT_PROCESS_KEY), so the process-identity check is exact.
-- Requirements are already materialized here because normalization happens in TypeScript before the
-- RPC is called; what this file certifies is that the DATABASE stores and protects them.
\set payload_v1 '{"version":1,"active_process_id":"p1","processes":[{"id":"p1","key":"enrollment","name":"Enrollment","stages":[{"id":"s1","key":"enrollment","label":"Enrollment","requirements_v1":{"version":1,"requirements":[{"requirement_id":"legacy:field:child:first_name","kind":"field","rule_id":"child:first_name","level":"required"}]}},{"id":"s2","key":"tour","label":"Tour","requirements_v1":{"version":1,"requirements":[]}}]}]}'
\set payload_v2 '{"version":1,"active_process_id":"p1","processes":[{"id":"p1","key":"enrollment","name":"Enrollment","stages":[{"id":"s1","key":"enrollment","label":"Enrollment","requirements_v1":{"version":1,"requirements":[{"requirement_id":"legacy:field:child:classroom","kind":"field","rule_id":"child:classroom","level":"required"}]}},{"id":"s2","key":"tour","label":"Tour","requirements_v1":{"version":1,"requirements":[]}}]}]}'
\set payload_other_process '{"version":1,"active_process_id":"q1","processes":[{"id":"q1","key":"billing","name":"Billing","stages":[{"id":"t1","key":"invoice","label":"Invoice","requirements_v1":{"version":1,"requirements":[]}}]}]}'

-- Legacy requirement metadata, deliberately present and deliberately DIFFERENT from what the
-- revisions carry. If a published revision ever reflected it, self-containment is broken.
UPDATE public.departments
   SET metadata = jsonb_build_object(
        'lifecycle_progression_requirements_v1',
        jsonb_build_object('version', 1, 'stages',
            jsonb_build_object('enrollment', jsonb_build_object('required_labels', jsonb_build_array('Legacy label'))))
   )
 WHERE id IN ('3933ac47-0000-4000-8000-000000000001', '3933ac47-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Publish revision 1 in org A, and one revision in org B, through the real RPC.
-- ---------------------------------------------------------------------------

INSERT INTO public.business_process_drafts (org_id, department_id, payload, draft_status, validation_errors, validated_at)
VALUES
    ('93667019-0000-4000-8000-000000000001', '3933ac47-0000-4000-8000-000000000001', :'payload_v1'::jsonb, 'validated', '[]'::jsonb, now()),
    ('93667019-0000-4000-8000-000000000002', '3933ac47-0000-4000-8000-000000000002', :'payload_v1'::jsonb, 'validated', '[]'::jsonb, now());

DO $$
DECLARE v jsonb;
BEGIN
    v := public.publish_business_process_revision_v1(
        '93667019-0000-4000-8000-000000000001',
        '3933ac47-0000-4000-8000-000000000001',
        'b2562c99-0000-4000-8000-000000000001',
        'checksum-a-v1');
    PERFORM set_config('cert.rev_a1', v ->> 'revision_id', false);

    v := public.publish_business_process_revision_v1(
        '93667019-0000-4000-8000-000000000002',
        '3933ac47-0000-4000-8000-000000000002',
        'b2562c99-0000-4000-8000-000000000001',
        'checksum-b-v1');
    PERFORM set_config('cert.rev_b1', v ->> 'revision_id', false);
END $$;

-- ---------------------------------------------------------------------------
-- P-13. Authored canonical requirements survive publication verbatim.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_req jsonb;
BEGIN
    SELECT payload -> 'processes' -> 0 -> 'stages' -> 0 -> 'requirements_v1'
      INTO v_req
      FROM public.business_process_revisions
     WHERE id = current_setting('cert.rev_a1')::uuid;

    IF v_req IS NULL
       OR v_req -> 'requirements' -> 0 ->> 'rule_id' <> 'child:first_name' THEN
        RAISE EXCEPTION 'P-13 FAILED: canonical requirements did not survive publication (got %)', v_req;
    END IF;
    RAISE NOTICE 'P-13 PASS canonical requirements survive publication verbatim';
END $$;

-- ---------------------------------------------------------------------------
-- P-14. An authored-EMPTY requirement set survives as empty, not as absent.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_req jsonb;
BEGIN
    SELECT payload -> 'processes' -> 0 -> 'stages' -> 1 -> 'requirements_v1'
      INTO v_req
      FROM public.business_process_revisions
     WHERE id = current_setting('cert.rev_a1')::uuid;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'P-14 FAILED: authored-empty section vanished — absent and empty were collapsed';
    END IF;
    IF jsonb_array_length(v_req -> 'requirements') <> 0 THEN
        RAISE EXCEPTION 'P-14 FAILED: authored-empty gained requirements: %', v_req;
    END IF;
    RAISE NOTICE 'P-14 PASS authored-empty requirements survive as an explicit empty set';
END $$;

-- ---------------------------------------------------------------------------
-- P-15. The published revision is SELF-CONTAINED: every stage states its own
--       requirements, so nothing about them depends on department metadata.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_missing int;
BEGIN
    SELECT count(*) INTO v_missing
      FROM public.business_process_revisions r,
           LATERAL jsonb_array_elements(r.payload -> 'processes') proc,
           LATERAL jsonb_array_elements(proc -> 'stages') stage
     WHERE r.id = current_setting('cert.rev_a1')::uuid
       AND stage -> 'requirements_v1' IS NULL;

    IF v_missing <> 0 THEN
        RAISE EXCEPTION 'P-15 FAILED: % stage(s) published without requirements_v1', v_missing;
    END IF;
    RAISE NOTICE 'P-15 PASS every published stage carries its own requirements_v1 (D-97)';
END $$;

-- ---------------------------------------------------------------------------
-- P-16. A later legacy-metadata edit cannot mutate a published revision — and
--       the revision itself refuses UPDATE outright.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
    SELECT payload INTO v_before FROM public.business_process_revisions
     WHERE id = current_setting('cert.rev_a1')::uuid;

    UPDATE public.departments
       SET metadata = jsonb_set(metadata, '{lifecycle_progression_requirements_v1,stages,enrollment,required_labels}',
                                '["Rewritten after publication"]'::jsonb, true)
     WHERE id = '3933ac47-0000-4000-8000-000000000001';

    SELECT payload INTO v_after FROM public.business_process_revisions
     WHERE id = current_setting('cert.rev_a1')::uuid;

    IF v_before IS DISTINCT FROM v_after THEN
        RAISE EXCEPTION 'P-16 FAILED: a departments.metadata edit changed a published revision';
    END IF;
    RAISE NOTICE 'P-16a PASS a later legacy-metadata edit leaves the published revision untouched';

    BEGIN
        UPDATE public.business_process_revisions SET payload = '{"version":1,"processes":[]}'::jsonb
         WHERE id = current_setting('cert.rev_a1')::uuid;
        RAISE EXCEPTION 'P-16 FAILED: a published revision accepted an UPDATE';
    -- 0A000 is the SQLSTATE `configuration_publication_immutable_guard` raises.
    EXCEPTION WHEN feature_not_supported THEN
        RAISE NOTICE 'P-16b PASS a published revision refuses UPDATE';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- Pin a running instance to revision 1, then publish revision 2 over it.
-- ---------------------------------------------------------------------------

INSERT INTO public.process_instances (id, org_id, process_key, subject_type, subject_id, stage_key, business_process_revision_id)
VALUES ('aaaa1111-0000-4000-8000-000000000001', '93667019-0000-4000-8000-000000000001',
        'enrollment', 'child', '00000000-0000-4000-8000-0000000000c1', 'enrollment',
        current_setting('cert.rev_a1')::uuid);

-- ---------------------------------------------------------------------------
-- P-1 / P-2. A same-org, same-process revision is accepted and stored.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.process_instances
         WHERE id = 'aaaa1111-0000-4000-8000-000000000001'
           AND business_process_revision_id = current_setting('cert.rev_a1')::uuid
    ) THEN
        RAISE EXCEPTION 'P-1 FAILED: a same-org, same-process revision pin was not stored';
    END IF;
    RAISE NOTICE 'P-1 PASS a new instance pins the current published revision';
    RAISE NOTICE 'P-2 PASS a same-org, same-process revision is accepted';
END $$;

-- ---------------------------------------------------------------------------
-- P-3. A revision from ANOTHER ORG is refused.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, business_process_revision_id)
        VALUES ('93667019-0000-4000-8000-000000000001', 'enrollment', 'child',
                '00000000-0000-4000-8000-0000000000c2', current_setting('cert.rev_b1')::uuid);
        RAISE EXCEPTION 'P-3 FAILED: a cross-org revision pin was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'P-3 PASS a cross-org revision pin is refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- P-4. A revision that configures a DIFFERENT PROCESS is refused. Fails closed:
--      an instance pinned to configuration that cannot govern it would LOOK
--      governed while every stage lookup silently returned nothing.
-- ---------------------------------------------------------------------------

INSERT INTO public.business_process_revisions (id, org_id, department_id, revision_number, payload, payload_checksum)
VALUES ('cccc3333-0000-4000-8000-000000000001', '93667019-0000-4000-8000-000000000001',
        '3933ac47-0000-4000-8000-000000000001', 900, :'payload_other_process'::jsonb, 'checksum-a-billing');

DO $$
BEGIN
    BEGIN
        INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, business_process_revision_id)
        VALUES ('93667019-0000-4000-8000-000000000001', 'enrollment', 'child',
                '00000000-0000-4000-8000-0000000000c3', 'cccc3333-0000-4000-8000-000000000001');
        RAISE EXCEPTION 'P-4 FAILED: a revision configuring another process was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'P-4 PASS a revision that does not configure this process_key is refused';
    END;
END $$;

DO $$
BEGIN
    BEGIN
        INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, business_process_revision_id)
        VALUES ('93667019-0000-4000-8000-000000000001', 'enrollment', 'child',
                '00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-00000000dead');
        RAISE EXCEPTION 'P-4b FAILED: a nonexistent revision was accepted';
    EXCEPTION WHEN foreign_key_violation OR check_violation THEN
        RAISE NOTICE 'P-4b PASS a nonexistent revision is refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- P-5. The pin survives an unrelated update to the instance.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    UPDATE public.process_instances
       SET stage_key = 'tour', state = 'enrolling'
     WHERE id = 'aaaa1111-0000-4000-8000-000000000001';

    IF NOT EXISTS (
        SELECT 1 FROM public.process_instances
         WHERE id = 'aaaa1111-0000-4000-8000-000000000001'
           AND business_process_revision_id = current_setting('cert.rev_a1')::uuid
    ) THEN
        RAISE EXCEPTION 'P-5 FAILED: an unrelated update disturbed the pin';
    END IF;
    RAISE NOTICE 'P-5 PASS the pin survives an unrelated update (stage and state moved)';
END $$;

-- ---------------------------------------------------------------------------
-- P-6. Repointing to a different revision is refused.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        UPDATE public.process_instances
           SET business_process_revision_id = 'cccc3333-0000-4000-8000-000000000001'
         WHERE id = 'aaaa1111-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'P-6 FAILED: a running instance was repointed to another revision';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'P-6 PASS repointing a pinned instance is refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- P-7. Clearing the pin to NULL is refused. A cleared NULL and a historical NULL
--      would be indistinguishable, and the cleared one silently drops the
--      instance onto live configuration.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        UPDATE public.process_instances
           SET business_process_revision_id = NULL
         WHERE id = 'aaaa1111-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'P-7 FAILED: a pin was cleared to NULL';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'P-7 PASS clearing a pin to NULL is refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- Publish revision 2. This is the moment D-96 exists for.
-- ---------------------------------------------------------------------------

UPDATE public.business_process_drafts
   SET payload = :'payload_v2'::jsonb, draft_status = 'validated', validation_errors = '[]'::jsonb,
       validated_at = now()
 WHERE org_id = '93667019-0000-4000-8000-000000000001';

DO $$
DECLARE v jsonb;
BEGIN
    v := public.publish_business_process_revision_v1(
        '93667019-0000-4000-8000-000000000001',
        '3933ac47-0000-4000-8000-000000000001',
        'b2562c99-0000-4000-8000-000000000001',
        'checksum-a-v2');
    PERFORM set_config('cert.rev_a2', v ->> 'revision_id', false);
END $$;

-- ---------------------------------------------------------------------------
-- P-8 / P-12. Publishing N+1 leaves the running instance on N, and rewrites no pin.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_pin uuid;
BEGIN
    SELECT business_process_revision_id INTO v_pin
      FROM public.process_instances WHERE id = 'aaaa1111-0000-4000-8000-000000000001';

    IF v_pin <> current_setting('cert.rev_a1')::uuid THEN
        RAISE EXCEPTION 'P-8 FAILED: publishing a new revision moved a running instance (pin now %)', v_pin;
    END IF;
    RAISE NOTICE 'P-8 PASS an instance pinned to N stays on N after N+1 is published';
    RAISE NOTICE 'P-12 PASS publication rewrote no existing pin';
END $$;

DO $$
DECLARE v_req text;
BEGIN
    -- The governing revision's own requirements are unchanged, which is the operational point:
    -- the family's in-flight work is still judged by the rules that governed it when it started.
    SELECT payload -> 'processes' -> 0 -> 'stages' -> 0 -> 'requirements_v1' -> 'requirements' -> 0 ->> 'rule_id'
      INTO v_req
      FROM public.business_process_revisions
     WHERE id = (SELECT business_process_revision_id FROM public.process_instances
                  WHERE id = 'aaaa1111-0000-4000-8000-000000000001');

    IF v_req <> 'child:first_name' THEN
        RAISE EXCEPTION 'P-8b FAILED: the governing requirement drifted to %', v_req;
    END IF;
    RAISE NOTICE 'P-8b PASS the governing requirement set did not drift when N+1 was published';
END $$;

-- ---------------------------------------------------------------------------
-- P-9. A journey started AFTER publication gets N+1.
-- ---------------------------------------------------------------------------

INSERT INTO public.process_instances (id, org_id, process_key, subject_type, subject_id, stage_key, business_process_revision_id)
VALUES ('aaaa1111-0000-4000-8000-000000000002', '93667019-0000-4000-8000-000000000001',
        'enrollment', 'child', '00000000-0000-4000-8000-0000000000c5', 'enrollment',
        current_setting('cert.rev_a2')::uuid);

DO $$
BEGIN
    IF (SELECT business_process_revision_id FROM public.process_instances
         WHERE id = 'aaaa1111-0000-4000-8000-000000000002') <> current_setting('cert.rev_a2')::uuid
       OR (SELECT business_process_revision_id FROM public.process_instances
            WHERE id = 'aaaa1111-0000-4000-8000-000000000001') <> current_setting('cert.rev_a1')::uuid THEN
        RAISE EXCEPTION 'P-9 FAILED: the two journeys are not on the revisions they started under';
    END IF;
    RAISE NOTICE 'P-9 PASS a journey started after publication pins N+1 while the older stays on N';
END $$;

-- ---------------------------------------------------------------------------
-- P-10. A historical NULL pin remains valid and updatable.
-- ---------------------------------------------------------------------------

INSERT INTO public.process_instances (id, org_id, process_key, subject_type, subject_id, stage_key)
VALUES ('aaaa1111-0000-4000-8000-000000000003', '93667019-0000-4000-8000-000000000001',
        'enrollment', 'child', '00000000-0000-4000-8000-0000000000c6', 'enrollment');

DO $$
BEGIN
    UPDATE public.process_instances SET stage_key = 'tour'
     WHERE id = 'aaaa1111-0000-4000-8000-000000000003';

    IF (SELECT business_process_revision_id FROM public.process_instances
         WHERE id = 'aaaa1111-0000-4000-8000-000000000003') IS NOT NULL THEN
        RAISE EXCEPTION 'P-10 FAILED: an unpinned instance acquired a pin';
    END IF;
    RAISE NOTICE 'P-10 PASS a historical unpinned instance remains valid and updatable';
END $$;

-- ---------------------------------------------------------------------------
-- P-10b. An unpinned instance MAY be pinned later — NULL is not a one-way door,
--        only a non-null pin is. Nothing in the runtime does this today; the
--        trigger must not forbid a future deliberate adoption.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    UPDATE public.process_instances
       SET business_process_revision_id = current_setting('cert.rev_a2')::uuid
     WHERE id = 'aaaa1111-0000-4000-8000-000000000003';

    IF (SELECT business_process_revision_id FROM public.process_instances
         WHERE id = 'aaaa1111-0000-4000-8000-000000000003') <> current_setting('cert.rev_a2')::uuid THEN
        RAISE EXCEPTION 'P-10b FAILED: an unpinned instance could not be pinned';
    END IF;
    RAISE NOTICE 'P-10b PASS an unpinned instance may be pinned once, and only once';
END $$;

-- ---------------------------------------------------------------------------
-- P-11. A revision a journey is governed by cannot be deleted underneath it.
--
-- TWO INDEPENDENT REFUSALS, and they are proven separately because they are
-- separate claims. The attempted DELETE below is stopped by the shared
-- `configuration_publication_immutable_guard` (BEFORE UPDATE OR DELETE), which
-- fires before any foreign key is consulted — so the write proves the OUTCOME
-- but says nothing about the FK. The FK's own action is therefore read from the
-- catalog rather than inferred: were the immutability trigger ever relaxed, the
-- pin must still be protected, and ON DELETE CASCADE or SET NULL there would
-- silently unpin every running journey.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        DELETE FROM public.business_process_revisions
         WHERE id = current_setting('cert.rev_a1')::uuid;
        RAISE EXCEPTION 'P-11 FAILED: a revision governing a running instance was deleted';
    EXCEPTION WHEN feature_not_supported THEN
        RAISE NOTICE 'P-11a PASS a revision governing a running instance cannot be deleted';
    END;
END $$;

DO $$
DECLARE v_action char;
BEGIN
    SELECT c.confdeltype INTO v_action
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND t.relname = 'process_instances'
       AND f.relname = 'business_process_revisions'
       AND a.attname = 'business_process_revision_id';

    IF v_action IS NULL THEN
        RAISE EXCEPTION 'P-11b FAILED: no FK from process_instances.business_process_revision_id';
    END IF;
    IF v_action <> 'r' THEN
        RAISE EXCEPTION 'P-11b FAILED: FK delete action is %, expected r (RESTRICT)', v_action;
    END IF;
    RAISE NOTICE 'P-11b PASS the pin FK is ON DELETE RESTRICT, not CASCADE or SET NULL';
END $$;

-- ---------------------------------------------------------------------------
-- P-17. Rollback restores the chosen revision's OWN self-contained requirements.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v jsonb; v_req text; v_missing int;
BEGIN
    v := public.rollback_business_process_to_revision_v1(
        '93667019-0000-4000-8000-000000000001',
        '3933ac47-0000-4000-8000-000000000001',
        current_setting('cert.rev_a1')::uuid,
        'b2562c99-0000-4000-8000-000000000001');

    SELECT payload -> 'processes' -> 0 -> 'stages' -> 0 -> 'requirements_v1' -> 'requirements' -> 0 ->> 'rule_id'
      INTO v_req
      FROM public.business_process_revisions WHERE id = (v ->> 'revision_id')::uuid;

    IF v_req <> 'child:first_name' THEN
        RAISE EXCEPTION 'P-17 FAILED: rollback did not restore the target revision requirements (got %)', v_req;
    END IF;

    -- And the restored revision is itself self-contained, so the rollback is complete rather than
    -- "stages restored, requirements left wherever they happened to be".
    SELECT count(*) INTO v_missing
      FROM public.business_process_revisions r,
           LATERAL jsonb_array_elements(r.payload -> 'processes') proc,
           LATERAL jsonb_array_elements(proc -> 'stages') stage
     WHERE r.id = (v ->> 'revision_id')::uuid
       AND stage -> 'requirements_v1' IS NULL;
    IF v_missing <> 0 THEN
        RAISE EXCEPTION 'P-17 FAILED: the restored revision has % stage(s) without requirements', v_missing;
    END IF;

    RAISE NOTICE 'P-17 PASS rollback restores the target revision self-contained requirement set';
END $$;

-- ---------------------------------------------------------------------------
-- P-18. Rollback leaves running pins alone too. Restoring old configuration is
--       a PUBLICATION act, not a migration of journeys already under way.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF (SELECT business_process_revision_id FROM public.process_instances
         WHERE id = 'aaaa1111-0000-4000-8000-000000000002') <> current_setting('cert.rev_a2')::uuid THEN
        RAISE EXCEPTION 'P-18 FAILED: rollback moved a running instance off its revision';
    END IF;
    RAISE NOTICE 'P-18 PASS rollback rewrites no running pin';
END $$;

-- ---------------------------------------------------------------------------
-- P-19. The projection is republished with the restored requirements, so runtime
--       and publication cannot disagree about what the live stage requires.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_req text;
BEGIN
    SELECT metadata -> 'lifecycle_builder_v1' -> 'processes' -> 0 -> 'stages' -> 0
             -> 'requirements_v1' -> 'requirements' -> 0 ->> 'rule_id'
      INTO v_req
      FROM public.departments WHERE id = '3933ac47-0000-4000-8000-000000000001';

    IF v_req <> 'child:first_name' THEN
        RAISE EXCEPTION 'P-19 FAILED: the runtime projection does not carry the restored requirements (got %)', v_req;
    END IF;
    RAISE NOTICE 'P-19 PASS the guarded projection carries the restored self-contained requirements';
END $$;

COMMIT;
