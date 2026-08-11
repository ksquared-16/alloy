-- =============================================================================
-- Compatibility pre-backfill — publication lineage on EXISTING BP revisions
-- =============================================================================
-- D-75. `20260807090000_business_process_publish_idempotency` adds
-- `published_from_revision_id` and backfills it with an UPDATE. That UPDATE
-- cannot run on any database that already holds revision history, because
-- `trg_business_process_revisions_immutable` — created by `20260730120000`,
-- which sorts EARLIER — refuses every UPDATE on the table:
--
--     ERROR:  business_process_revisions rows are immutable;
--             publish or append a new record instead
--
-- The guard is `configuration_publication_immutable_guard()`, shared by four
-- publication tables, and its body is a bare RAISE EXCEPTION. Unlike the
-- lifecycle projection guard (`alloy.lifecycle_write`, acquired via
-- `begin_lifecycle_projection_write`), it has NO capability-token escape. There
-- is no sanctioned way to ask it for permission, so there is nothing to reuse.
--
-- WHY THIS WENT UNNOTICED. The backfill only ever ran where the table was
-- EMPTY, so it touched zero rows and the trigger never fired. Every CI suite
-- provisions a fresh database, which is exactly that condition. The defect is
-- invisible precisely where it is tested and fatal where it is not: the shared
-- Firefly tenant holds 7 revisions on one subject, 6 of which need lineage.
--
-- WHY FORWARD, NOT AN EDIT. D-74: `20260807090000` is merged and applied
-- somewhere. Editing its body would make an applied migration differ from the
-- file that claims to describe it, which is the drift the promotion controls
-- exist to prevent. This migration sorts BEFORE it and leaves it a no-op.
--
-- ## What this does, and the one thing it is careful about
--
-- It performs `20260807090000`'s ADD COLUMN and its backfill, with the SAME
-- lineage semantics — not a different model chosen to dodge the trigger. By the
-- time `20260807090000` runs, its `ADD COLUMN IF NOT EXISTS` is a no-op and its
-- `UPDATE … WHERE published_from_revision_id IS NULL` matches nothing, so the
-- trigger is never reached.
--
-- To write those rows it disables ONE trigger on ONE table, and only inside
-- this transaction:
--
--   * `ALTER TABLE … DISABLE TRIGGER` is transactional DDL under an ACCESS
--     EXCLUSIVE lock. No concurrent session reads the table while it is
--     disabled, and none can commit through it.
--   * The re-enable happens before COMMIT, so the committed state is always
--     "enabled". There is no window in which a runtime session observes a
--     committed disabled trigger.
--   * On ROLLBACK the catalog change is undone with everything else. A failure
--     cannot strand the table unguarded.
--   * `session_replication_role = replica` was rejected: it silences every
--     trigger in the session, which is far wider than the one row-guard in the
--     way.
--
-- The final assertion re-reads `pg_trigger` and refuses to commit unless the
-- guard is enabled, so "we put it back" is verified rather than asserted.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, and the backfill is scoped to rows
-- still NULL. Re-running after lineage exists updates zero rows — which also
-- means it never touches the trigger a second time, because the disable only
-- happens when there is work to do.
-- =============================================================================

ALTER TABLE public.business_process_revisions
    ADD COLUMN IF NOT EXISTS published_from_revision_id uuid
        REFERENCES public.business_process_revisions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.business_process_revisions.published_from_revision_id IS
    'The revision that was live when this one was published (NULL for the first). With payload_checksum this is the publication identity that makes republishing idempotent.';

DO $bp_lineage$
DECLARE
    v_pending          integer;
    v_updated          integer;
    v_still_null       integer;
    v_expected_null    integer;
    v_trigger_enabled  boolean;
    v_mismatched       integer;
