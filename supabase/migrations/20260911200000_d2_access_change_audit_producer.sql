-- D2 — ACCESS CHANGE AUDIT: THE PRODUCER, INSIDE THE TRANSACTION THAT ALREADY EXISTS.
--
-- ── WHY THERE IS NO NEW TABLE ──
--
-- `mutation_events` (20260630121000) already carries org_id, command_key, domain, subject_id,
-- subject_type, previous_state, new_state, operator_id, origin, override_reason, context_payload and
-- committed_at, under service-role-only RLS. That is nearly the whole event model this slice needs,
-- including the `origin` CHECK (operator | automation | api | system) that keeps a system change from
-- being attributed to a person. A parallel `access_audit_log` would be a second history for the same
-- question, and the first thing to rot.
--
-- ── WHY THE PRODUCER IS HERE AND NOT IN THE ROUTE ──
--
-- `execute_lead_status_mutation` set the pattern and its own comment states the guarantee: read prior
-- state FOR UPDATE, write state, insert the event, *"same transaction — atomicity guaranteed"*. A
-- route-level follow-up insert cannot make that promise: the grant would commit and the history could
-- still be lost, which is the one failure an audit product must not have. `replace_role_permission_grants`
-- is already SECURITY DEFINER, already takes `FOR UPDATE` on the role row, and already owns the whole
-- replacement. The event belongs inside it, so atomicity is structural rather than remembered.
--
-- ── WHAT `domain = 'access'` IS, AND WHAT IT IS NOT ──
--
-- `mutation_events.domain` is plain text with no CHECK, and the table is written to DIRECTLY by
-- `execute_lead_status_mutation` rather than through a framework. So this adds a second PRODUCER to a
-- shared outbox; it does not enrol access into the status-mutation runtime.
-- `MutationDomainKey` in `web/lib/mutations/types.ts` is that runtime's vocabulary — four status
-- domains, each with a canonical status column and transition rules. Access has no status column and
-- no transition table, so `access` is deliberately NOT added there. Same table, different producer.
--
-- ── WHY THE ACTOR IS A PARAMETER, AND WHY NULL REFUSES ──
--
-- `operator_id` cannot be derived in the database: the RPC runs as `service_role` and the person who
-- asked is known only to the authenticated route. So the caller passes it — and passing nothing is
-- refused rather than recorded as an anonymous or system change. *"Do not infer system vs operator
-- from absence of a name."* A caller that genuinely is the system says so, explicitly, by passing
-- `origin => 'system'` with its own actor label.
--
-- ── WHAT IS STORED, AND WHAT IS RENDERED ──
--
-- `previous_state` / `new_state` hold the CANONICAL capability sets, and the operator sentence
-- ("Financials — No access → View") is rendered by the read model from those sets through
-- `capabilityTaxonomy`. That is deliberate: the taxonomy is the one product-facing presentation owner
-- and it gains keys most weeks, so duplicating its grouping in SQL would create a second answer that
-- goes stale between deployments. Storing canonical truth and rendering through the single taxonomy
-- also keeps history and the role editor saying the same thing about the same grant set, which two
-- renderers could not guarantee.
--
-- Raw keys are therefore the stored detail, never the mounted summary — which is exactly the split
-- the instruction asks for.

