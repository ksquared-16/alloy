-- =============================================================================
-- W7-F002 — A CAPABILITY THAT CAN MOVE MONEY IS GRANTED ONLY TO A NAMED HUMAN.
--
-- The Director's requirement: a user permitted to perform financial mutations must
-- resolve, through `user_person_links`, to a named Person — never inferred from email.
-- The boundary is GRANT TIME, at the Access authority, so no financial transaction is
-- ever refused mid-flight and no existing holder is stranded:
--
--   * a membership change that NEWLY confers a money-capable capability on a user with
--     no active link is refused (all three assignment writers share
--     `assert_assignment_delegation_ceiling`, which already computes what is gained);
--   * newly ALLOWING a money-capable capability on a role that has unlinked holders is
--     refused (a guard on `role_permission_grants`; re-saving a grant that was already
--     allowed is not a new grant and passes).
--
-- "Money-capable" is a CAPABILITY set, resolved the way every gate resolves authority
-- (user_roles → role_permission_grants), not a list of role names.
--
-- Revoking or replacing a link are explicit, atomic, recorded acts. A link cannot be
-- revoked while the user still holds a money-capable capability: replace it instead.
-- Unattributed (system) assignments remain the caller's responsibility, as the ceiling
-- already documents. Re-runnable.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.money_capable_capability_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT ARRAY['fin.write', 'fin.adjust', 'fin.responsibility', 'fin.subsidy', 'fin.provider', 'fin.post']::text[];
$fn$;

COMMENT ON FUNCTION public.money_capable_capability_keys() IS
'W7-F002: the capabilities that permit a financial mutation. fin.post is retired but listed so a stray grant of it is still judged.';

CREATE OR REPLACE FUNCTION public.user_has_active_person_link(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
    SELECT EXISTS (
        SELECT 1
          FROM public.user_person_links l
          JOIN public.persons p ON p.id = l.person_id AND p.archived_at IS NULL
         WHERE l.org_id = p_org_id
           AND l.user_id = p_user_id
           AND l.status = 'active'
           AND COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '')) IS NOT NULL
    );
$fn$;

COMMENT ON FUNCTION public.user_has_active_person_link(uuid, uuid) IS
'W7-F002: true when the user resolves, through an active link, to an unarchived Person with a name.';

-- ---------------------------------------------------------------------------
-- The assignment ceiling, verbatim from 20260915150000 plus the link requirement.
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
    -- An unattributed call is not bounded here. Each caller decides whether an
    -- unattributed change is legitimate at all; where it is not, the caller
    -- refuses it with `audit_actor_required` before reaching this function.
    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RETURN;
    END IF;

    v_before := public.effective_capability_keys(p_org_id, p_target_user_id);
    v_after  := public.capability_keys_of_roles(p_org_id, p_next_role_keys);

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
      INTO v_gained
      FROM unnest(v_after) AS k
     WHERE NOT (k = ANY (v_before));

    -- Nothing newly conferred: a lateral move, a reduction, or a no-op. The
    -- actor's own authority is irrelevant to a change that grants nobody
    -- anything, and consulting it would produce false refusals.
    IF array_length(v_gained, 1) IS NULL THEN
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

    -- W7-F002, judged only for a change the actor IS allowed to make: a capability that can move
    -- money is conferred only on a named human. The gained keys are judged, so an existing holder
    -- is never stranded by an unrelated edit.
    IF EXISTS (SELECT 1 FROM unnest(v_gained) AS k WHERE k = ANY (public.money_capable_capability_keys()))
        AND NOT public.user_has_active_person_link(p_org_id, p_target_user_id) THEN
        RAISE EXCEPTION 'money_capable_grant_requires_person_link:%',
            (SELECT array_to_string(array_agg(k ORDER BY k), ',')
               FROM unnest(v_gained) AS k
              WHERE k = ANY (public.money_capable_capability_keys()))
            USING ERRCODE = '42501';
    END IF;
END;
$fn$;

COMMENT ON FUNCTION public.assert_assignment_delegation_ceiling(uuid, text, uuid, text[]) IS
'W-18 role-assignment ceiling plus W7-F002: capabilities a membership change NEWLY confers must be held by the actor (assignment_ceiling:<keys>), and a newly conferred money-capable capability requires the target to be linked to a named Person (money_capable_grant_requires_person_link:<keys>). Both 42501.';

-- ---------------------------------------------------------------------------
-- Newly allowing a money-capable capability on a role with unlinked holders.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_money_capable_role_grant_person_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_unlinked integer;
BEGIN
    IF NOT NEW.allowed OR NOT (NEW.permission_key = ANY (public.money_capable_capability_keys())) THEN
        RETURN NEW;
    END IF;
    -- Already allowed is not a new grant. BEFORE INSERT also fires for an upsert whose
    -- row exists, so the existing row is consulted rather than TG_OP alone.
    IF TG_OP = 'UPDATE' AND OLD.allowed THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM public.role_permission_grants g
         WHERE g.org_id = NEW.org_id AND g.role_key = NEW.role_key
           AND g.permission_key = NEW.permission_key AND g.allowed) THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_unlinked
      FROM public.user_roles ur
     WHERE ur.org_id = NEW.org_id
       AND ur.role = NEW.role_key
       AND NOT public.user_has_active_person_link(ur.org_id, ur.user_id);
    IF v_unlinked > 0 THEN
        RAISE EXCEPTION 'money_capable_grant_requires_person_link:% (% holder(s) of role % are not linked to a named person)',
            NEW.permission_key, v_unlinked, NEW.role_key
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_money_capable_role_grant_person_links ON public.role_permission_grants;
CREATE TRIGGER trg_enforce_money_capable_role_grant_person_links
    BEFORE INSERT OR UPDATE OF allowed, permission_key ON public.role_permission_grants
    FOR EACH ROW EXECUTE FUNCTION public.enforce_money_capable_role_grant_person_links();

-- ---------------------------------------------------------------------------
-- Revoke and replace: explicit, recorded, atomic.
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
    IF EXISTS (SELECT 1 FROM unnest(public.effective_capability_keys(p_org_id, p_user_id)) AS k
                WHERE k = ANY (public.money_capable_capability_keys())) THEN
        RAISE EXCEPTION 'person_link_required_for_money_capability: this user holds a money-capable capability; replace the link, or remove the capability first'
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

CREATE OR REPLACE FUNCTION public.replace_user_person_link(
    p_org_id uuid,
    p_user_id uuid,
    p_person_id uuid,
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
    UPDATE public.user_person_links
       SET status = 'revoked',
           revoked_at = now(),
           revoked_by = p_actor_user_id,
           note = concat_ws(E'\n', note, '[replaced] ' || btrim(p_note)),
           updated_at = now()
     WHERE org_id = p_org_id AND user_id = p_user_id AND status = 'active';
    INSERT INTO public.user_person_links (org_id, user_id, person_id, status, linked_by, note)
    VALUES (p_org_id, p_user_id, p_person_id, 'active', p_actor_user_id, btrim(p_note))
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.revoke_user_person_link(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_user_person_link(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_person_link(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_user_person_link(uuid, uuid, uuid, uuid, text) TO service_role;
