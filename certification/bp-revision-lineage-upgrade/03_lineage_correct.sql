-- Step 5 — lineage values are correct, and step 6 — UPDATE is STILL refused.
DO $after$
DECLARE
    v_null integer; v_set integer; v_wrong integer; v_enabled char;
BEGIN
    SELECT count(*) INTO v_null FROM public.business_process_revisions WHERE published_from_revision_id IS NULL;
    IF v_null <> 1 THEN
        RAISE EXCEPTION 'expected exactly 1 first-revision NULL, found %', v_null;
    END IF;
    RAISE NOTICE 'PASS lineage — exactly 1 first revision left NULL';

    SELECT count(*) INTO v_set FROM public.business_process_revisions WHERE published_from_revision_id IS NOT NULL;
    IF v_set <> 6 THEN
        RAISE EXCEPTION 'expected 6 rows with lineage, found %', v_set;
    END IF;
    RAISE NOTICE 'PASS lineage — 6 rows given lineage (the rows 090000 could not write)';

    -- Every predecessor is the immediately preceding revision of the same subject.
    SELECT count(*) INTO v_wrong
    FROM public.business_process_revisions r
    JOIN public.business_process_revisions p ON p.id = r.published_from_revision_id
    WHERE p.org_id <> r.org_id OR p.department_id <> r.department_id
       OR p.revision_number <> r.revision_number - 1;
    IF v_wrong <> 0 THEN
        RAISE EXCEPTION '% row(s) do not point at revision_number - 1', v_wrong;
    END IF;
    RAISE NOTICE 'PASS lineage — every predecessor is exactly revision_number - 1 of the same subject';

    -- The guard is back on, read from the catalog.
    SELECT tgenabled INTO v_enabled FROM pg_trigger
     WHERE tgrelid = 'public.business_process_revisions'::regclass
       AND tgname = 'trg_business_process_revisions_immutable';
    IF v_enabled IS NULL OR v_enabled = 'D' THEN
        RAISE EXCEPTION 'immutability trigger is missing or DISABLED after migration (tgenabled=%)', coalesce(v_enabled::text,'<absent>');
    END IF;
    RAISE NOTICE 'PASS guard — immutability trigger is enabled in pg_trigger after the migration';

    -- And it actually refuses, not merely marked enabled.
    BEGIN
        UPDATE public.business_process_revisions SET payload_checksum = 'tampered'
        WHERE revision_number = 2;
        RAISE EXCEPTION 'CONTROL FAILED: UPDATE succeeded after migration; immutability was weakened';
    EXCEPTION WHEN sqlstate '0A000' THEN
        RAISE NOTICE 'PASS guard — ordinary UPDATE still refused after the migration';
    END;

    BEGIN
        DELETE FROM public.business_process_revisions WHERE revision_number = 2;
        RAISE EXCEPTION 'CONTROL FAILED: DELETE succeeded after migration';
    EXCEPTION WHEN sqlstate '0A000' THEN
        RAISE NOTICE 'PASS guard — DELETE still refused after the migration';
    END;
END
$after$;
