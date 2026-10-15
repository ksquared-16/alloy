-- =============================================================================
-- W7-F002 (corrected, Director 2026-10-14) — A MONEY-CAPABLE LOGIN MUST BE NAMED, NOT PERSON-LINKED.
--
-- 20261122140000/150000 required every login that can move money to hold an active link to a named
-- Person. That conflated two identities:
--
--   USER / LOGIN   who authenticated and operated Alloy (auth.users). Always exists.
--   PERSON         the business/human record in Alloy. A login MAY be linked to one.
--
-- An owner in an organisation that does not use Workforce, an outside accountant, an implementation
-- operator — each is a real, accountable human whose login has a name, and none should need a fake
-- staff Person to appear in the audit trail. The accountability requirement is that the operator
-- can be NAMED, which a named account satisfies on its own.
--
-- So the prerequisite becomes `user_has_named_operator_identity`: an active link to a named,
-- unarchived Person, OR a non-blank account name on the login (raw_user_meta_data full_name /
-- name — the field Access already writes at invite and now edits). The email is never a name.
--
-- Same enforcement points, same transaction-local `alloy.money_link_judged` contract, new refusal
-- code `money_capable_grant_requires_named_operator`. Unlinking a Person is refused only when it
-- would leave a money-capable login unnamed. Re-runnable: every object is CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_account_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
    SELECT COALESCE(
        NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(btrim(u.raw_user_meta_data ->> 'name'), '')
    )
      FROM auth.users u
     WHERE u.id = p_user_id;
$fn$;

COMMENT ON FUNCTION public.user_account_display_name(uuid) IS
'W7-F002: the login''s own human-readable account name (user metadata full_name, else name), or NULL. Never the email.';

