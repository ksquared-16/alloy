-- D-95 — participant session realizes an Enrollment process_instance. DB certification.
--
-- Every claim the migration makes is made by a trigger or an index, so each is proven by
-- performing the write and requiring the database to accept or refuse it. Source
-- inspection is not evidence.

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.orgs (id, name) VALUES
    ('11111111-1111-4111-8111-111111111111', 'Cert Org A'),
    ('22222222-2222-4222-8222-222222222222', 'Cert Org B');

INSERT INTO public.form_definitions (id, org_id, key, name, kind) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'immunization', 'Immunization', 'center');

INSERT INTO public.form_packet_definitions (id, org_id, key, name) VALUES
    ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'enrollment-packet', 'Enrollment Packet');

INSERT INTO public.form_public_links (id, org_id, form_definition_id, token_hash, is_active) VALUES
    ('88888888-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'h1', true),
    ('88888888-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'h2', true),
    ('88888888-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'h3', true),
    ('88888888-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'h4', true);

-- Two Enrollment journeys in org A, one in org B.
INSERT INTO public.process_instances (id, org_id, process_key, subject_type, subject_id) VALUES
    ('aaaa1111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'enrollment', 'child', '00000000-0000-4000-8000-0000000000c1'),
    ('aaaa1111-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'enrollment', 'child', '00000000-0000-4000-8000-0000000000c2'),
    ('bbbb2222-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'enrollment', 'child', '00000000-0000-4000-8000-0000000000c3');

-- ---------------------------------------------------------------------------
-- A-1. A same-org anchor is accepted, with NO opportunity anywhere in sight.
--      This is the Opportunity-independence proof at the storage layer.
-- ---------------------------------------------------------------------------

INSERT INTO public.form_packet_sessions
    (id, org_id, packet_definition_id, started_via_public_link_id, status, process_instance_id)
VALUES
    ('77777777-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
     'ffffffff-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000001',
     'in_progress', 'aaaa1111-0000-4000-8000-000000000001');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.form_packet_sessions
        WHERE id = '77777777-0000-4000-8000-000000000001'
          AND process_instance_id = 'aaaa1111-0000-4000-8000-000000000001'
          AND crm_snapshot = '{}'::jsonb
    ) THEN
        RAISE EXCEPTION 'A-1 FAILED: same-org anchor not stored, or crm_snapshot was required';
    END IF;
    RAISE NOTICE 'A-1 PASS same-org anchor accepted with an empty crm_snapshot (no Opportunity)';
END $$;

-- ---------------------------------------------------------------------------
-- A-2. The session resolves FROM process_instance identity alone.
-- ---------------------------------------------------------------------------

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM public.form_packet_sessions
     WHERE process_instance_id = 'aaaa1111-0000-4000-8000-000000000001' AND status = 'in_progress';
    IF n <> 1 THEN
        RAISE EXCEPTION 'A-2 FAILED: expected exactly one current session, found %', n;
    END IF;
    RAISE NOTICE 'A-2 PASS session resolves from process_instance identity alone';
END $$;

-- ---------------------------------------------------------------------------
-- A-3. Cross-org anchor refused.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        INSERT INTO public.form_packet_sessions
            (org_id, packet_definition_id, started_via_public_link_id, status, process_instance_id)
        VALUES
            ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001',
             '88888888-0000-4000-8000-000000000002', 'in_progress', 'bbbb2222-0000-4000-8000-000000000001');
        RAISE EXCEPTION 'A-3 FAILED: a cross-org process instance was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'A-3 PASS cross-org anchor refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- A-4. A nonexistent process instance is refused (fails closed).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        INSERT INTO public.form_packet_sessions
            (org_id, packet_definition_id, started_via_public_link_id, status, process_instance_id)
        VALUES
            ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001',
             '88888888-0000-4000-8000-000000000002', 'in_progress', '00000000-0000-4000-8000-00000000dead');
        RAISE EXCEPTION 'A-4 FAILED: a nonexistent process instance was accepted';
    EXCEPTION WHEN foreign_key_violation OR check_violation THEN
        RAISE NOTICE 'A-4 PASS nonexistent process instance refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- A-5. Cardinality: at most ONE non-terminal session per journey.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        INSERT INTO public.form_packet_sessions
            (org_id, packet_definition_id, started_via_public_link_id, status, process_instance_id)
        VALUES
            ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001',
             '88888888-0000-4000-8000-000000000002', 'in_progress', 'aaaa1111-0000-4000-8000-000000000001');
        RAISE EXCEPTION 'A-5 FAILED: a second CURRENT session was accepted for one journey';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'A-5 PASS second concurrent session refused for the same journey';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- A-6. Terminal history accumulates: cancel, then start again.
-- ---------------------------------------------------------------------------

UPDATE public.form_packet_sessions
   SET status = 'cancelled'
 WHERE id = '77777777-0000-4000-8000-000000000001';

INSERT INTO public.form_packet_sessions
    (id, org_id, packet_definition_id, started_via_public_link_id, status, process_instance_id)
VALUES
    ('77777777-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
     'ffffffff-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000002',
     'in_progress', 'aaaa1111-0000-4000-8000-000000000001');

DO $$
DECLARE total int; current int;
BEGIN
    SELECT count(*) INTO total FROM public.form_packet_sessions
     WHERE process_instance_id = 'aaaa1111-0000-4000-8000-000000000001';
    SELECT count(*) INTO current FROM public.form_packet_sessions
     WHERE process_instance_id = 'aaaa1111-0000-4000-8000-000000000001' AND status = 'in_progress';
    IF total <> 2 OR current <> 1 THEN
        RAISE EXCEPTION 'A-6 FAILED: expected 2 total / 1 current, got % / %', total, current;
    END IF;
    RAISE NOTICE 'A-6 PASS terminal sessions accumulate while exactly one stays current';
END $$;

-- ---------------------------------------------------------------------------
-- A-7. The anchor is immutable: no repointing, no clearing.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        UPDATE public.form_packet_sessions
           SET process_instance_id = 'aaaa1111-0000-4000-8000-000000000002'
         WHERE id = '77777777-0000-4000-8000-000000000002';
        RAISE EXCEPTION 'A-7 FAILED: session was repointed to another journey';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'A-7a PASS repointing to another journey refused';
    END;

    BEGIN
        UPDATE public.form_packet_sessions
           SET process_instance_id = NULL
         WHERE id = '77777777-0000-4000-8000-000000000002';
        RAISE EXCEPTION 'A-7 FAILED: anchor was cleared, orphaning participant work';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'A-7b PASS clearing the anchor refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- A-8. FK deletion semantics: a journey with in-flight participant work is protected.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    BEGIN
        DELETE FROM public.process_instances WHERE id = 'aaaa1111-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'A-8 FAILED: deleted a process instance that a session realizes';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'A-8 PASS process instance with participant work cannot be deleted';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- A-9. Historical / non-Enrollment sessions: NULL accepted, and unconstrained by
--      the cardinality rule, so ordinary packet use keeps working.
-- ---------------------------------------------------------------------------

INSERT INTO public.form_packet_sessions
    (id, org_id, packet_definition_id, started_via_public_link_id, status, process_instance_id)
VALUES
    ('77777777-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111',
     'ffffffff-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000003', 'in_progress', NULL),
    ('77777777-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111',
     'ffffffff-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000004', 'in_progress', NULL);

DO $$
BEGIN
    RAISE NOTICE 'A-9 PASS multiple unanchored sessions accepted (non-Enrollment packets unaffected)';
END $$;

-- ---------------------------------------------------------------------------
-- A-10. No lifecycle state was copied onto the session — no second authority.
-- ---------------------------------------------------------------------------

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(column_name, ', ') INTO leaked
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'form_packet_sessions'
       AND column_name IN ('stage_key', 'process_status', 'lifecycle_state', 'current_stage', 'process_stage_key');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'A-10 FAILED: lifecycle state copied onto the session: %', leaked;
    END IF;
    RAISE NOTICE 'A-10 PASS no lifecycle state on the session; process remains sole authority';
END $$;

ROLLBACK;
