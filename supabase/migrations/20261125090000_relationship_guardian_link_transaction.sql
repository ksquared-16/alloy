-- THE GUARDIAN RELATIONSHIP IS WRITTEN ALL AT ONCE, OR NOT AT ALL.
--
-- Relationship-action authority (Director authorization: canonical guardian relationship transaction
-- repair). Measured on staging 89c6a4c3: `add_parent_guardian` ran as separate API calls — person,
-- contact, household link, child link — and when the child-link step refused, the person and the
-- household link had already been written (QA person 2a1cc5df). supabase-js has no transactions, so the
-- only all-or-nothing boundary is one database function.
--
-- relationship_link_household_guardian performs exactly what the guardian action writes today, in one
-- transaction:
--   1. person   — the operator-selected person (must belong to the org), or the household's own
--                 existing person when identity is UNAMBIGUOUS (same email or phone AND same first and
--                 last name AND already linked to this household), or a new person when no person in
--                 the org shares the email/phone. Anything else refuses with the candidates, so an
--                 ambiguous retry never creates another person.
--   2. contact  — the person's contact, created when missing (a global email/phone conflict refuses).
--   3. household link (customer_persons, role_type = the role key).
--   4. child link (customer_member_contacts) for each child in scope.
-- Every validation happens before the first write; any failure raises and rolls back every new row.
-- A per-household advisory lock serializes concurrent retries.
--
-- Security: SECURITY INVOKER, EXECUTE granted to service_role only (the server's relationship action);
-- every lookup and write is scoped to p_org_id and the household. Idempotent DDL (CREATE OR REPLACE,
-- REVOKE/GRANT). No table, column, constraint or existing data is changed.

CREATE OR REPLACE FUNCTION public.relationship_link_household_guardian(
    p_org_id uuid,
    p_customer_id uuid,
    p_member_ids uuid[],
    p_role_key text,
    p_person_id uuid,
    p_first_name text,
    p_last_name text,
    p_email text,
    p_phone text,
    p_phone_match text[],
    p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_person uuid;
    v_person_created boolean := false;
    v_reused boolean := false;
    v_contact uuid;
    v_member uuid;
    v_links int := 0;
    v_row_count int;
    v_candidates jsonb;
    v_first text := nullif(btrim(coalesce(p_first_name, '')), '');
    v_last text := nullif(btrim(coalesce(p_last_name, '')), '');
    v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
    v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
    v_source text := coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'relationship_action');
BEGIN
    -- ── preflight: nothing is written until every check passes ─────────────────────────────────
    IF p_org_id IS NULL OR p_customer_id IS NULL THEN
        RAISE EXCEPTION 'relationship_household_required' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND c.org_id = p_org_id) THEN
        RAISE EXCEPTION 'relationship_household_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF nullif(btrim(coalesce(p_role_key, '')), '') IS NULL THEN
        RAISE EXCEPTION 'relationship_role_required' USING ERRCODE = 'P0001';
    END IF;
    IF coalesce(array_length(p_member_ids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'relationship_child_required' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
        SELECT 1 FROM unnest(p_member_ids) AS m(id)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.customer_members cm
            WHERE cm.id = m.id AND cm.org_id = p_org_id AND cm.customer_id = p_customer_id
              AND cm.relationship = 'child' AND cm.is_active
        )
    ) THEN
        RAISE EXCEPTION 'relationship_child_not_in_household' USING ERRCODE = 'P0001';
    END IF;

    -- One guardian write per household at a time: a concurrent retry waits, then finds the first one's rows.
    PERFORM pg_advisory_xact_lock(hashtextextended('relationship_guardian:' || p_org_id::text || ':' || p_customer_id::text, 0));

    -- ── 1. person ───────────────────────────────────────────────────────────────────────────────
    IF p_person_id IS NOT NULL THEN
        SELECT p.id INTO v_person FROM public.persons p WHERE p.id = p_person_id AND p.org_id = p_org_id;
        IF v_person IS NULL THEN
            RAISE EXCEPTION 'relationship_person_not_found' USING ERRCODE = 'P0001';
        END IF;
        v_reused := true;
    ELSE
        IF v_first IS NULL OR v_last IS NULL OR (v_email IS NULL AND v_phone IS NULL) THEN
            RAISE EXCEPTION 'relationship_identity_insufficient' USING ERRCODE = 'P0001';
        END IF;
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'person_id', c.id,
                   'display_name', btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
                   'in_household', c.in_household,
                   'same_name', c.same_name) ORDER BY c.id), '[]'::jsonb)
          INTO v_candidates
          FROM (
              SELECT p.id, p.first_name, p.last_name,
                     EXISTS (SELECT 1 FROM public.customer_persons cp
                             WHERE cp.org_id = p_org_id AND cp.customer_id = p_customer_id AND cp.person_id = p.id) AS in_household,
                     (lower(btrim(coalesce(p.first_name, ''))) = lower(v_first)
                      AND lower(btrim(coalesce(p.last_name, ''))) = lower(v_last)) AS same_name
                FROM public.persons p
               WHERE p.org_id = p_org_id
                 AND ((v_email IS NOT NULL AND lower(btrim(coalesce(p.email, ''))) = v_email)
                      OR (p_phone_match IS NOT NULL AND p.phone = ANY (p_phone_match)))
          ) c;

        IF jsonb_array_length(v_candidates) = 0 THEN
            INSERT INTO public.persons (org_id, first_name, last_name, email, phone)
            VALUES (p_org_id, v_first, v_last, v_email, v_phone)
            RETURNING id INTO v_person;
            v_person_created := true;
        ELSIF jsonb_array_length(v_candidates) = 1
              AND (v_candidates -> 0 ->> 'in_household')::boolean
              AND (v_candidates -> 0 ->> 'same_name')::boolean THEN
            -- Unambiguous: the household's own person, same name, same email/phone.
            v_person := (v_candidates -> 0 ->> 'person_id')::uuid;
            v_reused := true;
        ELSE
            RAISE EXCEPTION 'relationship_identity_choice_required'
                USING ERRCODE = 'P0001', DETAIL = v_candidates::text;
        END IF;
    END IF;

    -- ── 2. contact ──────────────────────────────────────────────────────────────────────────────
    SELECT ct.id INTO v_contact FROM public.contacts ct WHERE ct.org_id = p_org_id AND ct.person_id = v_person ORDER BY ct.created_at LIMIT 1;
    IF v_contact IS NULL THEN
        INSERT INTO public.contacts (org_id, customer_id, person_id, first_name, last_name, email, phone, status, metadata)
        SELECT p_org_id, p_customer_id, p.id, nullif(btrim(coalesce(p.first_name, '')), ''), nullif(btrim(coalesce(p.last_name, '')), ''),
               nullif(btrim(coalesce(p.email, '')), ''), nullif(btrim(coalesce(p.phone, '')), ''), 'active', jsonb_build_object('source', v_source)
          FROM public.persons p WHERE p.id = v_person
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_contact;
        IF v_contact IS NULL THEN
            -- Another contact already holds this email/phone (globally unique): never borrowed.
            RAISE EXCEPTION 'relationship_contact_conflict' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- ── 3. household link ───────────────────────────────────────────────────────────────────────
    INSERT INTO public.customer_persons (org_id, customer_id, person_id, role_type, is_primary, metadata)
    VALUES (p_org_id, p_customer_id, v_person, btrim(p_role_key), false, jsonb_build_object('source', v_source))
    ON CONFLICT ON CONSTRAINT uq_customer_persons_unique DO NOTHING;

    -- ── 4. child links ──────────────────────────────────────────────────────────────────────────
    FOREACH v_member IN ARRAY p_member_ids LOOP
        INSERT INTO public.customer_member_contacts (org_id, customer_id, customer_member_id, contact_id, role_key, is_active)
        VALUES (p_org_id, p_customer_id, v_member, v_contact, btrim(p_role_key), true)
        ON CONFLICT ON CONSTRAINT customer_member_contacts_unique DO NOTHING;
        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_links := v_links + v_row_count;
    END LOOP;

    RETURN jsonb_build_object(
        'person_id', v_person,
        'person_created', v_person_created,
        'person_reused', v_reused,
        'contact_id', v_contact,
        'links_written', v_links
    );
END;
$$;

COMMENT ON FUNCTION public.relationship_link_household_guardian(uuid, uuid, uuid[], text, uuid, text, text, text, text, text[], text) IS
    'Relationship-action authority: the guardian relationship (person, contact, household link, child links) in one transaction. Service role only.';

REVOKE ALL ON FUNCTION public.relationship_link_household_guardian(uuid, uuid, uuid[], text, uuid, text, text, text, text, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.relationship_link_household_guardian(uuid, uuid, uuid[], text, uuid, text, text, text, text, text[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relationship_link_household_guardian(uuid, uuid, uuid[], text, uuid, text, text, text, text, text[], text) TO service_role;
