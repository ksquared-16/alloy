-- W-58 / `RM-11` / `S-12` — one submit, one transaction, no partial state.
--
-- `03-implementation-qa-sequence.md` §46, W-58. `01…§40` records the defect: the role page has THREE
-- independent save paths — role meta, grants, creation — with no dirty-state tracking among 18
-- hooks, so *"an operator who edits the label and the grid and presses one button silently discards
-- the other edit"*.
--
-- **And §52 records why this item was NOT safe to build when it was first listed:** it *"composes a
-- PATCH with `T-23`'s untransacted delete-then-insert into one operator action with three failure
-- points and no compensation. A partial failure would leave the label changed and the grants empty.
-- Must land with `S-12` (atomicity), not before it."*
--
-- `W-28` supplied `S-12` (`20260818200000`). This composes on top of it rather than beside it: the
-- grants half is not reimplemented here, it is CALLED. Two copies of a replacement algorithm is how
-- the two answers in `M2-11` came to disagree, and the second copy is always the one that goes stale.
--
-- **The ordering is the guarantee.** Meta is written first and the grants replacement second, inside
-- one transaction. If the grants half raises — an invalid key, a lost race, anything — the label
-- change rolls back with it. That is exactly `W-58`'s Tier C criterion: fault-inject the grant write
-- mid-submit and the label must not have persisted.
--
-- Locking is inherited, not re-declared: `replace_role_permission_grants` takes `FOR UPDATE` on the
-- role row, so two concurrent submits for the same role serialize here too.
--
-- Authorization does not move. `service_role` only; the calling route still owns who may ask.

DO $preflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'replace_role_permission_grants'
    ) THEN
        RAISE EXCEPTION 'W-58 aborted: replace_role_permission_grants (W-28) is not present. This function composes on it; without it there is no atomic grants half to compose with.';
    END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.save_role_definition_and_grants(
    p_org_id uuid,
    p_role_key text,
    p_role_label text,
    p_is_active boolean,
    p_permission_keys text[]
)
RETURNS TABLE (granted_permission_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    -- NULL means "not edited" for each field, so a submit that changes only the grid does not
    -- rewrite the label with a stale value read when the page loaded.
    UPDATE public.role_definitions rd
    SET role_label = COALESCE(p_role_label, rd.role_label),
        is_active  = COALESCE(p_is_active, rd.is_active)
    WHERE rd.org_id = p_org_id
      AND rd.role_key = p_role_key;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown_role_key:%', p_role_key USING ERRCODE = '23503';
    END IF;

    -- The grants half, in this same transaction. A raise in here rolls the label back with it.
    RETURN QUERY
    SELECT r.granted_permission_key
    FROM public.replace_role_permission_grants(p_org_id, p_role_key, p_permission_keys) AS r;
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_role_definition_and_grants(uuid, text, text, boolean, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_role_definition_and_grants(uuid, text, text, boolean, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.save_role_definition_and_grants(uuid, text, text, boolean, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_role_definition_and_grants(uuid, text, text, boolean, text[]) TO service_role;

COMMENT ON FUNCTION public.save_role_definition_and_grants(uuid, text, text, boolean, text[]) IS
    'W-58/RM-11: one submit for the role page. Writes role meta and replaces grants in ONE transaction by composing W-28''s replace_role_permission_grants, so a failure in the grants half rolls back the label change. NULL meta fields mean "not edited". service_role only — the calling route owns authorization.';
