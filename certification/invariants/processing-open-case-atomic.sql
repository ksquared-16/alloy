-- Processing — open_processing_case_with_primary_source, rollback-only invariant. PREPARED, NOT RUN.
-- For database.run_rollback_invariant_test against an isolated certification environment (certenv-*) AFTER
-- the migration 20261215093000_processing_open_case_atomic.sql is applied there. Until its apply is approved it is held
-- out of supabase/migrations, byte for byte, at certification/documents-v1/pending-migrations/20261215093000_processing_open_case_atomic.sql. The executor owns the transaction
-- and always discards it. Any failed invariant RAISEs.
--
-- Covers the single-session half of the proof: create, idempotent repeat, tenancy and client reachability. The
-- CONCURRENT half (two sessions racing on one source; the loser's case rolled back by the savepoint) cannot be shown in
-- one transaction and needs a two-session test on the same isolated database — still awaiting DB proof.
DO $$
DECLARE
    o1 uuid := gen_random_uuid();
    o2 uuid := gen_random_uuid();
    src uuid := gen_random_uuid();
    a record;
    b record;
    c record;
BEGIN
    INSERT INTO public.orgs (id, name, slug) VALUES (o1, 'ZZ atomic open A', 'zz-atomic-open-a-' || left(o1::text, 8)),
                                                    (o2, 'ZZ atomic open B', 'zz-atomic-open-b-' || left(o2::text, 8));

    -- CASE 1: first open creates exactly one case and one primary source, in the caller's organization.
    SELECT * INTO a FROM public.open_processing_case_with_primary_source(o1, 'upload', src, NULL);
    IF a.created IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 1 FAILED: not created'; END IF;
    IF (SELECT count(*) FROM public.processing_cases WHERE org_id = o1) <> 1 THEN RAISE EXCEPTION 'CASE 1 FAILED: case count'; END IF;
    IF (SELECT count(*) FROM public.processing_case_sources WHERE org_id = o1 AND source_id = src AND role = 'primary' AND processing_case_id = a.processing_case_id) <> 1 THEN
        RAISE EXCEPTION 'CASE 1 FAILED: primary source'; END IF;

    -- CASE 2: a repeat is idempotent — same case, nothing written.
    SELECT * INTO b FROM public.open_processing_case_with_primary_source(o1, 'upload', src, NULL);
    IF b.created IS DISTINCT FROM false OR b.processing_case_id <> a.processing_case_id THEN RAISE EXCEPTION 'CASE 2 FAILED: not idempotent'; END IF;
    IF (SELECT count(*) FROM public.processing_cases WHERE org_id = o1) <> 1 THEN RAISE EXCEPTION 'CASE 2 FAILED: duplicate case'; END IF;

    -- CASE 3: the same source id in another organization is a different case; no cross-tenant answer.
    SELECT * INTO c FROM public.open_processing_case_with_primary_source(o2, 'upload', src, NULL);
    IF c.created IS DISTINCT FROM true OR c.processing_case_id = a.processing_case_id THEN RAISE EXCEPTION 'CASE 3 FAILED: tenancy'; END IF;

    -- CASE 4: no orphan anywhere in the two test organizations.
    IF EXISTS (SELECT 1 FROM public.processing_cases pc WHERE pc.org_id IN (o1, o2)
                 AND NOT EXISTS (SELECT 1 FROM public.processing_case_sources s WHERE s.processing_case_id = pc.id)) THEN
        RAISE EXCEPTION 'CASE 4 FAILED: orphan case'; END IF;

    -- CASE 5: clients cannot execute it; the server role can.
    IF has_function_privilege('anon', 'public.open_processing_case_with_primary_source(uuid, text, uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.open_processing_case_with_primary_source(uuid, text, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 5 FAILED: client can execute'; END IF;
    IF NOT has_function_privilege('service_role', 'public.open_processing_case_with_primary_source(uuid, text, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 5 FAILED: service_role cannot execute'; END IF;

    RAISE NOTICE 'PASS open_processing_case_with_primary_source: create, idempotent, tenancy, no orphan, client-unreachable';
END $$;
