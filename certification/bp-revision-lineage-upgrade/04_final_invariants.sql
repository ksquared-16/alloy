-- Steps 10-11 — after the full chain, the guarded-write tokens are present and
-- the runtime invariants still hold.
DO $final$
DECLARE
    v_publish text; v_rollback text; v_enabled char; v_idx integer; v_null integer;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_publish FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='publish_business_process_revision_v1';
    SELECT pg_get_functiondef(p.oid) INTO v_rollback FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='rollback_business_process_to_revision_v1';

    IF v_publish IS NULL OR position('begin_lifecycle_projection_write' in v_publish) = 0
                         OR position('end_lifecycle_projection_write' in v_publish) = 0 THEN
        RAISE EXCEPTION 'publish RPC does not acquire AND release the lifecycle projection token';
    END IF;
    RAISE NOTICE 'PASS guarded-write — publish acquires and releases the lifecycle projection token';

    IF v_rollback IS NULL OR position('begin_lifecycle_projection_write' in v_rollback) = 0
                          OR position('end_lifecycle_projection_write' in v_rollback) = 0 THEN
        RAISE EXCEPTION 'rollback RPC does not acquire AND release the lifecycle projection token';
    END IF;
    RAISE NOTICE 'PASS guarded-write — rollback acquires and releases the lifecycle projection token';

    -- The publication identity index 090000 exists to create.
    SELECT count(*) INTO v_idx FROM pg_indexes
     WHERE schemaname='public' AND indexname='business_process_revisions_publication_identity_unique';
    IF v_idx <> 1 THEN
        RAISE EXCEPTION 'publication identity unique index missing after the chain';
    END IF;
    RAISE NOTICE 'PASS chain — publication identity unique index present';

    -- Lineage survived the later migrations unchanged.
    SELECT count(*) INTO v_null FROM public.business_process_revisions WHERE published_from_revision_id IS NULL;
    IF v_null <> 1 THEN
        RAISE EXCEPTION 'lineage changed after the later migrations: % NULL rows', v_null;
    END IF;
    RAISE NOTICE 'PASS chain — lineage unchanged by the later migrations';

    SELECT tgenabled INTO v_enabled FROM pg_trigger
     WHERE tgrelid='public.business_process_revisions'::regclass
       AND tgname='trg_business_process_revisions_immutable';
    IF v_enabled IS NULL OR v_enabled='D' THEN
        RAISE EXCEPTION 'immutability trigger not enabled at end of chain';
    END IF;
    RAISE NOTICE 'PASS chain — immutability trigger enabled at the end of the whole chain';

    BEGIN
        UPDATE public.business_process_revisions SET payload_checksum='tampered' WHERE revision_number=3;
        RAISE EXCEPTION 'CONTROL FAILED: UPDATE succeeded at end of chain';
    EXCEPTION WHEN sqlstate '0A000' THEN
        RAISE NOTICE 'PASS chain — ordinary UPDATE refused at the end of the whole chain';
    END;
END
$final$;
