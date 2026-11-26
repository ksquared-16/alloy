-- Processing — open a case and its PRIMARY source in ONE transaction (no orphan case on a lost race).
--
-- THE DEFECT. `openProcessingCaseFromSource` (web/lib/pos/processingCase/openProcessingCaseFromSource.ts) did three
-- separate PostgREST calls: find the primary source; INSERT processing_cases; INSERT processing_case_sources. Two
-- concurrent opens of the same source both miss the find, both insert a case, and the loser's source insert hits
-- `uq_pcs_primary_source_once (org_id, source_kind, source_id) WHERE role = 'primary'` — leaving the loser's
-- `processing_cases` row behind with no source: an orphan case, for every source kind (form submissions, packets,
-- uploads, email attachments, imports). Found while wiring D10 (OPWORK_AA660DC9554D_SPRINT_5D62877D85D6).
--
-- THE REPAIR. The case and its primary source are written inside one PL/pgSQL exception block — a savepoint. A unique
-- violation rolls back BOTH inserts of the losing attempt (the database undoes the case; nothing is deleted after the
-- fact), and the function answers with the winner's case. Idempotency, the one-primary rule and tenancy are unchanged:
-- every read and write is bound to `p_org_id`, and the case and source carry the same organization.
--
-- REACHABILITY. Mutating and organization-parameterized, so it is NOT executable by PUBLIC, anon or authenticated
-- (tests/access/orgParameterizedRpcBoundary.test.ts). SECURITY INVOKER: the only caller is the service-role server path
-- (`makeProcessingCaseDbDeps`), which already writes these tables. Until this migration is applied, that caller falls
-- back to the previous sequence (function-not-found only), so deploying the code first changes nothing.

CREATE OR REPLACE FUNCTION public.open_processing_case_with_primary_source(
    p_org_id uuid,
    p_source_kind text,
    p_source_id uuid,
    p_case_type text DEFAULT NULL
)
RETURNS TABLE (processing_case_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
    v_case uuid;
BEGIN
    IF p_org_id IS NULL OR p_source_kind IS NULL OR p_source_id IS NULL THEN
        RAISE EXCEPTION 'open_processing_case_with_primary_source: org, source kind and source id are required'
            USING ERRCODE = '22023';
    END IF;

    -- Idempotent hit: the source is already the primary of a case in this organization.
    SELECT s.processing_case_id INTO v_case
      FROM public.processing_case_sources s
     WHERE s.org_id = p_org_id
       AND s.source_kind = p_source_kind
       AND s.source_id = p_source_id
       AND s.role = 'primary';
    IF v_case IS NOT NULL THEN
        RETURN QUERY SELECT v_case, false;
        RETURN;
    END IF;

    BEGIN
        INSERT INTO public.processing_cases (org_id, status, case_type)
        VALUES (p_org_id, 'received', p_case_type)
        RETURNING id INTO v_case;

        INSERT INTO public.processing_case_sources (org_id, processing_case_id, source_kind, source_id, role)
        VALUES (p_org_id, v_case, p_source_kind, p_source_id, 'primary');

        RETURN QUERY SELECT v_case, true;
        RETURN;
    EXCEPTION WHEN unique_violation THEN
        -- A concurrent open committed first. This block's case insert is already rolled back with it.
        SELECT s.processing_case_id INTO v_case
          FROM public.processing_case_sources s
         WHERE s.org_id = p_org_id
           AND s.source_kind = p_source_kind
           AND s.source_id = p_source_id
           AND s.role = 'primary';
        IF v_case IS NULL THEN
            RAISE;
        END IF;
        RETURN QUERY SELECT v_case, false;
        RETURN;
    END;
END;
$fn$;

COMMENT ON FUNCTION public.open_processing_case_with_primary_source(uuid, text, uuid, text) IS
    'Opens a Processing case and its primary source atomically; a lost race returns the winner''s case and leaves no orphan.';

REVOKE ALL ON FUNCTION public.open_processing_case_with_primary_source(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_processing_case_with_primary_source(uuid, text, uuid, text) FROM anon, authenticated;
GRANT ALL ON FUNCTION public.open_processing_case_with_primary_source(uuid, text, uuid, text) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-APPLY INVARIANT (D10-A1 atomic Processing open). Everything ABOVE this banner is the pending migration
-- certification/documents-v1/pending-migrations/20261215093000_processing_open_case_atomic.sql with ONE substitution:
-- `GRANT EXECUTE ON FUNCTION` is written `GRANT ALL ON FUNCTION` (the only privilege a function has is EXECUTE, so the
-- grant is the same; the rollback runner refuses the bare keyword EXECUTE as dynamic SQL). Everything BELOW is
-- certification/invariants/processing-open-case-atomic.sql, byte for byte. Both are locked by
-- web/tests/documents/preapplyInvariantParity.test.ts. It runs inside the executor's transaction, so the function exists
-- only for these assertions and is discarded with them: nothing is applied. Needs an isolated certenv at staging tip.
-- The two-session race (D10-A2) cannot be shown in one transaction and is not covered here.
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
