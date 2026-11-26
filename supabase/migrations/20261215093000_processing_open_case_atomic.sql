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
GRANT EXECUTE ON FUNCTION public.open_processing_case_with_primary_source(uuid, text, uuid, text) TO service_role;
