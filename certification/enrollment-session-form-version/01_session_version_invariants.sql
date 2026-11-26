-- D-94 — session-pinned participant Form versions. Database certification.
--
-- Eight properties, every one asserted against a real Postgres running the real
-- migrations. Source inspection is not evidence: the immutability and integrity claims
-- are made by triggers, and a trigger that was never fired is a comment.
--
-- Properties 1-4 are about persistence and non-mutation, so they are provable here by
-- performing the writes an application would perform and observing what the database
-- keeps. Properties 5-8 are refusals, and each is proven by attempting the forbidden
-- write and requiring it to raise.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixture: one org, one form with a published version, one packet, one session.
-- ---------------------------------------------------------------------------

INSERT INTO public.orgs (id, name) VALUES
    ('11111111-1111-4111-8111-111111111111', 'Cert Org A'),
    ('22222222-2222-4222-8222-222222222222', 'Cert Org B');

INSERT INTO public.form_definitions (id, org_id, key, name, kind) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'immunization', 'Immunization', 'center'),
    ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'handbook', 'Handbook', 'center'),
    ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'other-org-form', 'Other Org Form', 'center');

-- v1 published: what a parent starting today would resolve.
INSERT INTO public.form_definition_versions (id, org_id, form_definition_id, version_number, status, schema_json, published_at) VALUES
    ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 'published', '{"fields":[]}'::jsonb, now()),
    ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002', 1, 'published', '{"fields":[]}'::jsonb, now()),
    ('eeeeeeee-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-000000000001', 1, 'published', '{"fields":[]}'::jsonb, now());

INSERT INTO public.form_packet_definitions (id, org_id, key, name) VALUES
    ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'enrollment-packet', 'Enrollment Packet');

INSERT INTO public.form_packet_items (id, org_id, packet_definition_id, sequence_index, form_definition_id, pinned_form_definition_version_id) VALUES
    ('99999999-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001', 0, 'aaaaaaaa-0000-4000-8000-000000000001', NULL);

INSERT INTO public.form_public_links (id, org_id, form_definition_id, token_hash, is_active) VALUES
    ('88888888-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'hash-1', true);

INSERT INTO public.form_packet_sessions (id, org_id, packet_definition_id, started_via_public_link_id, status) VALUES
    ('77777777-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000001', 'in_progress');

-- ---------------------------------------------------------------------------
-- 1. A session item carries the version published at realization time.
-- ---------------------------------------------------------------------------

INSERT INTO public.form_packet_session_items
    (id, org_id, packet_session_id, packet_item_id, sequence_index, status, resolved_form_definition_version_id)
VALUES
    ('66666666-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
     '77777777-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000001', 0, 'active',
     'cccccccc-0000-4000-8000-000000000001');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.form_packet_session_items
        WHERE id = '66666666-0000-4000-8000-000000000001'
          AND resolved_form_definition_version_id = 'cccccccc-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'P1 FAILED: session item did not carry the resolved version';
    END IF;
    RAISE NOTICE 'P-1 PASS session item carries the version resolved at realization';
END $$;

-- ---------------------------------------------------------------------------
-- 2. The persisted pin is retained across an unrelated update.
-- ---------------------------------------------------------------------------

UPDATE public.form_packet_session_items
   SET status = 'submitted'
 WHERE id = '66666666-0000-4000-8000-000000000001';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.form_packet_session_items
        WHERE id = '66666666-0000-4000-8000-000000000001'
          AND status = 'submitted'
          AND resolved_form_definition_version_id = 'cccccccc-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'P2 FAILED: pin not retained across an unrelated update';
    END IF;
    RAISE NOTICE 'P-2 PASS pin retained across unrelated updates';
END $$;

-- ---------------------------------------------------------------------------
-- 3. Republishing the form does NOT move an existing session.
--    This is the whole point of D-94.
-- ---------------------------------------------------------------------------

INSERT INTO public.form_definition_versions (id, org_id, form_definition_id, version_number, status, schema_json, published_at) VALUES
    ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 2, 'published', '{"fields":[{"key":"new"}]}'::jsonb, now());

DO $$
DECLARE v uuid;
BEGIN
    SELECT resolved_form_definition_version_id INTO v
      FROM public.form_packet_session_items
     WHERE id = '66666666-0000-4000-8000-000000000001';
    IF v <> 'cccccccc-0000-4000-8000-000000000001' THEN
        RAISE EXCEPTION 'P3 FAILED: republishing moved an active session to %', v;
    END IF;
    RAISE NOTICE 'P-3 PASS republishing did not move the active session';
END $$;

-- ---------------------------------------------------------------------------
-- 4. A session realized AFTER the republish may carry the newer version.
-- ---------------------------------------------------------------------------

INSERT INTO public.form_public_links (id, org_id, form_definition_id, token_hash, is_active) VALUES
    ('88888888-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'hash-2', true);

INSERT INTO public.form_packet_sessions (id, org_id, packet_definition_id, started_via_public_link_id, status) VALUES
    ('77777777-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000002', 'in_progress');

INSERT INTO public.form_packet_session_items
    (id, org_id, packet_session_id, packet_item_id, sequence_index, status, resolved_form_definition_version_id)
VALUES
    ('66666666-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
     '77777777-0000-4000-8000-000000000002', '99999999-0000-4000-8000-000000000001', 0, 'active',
     'cccccccc-0000-4000-8000-000000000002');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.form_packet_session_items
        WHERE id = '66666666-0000-4000-8000-000000000002'
          AND resolved_form_definition_version_id = 'cccccccc-0000-4000-8000-000000000002'
    ) THEN
        RAISE EXCEPTION 'P4 FAILED: a new session could not take the newer published version';
    END IF;
    RAISE NOTICE 'P-4 PASS a new session takes the newer published version';
