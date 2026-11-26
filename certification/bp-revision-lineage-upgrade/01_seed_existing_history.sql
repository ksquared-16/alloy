-- Representative PRE-EXISTING revision history, shaped like the live tenant.
--
-- This is the whole point of the suite. Every other Trust/BP suite provisions a
-- fresh database, so `20260807090000`'s backfill touches zero rows and its
-- collision with the immutability trigger is invisible. Firefly holds 7
-- revisions on one subject; 6 of them need lineage. This seeds that shape.
--
-- Inserted directly, because the publish RPC being certified does not exist yet
-- at this point in the chain — the rows stand in for history published by the
-- pre-idempotency runtime, which is exactly what a real upgrade meets. INSERT is
-- permitted by the guard; only UPDATE and DELETE are refused.

INSERT INTO public.business_process_revisions
    (id, org_id, department_id, revision_number, payload, payload_checksum, published_by)
SELECT
    ('00000000-0000-4000-8000-00000000000' || n::text)::uuid,
    '93667019-0000-4000-8000-000000000001'::uuid,
    '3933ac47-0000-4000-8000-000000000001'::uuid,
    n,
    jsonb_build_object('lifecycle_builder_v1', jsonb_build_object('rev', n)),
    'checksum-' || n::text,
    'b2562c99-0000-4000-8000-000000000001'::uuid
FROM generate_series(1, 7) AS n;

DO $seed$
DECLARE
    v_rows integer;
    v_need_lineage integer;
BEGIN
    SELECT count(*) INTO v_rows FROM public.business_process_revisions;
    IF v_rows <> 7 THEN
        RAISE EXCEPTION 'fixture: expected 7 seeded revisions, found %', v_rows;
    END IF;

    SELECT count(*) INTO v_need_lineage
    FROM public.business_process_revisions r
    WHERE EXISTS (
        SELECT 1 FROM public.business_process_revisions p
        WHERE p.org_id = r.org_id AND p.department_id = r.department_id
          AND p.revision_number < r.revision_number
    );
    IF v_need_lineage <> 6 THEN
        RAISE EXCEPTION 'fixture: expected 6 rows needing lineage, found %', v_need_lineage;
    END IF;

    RAISE NOTICE 'PASS fixture — 7 pre-existing revisions seeded, 6 need lineage (Firefly''s shape)';
END
$seed$;
