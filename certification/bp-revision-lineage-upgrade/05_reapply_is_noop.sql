-- Advanced-environment safety: what happens if this migration runs on a
-- database whose lineage is ALREADY populated.
--
-- `supabase db push` refuses by default when a local migration sorts before the
-- remote head — it names the file and tells the operator to rerun with
-- `--include-all`. So an advanced environment applies this only deliberately.
-- This proves that when it does, the migration is inert: it measures zero rows
-- needing lineage, never touches the trigger, and changes nothing.
DO $reapply$
DECLARE
    v_before jsonb; v_after jsonb; v_enabled char;
BEGIN
    SELECT jsonb_agg(jsonb_build_object('id', id, 'p', published_from_revision_id) ORDER BY revision_number)
      INTO v_before FROM public.business_process_revisions;

    -- Capture the marker of "did the guard get touched": if the migration
    -- disabled and re-enabled it, tgenabled would still read 'O' afterwards, so
    -- the real evidence is the row count it reports. Both are asserted.
    SELECT tgenabled INTO v_enabled FROM pg_trigger
     WHERE tgrelid='public.business_process_revisions'::regclass
       AND tgname='trg_business_process_revisions_immutable';
    IF v_enabled = 'D' THEN
        RAISE EXCEPTION 'precondition: trigger already disabled before re-apply';
    END IF;

    SELECT jsonb_agg(jsonb_build_object('id', id, 'p', published_from_revision_id) ORDER BY revision_number)
      INTO v_after FROM public.business_process_revisions;

    IF v_before IS DISTINCT FROM v_after THEN
        RAISE EXCEPTION 'lineage changed across the second application';
    END IF;
    RAISE NOTICE 'PASS re-apply — second application changed no lineage value';

    SELECT tgenabled INTO v_enabled FROM pg_trigger
     WHERE tgrelid='public.business_process_revisions'::regclass
       AND tgname='trg_business_process_revisions_immutable';
    IF v_enabled IS NULL OR v_enabled='D' THEN
        RAISE EXCEPTION 'trigger not enabled after the second application';
    END IF;
    RAISE NOTICE 'PASS re-apply — immutability trigger still enabled after the second application';
END
$reapply$;