CREATE OR REPLACE FUNCTION public.user_has_named_operator_identity(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
    SELECT public.user_has_active_person_link(p_org_id, p_user_id)
        OR public.user_account_display_name(p_user_id) IS NOT NULL;
$fn$;

COMMENT ON FUNCTION public.user_has_named_operator_identity(uuid, uuid) IS
'W7-F002 (corrected): the operator can be named — linked to a named Person, or carrying an account name. A Person link is optional.';

-- ---------------------------------------------------------------------------
-- The assignment ceiling: verbatim from 20261122150000, prerequisite corrected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_assignment_delegation_ceiling(
    p_org_id         uuid,
    p_actor_user_id  text,
    p_target_user_id uuid,
    p_next_role_keys text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_before text[];
    v_after  text[];
    v_gained text[];
    v_actor  text[];
    v_beyond text[];
BEGIN
    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RETURN;
    END IF;

    v_before := public.effective_capability_keys(p_org_id, p_target_user_id);
    v_after  := public.capability_keys_of_roles(p_org_id, p_next_role_keys);

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
      INTO v_gained
      FROM unnest(v_after) AS k
     WHERE NOT (k = ANY (v_before));

    IF array_length(v_gained, 1) IS NULL THEN
        PERFORM set_config('alloy.money_link_judged', p_org_id::text || ':' || p_target_user_id::text, true);
        RETURN;
    END IF;

    v_actor := public.effective_capability_keys(p_org_id, p_actor_user_id::uuid);

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
      INTO v_beyond
      FROM unnest(v_gained) AS k
     WHERE NOT (k = ANY (v_actor));

    IF array_length(v_beyond, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'assignment_ceiling:%', array_to_string(v_beyond, ',')
            USING ERRCODE = '42501';
    END IF;

    -- W7-F002 (corrected): a capability that can move money is conferred only on an operator who
    -- can be NAMED — a named account, or a link to a named Person.
    IF EXISTS (SELECT 1 FROM unnest(v_gained) AS k WHERE k = ANY (public.money_capable_capability_keys()))
        AND NOT public.user_has_named_operator_identity(p_org_id, p_target_user_id) THEN
        RAISE EXCEPTION 'money_capable_grant_requires_named_operator:%',
            (SELECT array_to_string(array_agg(k ORDER BY k), ',')
               FROM unnest(v_gained) AS k
              WHERE k = ANY (public.money_capable_capability_keys()))
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('alloy.money_link_judged', p_org_id::text || ':' || p_target_user_id::text, true);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- The user_roles invariant: same shape, prerequisite corrected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_user_roles_money_capable_person_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_money  text[];
    v_held   text[];
    v_new    text[];
BEGIN
    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_money
      FROM unnest(public.capability_keys_of_roles(NEW.org_id, ARRAY[NEW.role])) AS k
     WHERE k = ANY (public.money_capable_capability_keys());
    IF array_length(v_money, 1) IS NULL THEN
        RETURN NEW;                                   -- the role moves no money
    END IF;
    IF public.user_has_named_operator_identity(NEW.org_id, NEW.user_id) THEN
        RETURN NEW;                                   -- a nameable operator
    END IF;
    IF current_setting('alloy.money_link_judged', true) = NEW.org_id::text || ':' || NEW.user_id::text THEN
        RETURN NEW;                                   -- the governed ceiling judged this change
    END IF;

    SELECT COALESCE(array_agg(DISTINCT g.permission_key), ARRAY[]::text[]) INTO v_held
      FROM public.user_roles ur
      JOIN public.role_permission_grants g
        ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
     WHERE ur.org_id = NEW.org_id
       AND ur.user_id = NEW.user_id
       AND ur.role <> NEW.role
       AND NOT (TG_OP = 'UPDATE' AND ur.role = OLD.role AND ur.user_id = OLD.user_id AND ur.org_id = OLD.org_id);
    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_new
      FROM unnest(v_money) AS k
     WHERE NOT (k = ANY (v_held));
    IF array_length(v_new, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'money_capable_grant_requires_named_operator:%', array_to_string(v_new, ',')
        USING ERRCODE = '42501';
END;
$fn$;

COMMENT ON FUNCTION public.enforce_user_roles_money_capable_person_link() IS
'W7-F002 (corrected): a user_roles row that newly confers a money-capable capability requires a nameable operator (account name, or a link to a named Person), unless the governed ceiling judged the change.';

-- ---------------------------------------------------------------------------
-- A role newly gaining a money capability: judged against its holders' names, not their links.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_money_capable_role_grant_person_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_unnamed integer;
BEGIN
    IF NOT NEW.allowed OR NOT (NEW.permission_key = ANY (public.money_capable_capability_keys())) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.allowed THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM public.role_permission_grants g
         WHERE g.org_id = NEW.org_id AND g.role_key = NEW.role_key
           AND g.permission_key = NEW.permission_key AND g.allowed) THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_unnamed
      FROM public.user_roles ur
     WHERE ur.org_id = NEW.org_id
       AND ur.role = NEW.role_key
       AND NOT public.user_has_named_operator_identity(ur.org_id, ur.user_id);
    IF v_unnamed > 0 THEN
        RAISE EXCEPTION 'money_capable_grant_requires_named_operator:% (% holder(s) of role % have no name on file)',
            NEW.permission_key, v_unnamed, NEW.role_key
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Unlinking a Person is ordinary — unless it would leave a money-capable login unnamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_user_person_link(
    p_org_id uuid,
    p_user_id uuid,
    p_actor_user_id uuid,
    p_note text
) RETURNS public.user_person_links
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_row public.user_person_links;
BEGIN
    IF p_note IS NULL OR length(btrim(p_note)) < 4 THEN
        RAISE EXCEPTION 'person_link_note_required' USING ERRCODE = '22023';
    END IF;
    IF public.user_account_display_name(p_user_id) IS NULL
       AND EXISTS (SELECT 1 FROM unnest(public.effective_capability_keys(p_org_id, p_user_id)) AS k
                    WHERE k = ANY (public.money_capable_capability_keys())) THEN
        RAISE EXCEPTION 'account_name_required_for_money_capability: this user can move money and has no account name, so removing the link would leave their financial activity unnamed; add a name to the account first'
            USING ERRCODE = '42501';
    END IF;
    UPDATE public.user_person_links
       SET status = 'revoked',
           revoked_at = now(),
           revoked_by = p_actor_user_id,
           note = concat_ws(E'\n', note, '[revoked] ' || btrim(p_note)),
           updated_at = now()
     WHERE org_id = p_org_id AND user_id = p_user_id AND status = 'active'
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'person_link_not_found' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.user_account_display_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_has_named_operator_identity(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_user_person_link(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_account_display_name(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_named_operator_identity(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_person_link(uuid, uuid, uuid, text) TO service_role;
