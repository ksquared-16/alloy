-- W-28 / `S-12` / `T-23` — the grant replacement becomes ONE database operation.
--
-- `03-implementation-qa-sequence.md` §16, W-28: atomic authority writes, closing GAP-10's atomicity
-- half. The membership half closed under W-5/G4 (`replaceMembershipWithAccessProfile`); this is the
-- grants half, and it is the clause the prior session explicitly did NOT claim.
--
-- **What is wrong with the current route, stated precisely.** `PUT /rbac/grants` performs THREE
-- statements: read the current key set, delete the removals, upsert the additions. That was already
-- an improvement — it replaced "delete everything, then insert" which left a role holding ZERO
-- grants when the insert failed — and its ordering is deliberate: removals first, so a mid-flight
-- failure can only ever UNDER-grant. But bounding a blast radius is not atomicity, and two defects
-- remain that only a single operation can close:
--
--   1. **Lost update.** Two operators replacing the same role's grants both read the current set,
--      each computes its own removals against that snapshot, and the writes interleave. The final
--      state matches NEITHER operator's intent — it is a merge nobody chose. No ordering of the
--      three statements fixes this, because the race is between the READ and the writes.
--   2. **Validation is outside the write.** The route checks every key against the active catalog
--      and then writes in separate statements. A key deactivated in between is validated as live and
--      written anyway.
--
-- **What this function guarantees.** One transaction owns the whole transition:
--
--   - it takes a row lock on the `role_definitions` row first, so concurrent replacements of the
--     SAME role serialize. Each caller then reads a state no one else is mid-way through changing,
--     and the committed result always matches exactly one operator's intent rather than a blend.
--     Different roles do not contend, because the lock subject is the role.
--   - validation happens INSIDE that transaction, against the same snapshot the write uses;
--   - delete and insert cannot half-happen: either the replacement commits or nothing does.
--
-- **Authorization does not move.** This is `EXECUTE`-able by `service_role` only, and every caller
-- reaches it through a route that has already run `requireUsersRolesManageAuth`. The function
-- decides WHAT the grant set becomes; the route decides WHO may ask. That split is the same one
-- Phase 1's audit-log RPC established, and it is why this introduces no authority decision — the
-- admitted set is byte-identical to what the three statements admitted.
--
-- Replay-safe by construction: `CREATE OR REPLACE`, and the grants themselves are idempotent.

-- ---------------------------------------------------------------------------
-- 0. Fail closed if the shape this function assumes is not present.
--
--    It relies on the unique constraint the upsert conflicts against and on W-16's role FK having
--    landed. Asserting both here converts a wrong-environment apply into a refusal rather than into
--    a function that misbehaves the first time an operator saves a permission grid.
-- ---------------------------------------------------------------------------

DO $preflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.role_permission_grants'::regclass
          AND contype = 'u'
          AND conkey @> ARRAY[
                (SELECT attnum FROM pg_attribute WHERE attrelid='public.role_permission_grants'::regclass AND attname='org_id'),
                (SELECT attnum FROM pg_attribute WHERE attrelid='public.role_permission_grants'::regclass AND attname='role_key'),
                (SELECT attnum FROM pg_attribute WHERE attrelid='public.role_permission_grants'::regclass AND attname='permission_key')
              ]::smallint[]
    ) THEN
        RAISE EXCEPTION 'W-28 aborted: no unique constraint on role_permission_grants (org_id, role_key, permission_key); the upsert has nothing to conflict against.';
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. The one operation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_role_permission_grants(
    p_org_id uuid,
    p_role_key text,
    p_permission_keys text[]
)
RETURNS TABLE (granted_permission_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_keys text[] := COALESCE(p_permission_keys, ARRAY[]::text[]);
    v_invalid text[];
BEGIN
    -- Serialize concurrent replacements of THIS role. Taken before anything is read, so no caller
    -- computes its removals against a snapshot another caller is about to invalidate.
    PERFORM 1
    FROM public.role_definitions
    WHERE org_id = p_org_id AND role_key = p_role_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown_role_key:%', p_role_key USING ERRCODE = '23503';
    END IF;

    -- Validated inside the transaction, against the snapshot the write will use.
    SELECT array_agg(k ORDER BY k) INTO v_invalid
    FROM unnest(v_keys) AS k
    WHERE NOT EXISTS (
        SELECT 1 FROM public.permission_definitions pd
        WHERE pd.key = k AND pd.is_active
    );

    IF v_invalid IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_permission_keys:%', array_to_string(v_invalid, ',') USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.role_permission_grants g
    WHERE g.org_id = p_org_id
      AND g.role_key = p_role_key
      AND NOT (g.permission_key = ANY (v_keys));

    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    SELECT p_org_id, p_role_key, k, true
    FROM unnest(v_keys) AS k
    ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

    -- Returned column is `granted_permission_key`, NOT `permission_key`. A RETURNS TABLE column
    -- becomes a PL/pgSQL variable, and one named `permission_key` is ambiguous against the column
    -- of the same name inside `ON CONFLICT (…, permission_key)` — Postgres refuses the whole
    -- function at run time, not at create time, so only calling it reveals this.
    RETURN QUERY
    SELECT g.permission_key
    FROM public.role_permission_grants g
    WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed
    ORDER BY g.permission_key;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Authorization stays in the route. Nothing reaches this without a service-role client.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.replace_role_permission_grants(uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_role_permission_grants(uuid, text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.replace_role_permission_grants(uuid, text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_role_permission_grants(uuid, text, text[]) TO service_role;

COMMENT ON FUNCTION public.replace_role_permission_grants(uuid, text, text[]) IS
    'W-28/S-12: replaces a role''s permission grants in ONE transaction. Locks the role_definitions row so concurrent replacements serialize and the committed result matches exactly one caller''s intent; validates keys against the active catalog inside that transaction; delete and insert cannot half-happen. service_role only — the calling route owns authorization.';
