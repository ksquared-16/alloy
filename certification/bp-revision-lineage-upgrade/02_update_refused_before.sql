-- Step 3 — ordinary UPDATE is refused BEFORE the compatibility migration.
-- Establishes that the guard is real and armed, so a later "still refused"
-- assertion is a preserved property rather than a trigger that never worked.
DO $before$
BEGIN
    BEGIN
        UPDATE public.business_process_revisions SET payload_checksum = 'tampered'
        WHERE revision_number = 2;
        RAISE EXCEPTION 'CONTROL FAILED: UPDATE succeeded before migration; the immutability guard is not armed';
    EXCEPTION WHEN sqlstate '0A000' THEN
        RAISE NOTICE 'PASS pre-migration — ordinary UPDATE refused by the immutability guard';
    END;
END
$before$;