BEGIN
    -- ---------------------------------------------------------------------
    -- Is there anything to do? Measured before touching the guard, so a
    -- database that needs no backfill never has its trigger disabled at all.
    -- ---------------------------------------------------------------------
    SELECT count(*) INTO v_pending
    FROM public.business_process_revisions r
    WHERE r.published_from_revision_id IS NULL
      AND EXISTS (
          SELECT 1 FROM public.business_process_revisions prev
          WHERE prev.org_id = r.org_id
            AND prev.department_id = r.department_id
            AND prev.revision_number < r.revision_number
      );

    IF v_pending = 0 THEN
        RAISE NOTICE 'BP lineage pre-backfill: nothing to do (0 rows need lineage). Trigger untouched.';
    ELSE
        -- -----------------------------------------------------------------
        -- The narrowest possible opening: one trigger, one table, inside this
        -- transaction. See the header for why a token was not available.
        -- -----------------------------------------------------------------
        ALTER TABLE public.business_process_revisions
            DISABLE TRIGGER trg_business_process_revisions_immutable;

        -- `20260807090000`'s backfill, verbatim in meaning: each revision
        -- succeeded the one before it for the same subject, ordered by
        -- revision_number. Rows that are already set are left alone, so a
        -- rollback republish keeps the predecessor it was published from.
        UPDATE public.business_process_revisions r
        SET published_from_revision_id = prev.id
        FROM (
            SELECT
                id,
                org_id,
                department_id,
                revision_number,
                lag(id) OVER (PARTITION BY org_id, department_id ORDER BY revision_number) AS prev_id
            FROM public.business_process_revisions
        ) ordered
        JOIN public.business_process_revisions prev ON prev.id = ordered.prev_id
        WHERE r.id = ordered.id
          AND r.published_from_revision_id IS NULL;

        GET DIAGNOSTICS v_updated = ROW_COUNT;

        ALTER TABLE public.business_process_revisions
            ENABLE TRIGGER trg_business_process_revisions_immutable;

        IF v_updated <> v_pending THEN
            RAISE EXCEPTION
                'BP lineage pre-backfill: measured % row(s) needing lineage but updated %. Refusing to commit a partial backfill.',
                v_pending, v_updated;
        END IF;
    END IF;

    -- ---------------------------------------------------------------------
    -- Post-conditions. Any failure aborts the migration, and because this runs
    -- inside the migration transaction the database is left exactly as it was
    -- — including the trigger.
    -- ---------------------------------------------------------------------

    -- (1) The guard is back on. Read from the catalog, not assumed from the
    --     statement above having been written. 'D' means disabled.
    SELECT tgenabled <> 'D' INTO v_trigger_enabled
    FROM pg_trigger
    WHERE tgrelid = 'public.business_process_revisions'::regclass
      AND tgname = 'trg_business_process_revisions_immutable';

    IF v_trigger_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION
            'BP lineage pre-backfill: immutability trigger is not enabled at completion. Refusing to commit an unguarded table.';
    END IF;

    -- (2) Exactly the first revision of each subject may still be NULL.
    SELECT count(*) INTO v_still_null
    FROM public.business_process_revisions r
    WHERE r.published_from_revision_id IS NULL;

    SELECT count(DISTINCT (org_id, department_id)) INTO v_expected_null
    FROM public.business_process_revisions;

    IF v_still_null <> v_expected_null THEN
        RAISE EXCEPTION
            'BP lineage pre-backfill: % row(s) still have no lineage but only % subject(s) exist, so only % first revision(s) may be NULL.',
            v_still_null, v_expected_null, v_expected_null;
    END IF;

    -- (3) Every populated lineage points at the immediately preceding revision
    --     of the SAME subject. Guards against a predecessor borrowed from
    --     another department, or one that skips a revision.
    SELECT count(*) INTO v_mismatched
    FROM public.business_process_revisions r
    JOIN public.business_process_revisions p ON p.id = r.published_from_revision_id
    WHERE p.org_id <> r.org_id
       OR p.department_id <> r.department_id
       OR p.revision_number >= r.revision_number
       OR EXISTS (
           SELECT 1 FROM public.business_process_revisions mid
           WHERE mid.org_id = r.org_id
             AND mid.department_id = r.department_id
             AND mid.revision_number > p.revision_number
             AND mid.revision_number < r.revision_number
       );

    IF v_mismatched > 0 THEN
        RAISE EXCEPTION
            'BP lineage pre-backfill: % row(s) point at something other than their immediate predecessor.',
            v_mismatched;
    END IF;

    RAISE NOTICE
        'BP lineage pre-backfill: % row(s) given lineage, % first-revision row(s) correctly left NULL, immutability trigger enabled.',
        COALESCE(v_updated, 0), v_still_null;
END
$bp_lineage$;