-- ---------------------------------------------------------------------------
-- 0. Preflight. Refuse rather than half-install.
-- ---------------------------------------------------------------------------
DO $preflight$
BEGIN
    IF to_regclass('public.mutation_events') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: public.mutation_events is absent; 20260630121000 has not been applied. This migration composes on that table rather than creating one.';
    END IF;
    IF to_regprocedure('public.replace_role_permission_grants(uuid, text, text[])') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: replace_role_permission_grants(uuid, text, text[]) is absent; W-28 (20260820130000) has not been applied.';
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. The grants producer.
--
--    Reproduced from 20260820130000 with the audit half added and nothing else
--    changed: the lock, the validation, the delete/insert and the returned shape
--    are byte-equivalent, because a replacement algorithm with two copies is how
--    `M2-11`'s two answers came to disagree.
--
--    The three new parameters are DEFAULTed so the 3-argument signature keeps
--    resolving — but a caller that omits the actor and changes something is
--    refused, not silently recorded as nobody.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_role_permission_grants(
    p_org_id uuid,
    p_role_key text,
    p_permission_keys text[],
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS TABLE (granted_permission_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_keys text[] := COALESCE(p_permission_keys, ARRAY[]::text[]);
    v_invalid text[];
    v_before text[];
    v_after text[];
    v_added text[];
    v_removed text[];
    v_role_id uuid;
BEGIN
    -- Serialize concurrent replacements of THIS role. Taken before anything is read, so no caller
    -- computes its removals against a snapshot another caller is about to invalidate.
    SELECT id INTO v_role_id
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

    -- THE BEFORE READING, taken under the same lock the write holds. Read outside it, this is the
    -- TOCTOU gap that would let the event describe a state no longer true at commit.
    SELECT COALESCE(array_agg(g.permission_key ORDER BY g.permission_key), ARRAY[]::text[])
      INTO v_before
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed;

    DELETE FROM public.role_permission_grants g
    WHERE g.org_id = p_org_id
      AND g.role_key = p_role_key
      AND NOT (g.permission_key = ANY (v_keys));

    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    SELECT p_org_id, p_role_key, k, true
    FROM unnest(v_keys) AS k
    ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

    SELECT COALESCE(array_agg(g.permission_key ORDER BY g.permission_key), ARRAY[]::text[])
      INTO v_after
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed;

    -- A SAVE THAT CHANGED NOTHING IS NOT HISTORY. An operator who opens a role and presses Save, or
    -- a client that retries, must not leave a row implying access moved. This is the idempotent-replay
    -- case stated as a condition rather than hoped for.
    IF v_before IS DISTINCT FROM v_after THEN
        IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
            RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
                USING ERRCODE = '23514';
        END IF;

        SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_added
          FROM unnest(v_after) AS k WHERE NOT (k = ANY (v_before));
        SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_removed
          FROM unnest(v_before) AS k WHERE NOT (k = ANY (v_after));

        INSERT INTO public.mutation_events (
            org_id, command_key, domain,
            subject_id, subject_type,
            previous_state, new_state,
            operator_id, origin, context_payload
        ) VALUES (
            p_org_id, 'access.role.grants_changed', 'access',
            v_role_id, 'role',
            array_to_string(v_before, ','), array_to_string(v_after, ','),
            p_actor_user_id, p_origin,
            jsonb_build_object(
                'role_key', p_role_key,
                'before', to_jsonb(v_before),
                'after', to_jsonb(v_after),
                'added', to_jsonb(v_added),
                'removed', to_jsonb(v_removed),
                'correlation_id', p_correlation_id
            )
        );
    END IF;

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

ALTER FUNCTION public.replace_role_permission_grants(uuid, text, text[], text, text, text) OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- 2. The role-definition producer, composed on the same transaction.
--
--    W-58 made meta + grants one submit. The audit follows the same shape: a
--    submit that changes the label AND the grid produces a role-definition event
--    and a grants event that share a correlation id, rather than one event
--    pretending to be both or twenty pretending to be unrelated.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_role_definition_and_grants(
    p_org_id uuid,
    p_role_key text,
    p_role_label text,
    p_is_active boolean,
    p_permission_keys text[],
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS TABLE (granted_permission_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_role_id uuid;
    v_before_label text;
    v_before_active boolean;
    v_changed text[] := ARRAY[]::text[];
BEGIN
    SELECT id, role_label, is_active
      INTO v_role_id, v_before_label, v_before_active
      FROM public.role_definitions
     WHERE org_id = p_org_id AND role_key = p_role_key
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown_role_key:%', p_role_key USING ERRCODE = '23503';
    END IF;

    -- NULL means "not edited", so a submit that changes only the grid does not rewrite the label
    -- with whatever the page happened to be holding.
    UPDATE public.role_definitions
       SET role_label = COALESCE(p_role_label, role_label),
           is_active  = COALESCE(p_is_active, is_active),
           updated_at = now()
     WHERE org_id = p_org_id AND role_key = p_role_key;

    IF p_role_label IS NOT NULL AND p_role_label IS DISTINCT FROM v_before_label THEN
        v_changed := v_changed || 'role_label';
    END IF;
    IF p_is_active IS NOT NULL AND p_is_active IS DISTINCT FROM v_before_active THEN
        v_changed := v_changed || 'is_active';
    END IF;

    IF array_length(v_changed, 1) IS NOT NULL THEN
        IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
            RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.mutation_events (
            org_id, command_key, domain,
            subject_id, subject_type,
            previous_state, new_state,
            operator_id, origin, context_payload
        ) VALUES (
            p_org_id, 'access.role.updated', 'access',
            v_role_id, 'role',
            COALESCE(v_before_label, '') || ' · ' || (CASE WHEN v_before_active THEN 'active' ELSE 'inactive' END),
            COALESCE(COALESCE(p_role_label, v_before_label), '') || ' · '
                || (CASE WHEN COALESCE(p_is_active, v_before_active) THEN 'active' ELSE 'inactive' END),
            p_actor_user_id, p_origin,
            jsonb_build_object(
                'role_key', p_role_key,
                'changed_fields', to_jsonb(v_changed),
                'correlation_id', p_correlation_id
            )
        );
    END IF;

    -- The grants half is CALLED, not reimplemented, and carries the same actor and correlation id so
    -- one submit reads as one operator action.
    RETURN QUERY
    SELECT r.granted_permission_key
      FROM public.replace_role_permission_grants(
               p_org_id, p_role_key, p_permission_keys,
               p_actor_user_id, p_origin, p_correlation_id
           ) AS r;
END;
$fn$;

ALTER FUNCTION public.save_role_definition_and_grants(uuid, text, text, boolean, text[], text, text, text) OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- 3. Immutability, enforced by the database rather than by convention.
--
--    `mutation_events` is service-role-only, so no browser reaches it — but the
--    access routes run AS service_role, which means "no route exposes an update"
--    is a property of today's code rather than of the table. Audit history that a
--    future route could edit is not audit history.
--
--    UPDATE and DELETE are refused for everyone, including the role the product
--    runs as. Retention/archival, if it ever exists, is a governed migration that
--    drops and restores this trigger deliberately — which is the visible, reviewed
--    act it should be.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mutation_events_append_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
AS $fn$
BEGIN
    RAISE EXCEPTION 'mutation_events is append-only: % is refused. Correct history with a new access mutation, not by rewriting the record of the old one.', TG_OP
        USING ERRCODE = '42501';
END;
$fn$;

DROP TRIGGER IF EXISTS mutation_events_append_only ON public.mutation_events;
CREATE TRIGGER mutation_events_append_only
    BEFORE UPDATE OR DELETE ON public.mutation_events
    FOR EACH ROW EXECUTE FUNCTION public.mutation_events_append_only();

-- ---------------------------------------------------------------------------
-- 4. The read path's index. Newest-first per org is the one query every surface
--    makes; the domain index from 20260630121000 already covers the access filter.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS mutation_events_org_committed
    ON public.mutation_events (org_id, committed_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- 5. Assertions, against THIS database, now.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
    v_src text;
BEGIN
    IF to_regprocedure('public.replace_role_permission_grants(uuid, text, text[], text, text, text)') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: the audited grants producer is not installed.';
    END IF;
    IF to_regprocedure('public.save_role_definition_and_grants(uuid, text, text, boolean, text[], text, text, text)') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: the audited role-definition producer is not installed.';
    END IF;

    -- The event insert is INSIDE the grants function, which is what makes it atomic. A version that
    -- mutated grants without it would pass every other check in this file.
    v_src := pg_get_functiondef('public.replace_role_permission_grants(uuid, text, text[], text, text, text)'::regprocedure);
    IF strpos(v_src, 'insert into public.mutation_events') = 0
       AND strpos(v_src, 'INSERT INTO public.mutation_events') = 0 THEN
        RAISE EXCEPTION 'D2 ABORT: replace_role_permission_grants does not write mutation_events; the audit would not be atomic.';
    END IF;
    IF strpos(v_src, 'audit_actor_required') = 0 THEN
        RAISE EXCEPTION 'D2 ABORT: the grants producer would record an access change with no actor.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = 'public.mutation_events'::regclass
           AND NOT t.tgisinternal
           AND t.tgname = 'mutation_events_append_only'
    ) THEN
        RAISE EXCEPTION 'D2 ABORT: mutation_events is not append-only.';
    END IF;

    RAISE NOTICE 'D2: access change audit producers installed; mutation_events is append-only.';
END
$assert$;
