-- W-20 — the unattached trigger function gets an explicit disposition: dropped.
--
-- `03…§5` records this as an item W-20 gains, and as a finding only a live census could produce:
--
--     "`handle_new_user()` is defined but NOT attached. All 54 triggers on `auth.users` are internal
--      FK constraint triggers; there are zero application triggers. … an unattached trigger function
--      named `handle_new_user` is one migration away from silently restoring the default-to-`ops`
--      escalation path, and no static check would catch it. W-20 must give it an explicit
--      disposition: drop it, or document why it is retained."
--
-- Version control shows the function; it never shows the attachment. That asymmetry is the whole
-- hazard: a reader of `20260329165048_remote_schema.sql` sees a function that appears to run on every
-- new auth user, and a future author who "restores" the trigger to make the code match the schema
-- would re-open an escalation path nobody decided to open.
--
-- **The disposition is DROP, and this is the migration that makes W-20's deletion complete.** The
-- application half — the `user_profiles` / `app_users` fallback in `resolveAdminAccessCore` and its
-- re-implementation in `resolveAdminPortalOrgCore` — is gone in the same change. Leaving a dormant
-- function that writes a default role would mean the code no longer reads those tables while the
-- database still knows how to populate them.
--
-- **Why dropping it is safe to assert rather than merely believed.** `Q15` re-established on the
-- deployed tenant, on 2026-08-19, that the legacy columns confer nothing: `Q15-A1` (principals who
-- would lose all authority) = 0, `Q15-A2` (redundant legacy values) = 0, `Q15-A3` (stale legacy
-- values) = 0. Nothing reads what this function would write, and nothing has written through it.
--
-- Idempotent, and fail-closed rather than merely conditional.

DO $w20$
DECLARE
    attached_count bigint;
    attached_list text;
BEGIN
    -- The premise, checked in the environment being migrated rather than inherited from the census.
    -- `IF EXISTS` alone would make this migration succeed just as quietly on a database where the
    -- function IS attached — dropping a live trigger's function, or being blocked by a dependency
    -- and reported as "already done". The census answered one database; this answers this one.
    SELECT count(*), string_agg(format('%s on %s', t.tgname, c.relname), ', ')
      INTO attached_count, attached_list
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE p.proname = 'handle_new_user'
      AND n.nspname = 'public'
      AND NOT t.tgisinternal;

    IF attached_count > 0 THEN
        RAISE EXCEPTION
            'W-20 aborted: handle_new_user() is ATTACHED in this database (%). The census that '
            'licensed this drop observed it unattached. Re-answer the disposition for this '
            'environment before dropping a function that runs.',
            attached_list;
    END IF;

    -- Unattached and unreferenced: drop it. No CASCADE — a dependency this migration did not
    -- anticipate must surface as an error, not be swept along with it.
    DROP FUNCTION IF EXISTS public.handle_new_user();
END
$w20$;

-- Fail closed: after this runs the function must be gone, so a silently skipped drop cannot be
-- mistaken for a completed one.
DO $verify$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'handle_new_user' AND n.nspname = 'public'
    ) THEN
        RAISE EXCEPTION 'W-20 aborted: public.handle_new_user() still exists after the drop.';
    END IF;
END
$verify$;
