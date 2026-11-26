-- =============================================================================
-- Retire the W-17 self-test org (ALY-14, owner decisions D5 and D10)
-- =============================================================================
--
-- `20260912010000_w17_additive_role_assignment.sql` runs an in-migration self-test that creates an
-- org (`name` 'W-17 self-test', `slug` '_w17_selftest_<8 hex>', status `active`). It removes its
-- auth user and access profile afterwards, but not the org, so every database built from the chain
-- has it. Later backfills then give it role definitions, grants, document categories and document
-- types, exactly as they do any org.
--
-- It cannot be removed: `document_categories_guard()` refuses to drop a category a document type
-- has used (`document_category_in_use`), and the backfilled types use them
-- (docs/platform/runtime/environments-p4-evidence-2026-11-25/rebuild/w17-removal-trial.txt). So the
-- org is RETIRED, which is the state the release tool accepts for a self-test org.
--
-- What this changes, on every org whose slug starts with `_w17_selftest_`:
--
--   * status -> 'retired'.
--   * name   -> its slug. The release tool lists orgs as id|status|name (`ORGS_SQL`) and recognises
--     a self-test org by `name` starting with `tenancy.selftest_org_name_prefix` ('_w17_selftest_',
--     scripts/release/release-lib.mjs `checkStagingTenancy` and `checkProductionTenantIsolation`).
--     With the self-test's display name 'W-17 self-test' that match never fires: staging
--     verification reports the org as neither Firefly nor a QA fixture, and the production check
--     passes it whatever its status. Giving it its slug as its name makes both checks see the org
--     for what it is. Nothing in the app reads this org's name.
--
-- What it deliberately leaves alone: the org's role definitions, grants, document categories and
-- document types. They are configuration of an org nobody belongs to (the self-test removed its
-- only member), they cannot all be removed (above), and the first-promotion census (briefing §4
-- item 6, §5.6 item 5) counts them as the step-9 baseline, so they must arrive the same way on
-- every database. The assertion below proves the org has no member to use them.
--
-- Forward-only and re-runnable: a database without such an org, or one where it is already
-- retired, is unchanged.
-- =============================================================================

DO $w17_retire$
DECLARE
    v_retired integer;
    v_members integer;
BEGIN
    UPDATE public.orgs
       SET status = 'retired',
           name   = slug
     WHERE slug LIKE '\_w17\_selftest\_%' ESCAPE '\'
       AND (status IS DISTINCT FROM 'retired' OR name IS DISTINCT FROM slug);
    GET DIAGNOSTICS v_retired = ROW_COUNT;

    IF EXISTS (
        SELECT 1 FROM public.orgs
         WHERE slug LIKE '\_w17\_selftest\_%' ESCAPE '\'
           AND (status IS DISTINCT FROM 'retired' OR name IS DISTINCT FROM slug)
    ) THEN
        RAISE EXCEPTION 'W-17 retirement ABORT: a self-test org is still unretired after the update.';
    END IF;

    SELECT (SELECT count(*) FROM public.user_roles ur JOIN public.orgs o ON o.id = ur.org_id
             WHERE o.slug LIKE '\_w17\_selftest\_%' ESCAPE '\')
         + (SELECT count(*) FROM public.user_access_profiles up JOIN public.orgs o ON o.id = up.org_id
             WHERE o.slug LIKE '\_w17\_selftest\_%' ESCAPE '\')
      INTO v_members;
    IF v_members <> 0 THEN
        RAISE EXCEPTION 'W-17 retirement ABORT: a self-test org has % role or access-profile row(s); a real principal belongs to it.', v_members;
    END IF;

    RAISE NOTICE 'W-17 retirement: % self-test org(s) retired now; none has a member.', v_retired;
END
$w17_retire$;