END $$;

-- ---------------------------------------------------------------------------
-- 5. A version that does not exist is refused (fails closed).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        INSERT INTO public.form_packet_session_items
            (org_id, packet_session_id, packet_item_id, sequence_index, status, resolved_form_definition_version_id)
        VALUES
            ('11111111-1111-4111-8111-111111111111', '77777777-0000-4000-8000-000000000001',
             '99999999-0000-4000-8000-000000000001', 5, 'pending',
             '00000000-0000-4000-8000-00000000dead');
        RAISE EXCEPTION 'P5 FAILED: a nonexistent version was accepted';
    EXCEPTION WHEN foreign_key_violation OR check_violation THEN
        RAISE NOTICE 'P-5 PASS nonexistent version refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Integrity: the version must belong to the same form AND the same org.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    -- Same org, WRONG form: the version belongs to the handbook, the step to immunization.
    BEGIN
        INSERT INTO public.form_packet_session_items
            (org_id, packet_session_id, packet_item_id, sequence_index, status, resolved_form_definition_version_id)
        VALUES
            ('11111111-1111-4111-8111-111111111111', '77777777-0000-4000-8000-000000000001',
             '99999999-0000-4000-8000-000000000001', 6, 'pending',
             'dddddddd-0000-4000-8000-000000000001');
        RAISE EXCEPTION 'P6 FAILED: a version from a DIFFERENT form was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'P-6a PASS cross-form version refused';
    END;

    -- Cross-org.
    BEGIN
        INSERT INTO public.form_packet_session_items
            (org_id, packet_session_id, packet_item_id, sequence_index, status, resolved_form_definition_version_id)
        VALUES
            ('11111111-1111-4111-8111-111111111111', '77777777-0000-4000-8000-000000000001',
             '99999999-0000-4000-8000-000000000001', 7, 'pending',
             'eeeeeeee-0000-4000-8000-000000000001');
        RAISE EXCEPTION 'P6 FAILED: a version from a DIFFERENT org was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'P-6b PASS cross-org version refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Existing packet-definition pin semantics are untouched.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'form_packet_items'
          AND column_name = 'pinned_form_definition_version_id' AND is_nullable = 'YES'
    ) THEN
        RAISE EXCEPTION 'P7 FAILED: definition-level pin column changed shape';
    END IF;

    -- And it still accepts a real pin.
    UPDATE public.form_packet_items
       SET pinned_form_definition_version_id = 'cccccccc-0000-4000-8000-000000000001'
     WHERE id = '99999999-0000-4000-8000-000000000001';

    IF NOT EXISTS (
        SELECT 1 FROM public.form_packet_items
        WHERE id = '99999999-0000-4000-8000-000000000001'
          AND pinned_form_definition_version_id = 'cccccccc-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'P7 FAILED: definition-level pin no longer settable';
    END IF;
    RAISE NOTICE 'P-7 PASS definition-level pin semantics intact';
END $$;

-- ---------------------------------------------------------------------------
-- 8. Once set, the resolved version is IMMUTABLE — neither repointed nor cleared.
--    Proven at the database, because this is a transaction-stability guarantee and
--    application code declining to issue the write proves nothing about the guarantee.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    -- 8a — repoint to another (valid, same-form, same-org) version.
    BEGIN
        UPDATE public.form_packet_session_items
           SET resolved_form_definition_version_id = 'cccccccc-0000-4000-8000-000000000002'
         WHERE id = '66666666-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'P8 FAILED: resolved version was repointed';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'P-8a PASS repointing refused';
    END;

    -- 8b — clear back to NULL, which would silently return the session to floating.
    BEGIN
        UPDATE public.form_packet_session_items
           SET resolved_form_definition_version_id = NULL
         WHERE id = '66666666-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'P8 FAILED: resolved version was cleared to NULL';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'P-8b PASS clearing to NULL refused';
    END;

    -- And the original value survived both attempts.
    IF NOT EXISTS (
        SELECT 1 FROM public.form_packet_session_items
        WHERE id = '66666666-0000-4000-8000-000000000001'
          AND resolved_form_definition_version_id = 'cccccccc-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'P8 FAILED: original resolved version did not survive';
    END IF;
    RAISE NOTICE 'P-8c PASS original resolved version survived both attempts';
END $$;

-- ---------------------------------------------------------------------------
-- Historical rows: NULL remains permitted, so pre-D-94 sessions are not broken and
-- nothing is fabricated about what they rendered.
-- ---------------------------------------------------------------------------

-- Its own session: (packet_session_id, packet_item_id) is unique, so a pre-D-94 row has
-- to model a distinct session rather than a second step of one already asserted on.
INSERT INTO public.form_public_links (id, org_id, form_definition_id, token_hash, is_active) VALUES
    ('88888888-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'hash-hist', true);

INSERT INTO public.form_packet_sessions (id, org_id, packet_definition_id, started_via_public_link_id, status) VALUES
    ('77777777-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001', '88888888-0000-4000-8000-00000000000a', 'in_progress');

INSERT INTO public.form_packet_session_items
    (id, org_id, packet_session_id, packet_item_id, sequence_index, status, resolved_form_definition_version_id)
VALUES
    ('66666666-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111',
     '77777777-0000-4000-8000-00000000000a', '99999999-0000-4000-8000-000000000001', 0, 'pending', NULL);

DO $$
BEGIN
    RAISE NOTICE 'HIST PASS NULL still permitted for pre-D-94 rows';
END $$;

ROLLBACK;
