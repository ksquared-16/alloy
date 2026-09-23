-- Thread 7 Core Resource Expansion — Group 1, the People read authority.
--
-- Three functions, one law. Each applies the installation's authority INSIDE the select, so there
-- is no ordering of operations in which an unauthorized row is briefly in hand. Callers pass the
-- already-resolved authorized site set; they do not pass a tenant, and there is no org_id
-- parameter a caller could influence.
--
-- ─── WHAT MAKES A CHILD VISIBLE ───
--
-- Enrollment, and nothing else. A child is externally visible only when an enrollment agreement
-- places them at a site the installation may reach. Measurement is why this is stated so firmly:
-- only 17 of 1,519 children in the certification tenant hold an enrollment at all, so publishing
-- "every child in the organization" would expose 1,519 records to satisfy a need for 17. That is
-- the bulk PII export the public platform must never become, and it would have happened on day one.
--
-- The rule holds in org_wide mode too. `org_wide` widens which SITES an installation reaches; it
-- does not change what makes a child a participant in service.
--
-- ─── HOUSEHOLDS ARE ANCHORS, NEVER AUTHORITY ───
--
-- A household appears because at least one of its children is independently visible. It never
-- grants sight of anything: siblings outside the boundary stay invisible, and the response carries
-- no count, no ids and no hint that they exist. One household in the certification tenant already
-- spans two sites, so this is a live case rather than a hypothetical one.
--
-- ─── PICKUP AUTHORITY IS COMPUTED, NEVER COPIED ───
--
-- `authorized_pickup` on the relationship role says a person MAY collect a child.
-- `may_not_pick_up` on a safeguarding restriction says they MAY NOT. They live in different
-- tables, and publishing the first alone would tell a partner that someone may collect a child
-- while a protective order says otherwise. So the role is never published; only the effective
-- answer is, computed here where both authorities are in scope.
--
-- It fails closed. A restriction whose affected party cannot be resolved to a person record still
-- removes pickup from EVERY relationship on that child, because we cannot prove it does not name
-- them. The reason is never returned in any form — not the kind, not the effect, not the dates,
-- not a count. A partner learns only true or false.

-- ─────────────────────────────────────────────────────────────────────────────
-- CHILDREN
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_external_children(
    p_org_id uuid,
    p_installation_id uuid,
    p_boundary_mode text,
    p_site_ids uuid[],
    p_limit integer,
    p_cursor_sort timestamptz DEFAULT NULL,
    p_cursor_id uuid DEFAULT NULL,
    p_updated_since timestamptz DEFAULT NULL,
    p_household_id uuid DEFAULT NULL,
    p_child_ids uuid[] DEFAULT NULL,
    p_external_id text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    external_id text,
    first_name text,
    last_name text,
    display_name text,
    date_of_birth date,
    household_id uuid,
    is_active boolean,
    status_key text,
    sort_key timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        cm.id,
        -- Only THIS installation's own mapping. Another installation's alias for the same child
        -- is not this caller's business and never appears.
        ref.external_id,
        cm.first_name,
        cm.last_name,
        cm.display_name,
        cm.dob AS date_of_birth,
        cm.customer_id AS household_id,
        cm.is_active,
        cm.status_key,
        COALESCE(cm.updated_at, cm.created_at) AS sort_key
    FROM public.customer_members cm
    LEFT JOIN public.integration_resource_refs ref
           ON ref.child_customer_member_id = cm.id
          AND ref.installation_id = p_installation_id
          AND ref.org_id = p_org_id
          AND ref.resource_type = 'child'
          AND ref.status = 'active'
    WHERE
        cm.org_id = p_org_id
        AND EXISTS (
            SELECT 1
            FROM public.child_enrollment_agreements ea
            WHERE ea.customer_member_id = cm.id
              AND ea.org_id = p_org_id
              AND (p_boundary_mode = 'org_wide'
                   OR ea.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
        )
        AND (p_household_id IS NULL OR cm.customer_id = p_household_id)
        AND (p_child_ids IS NULL OR cm.id = ANY (p_child_ids))
        -- Lookup by the caller's own alias. It narrows within authority; it cannot reach outside
        -- it, because the enrollment predicate above has already run.
        AND (p_external_id IS NULL OR ref.external_id = p_external_id)
        AND (p_updated_since IS NULL OR COALESCE(cm.updated_at, cm.created_at) > p_updated_since)
        AND (p_cursor_sort IS NULL
             OR (COALESCE(cm.updated_at, cm.created_at), cm.id) > (p_cursor_sort, p_cursor_id))
    ORDER BY COALESCE(cm.updated_at, cm.created_at) ASC, cm.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- HOUSEHOLDS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_external_households(
    p_org_id uuid,
    p_boundary_mode text,
    p_site_ids uuid[],
    p_limit integer,
    p_cursor_sort timestamptz DEFAULT NULL,
    p_cursor_id uuid DEFAULT NULL,
    p_updated_since timestamptz DEFAULT NULL,
    p_household_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name text,
    household_type text,
    status_key text,
    sort_key timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    -- Deliberately absent: stripe_customer_id, default_payment_method_id, payment_method_last4,
    -- payment_method_brand, setup_intent_id. Payment instruments are never a People concern, and
    -- they are excluded by not being selected rather than by being stripped later.
    SELECT
        c.id,
        c.name,
        c.customer_type AS household_type,
        c.status_key,
        COALESCE(c.updated_at, c.created_at) AS sort_key
    FROM public.customers c
    WHERE
        c.org_id = p_org_id
        AND EXISTS (
            SELECT 1
            FROM public.customer_members cm
            JOIN public.child_enrollment_agreements ea
              ON ea.customer_member_id = cm.id AND ea.org_id = p_org_id
            WHERE cm.customer_id = c.id
              AND cm.org_id = p_org_id
              AND (p_boundary_mode = 'org_wide'
                   OR ea.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
        )
        AND (p_household_ids IS NULL OR c.id = ANY (p_household_ids))
        AND (p_updated_since IS NULL OR COALESCE(c.updated_at, c.created_at) > p_updated_since)
        AND (p_cursor_sort IS NULL
             OR (COALESCE(c.updated_at, c.created_at), c.id) > (p_cursor_sort, p_cursor_id))
    ORDER BY COALESCE(c.updated_at, c.created_at) ASC, c.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RELATIONSHIPS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_external_relationships(
    p_org_id uuid,
    p_boundary_mode text,
    p_site_ids uuid[],
    p_include_contact boolean,
    p_limit integer,
    p_cursor_sort timestamptz DEFAULT NULL,
    p_cursor_id uuid DEFAULT NULL,
    p_updated_since timestamptz DEFAULT NULL,
    p_child_id uuid DEFAULT NULL,
    p_household_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    child_id uuid,
    household_id uuid,
    person_id uuid,
    first_name text,
    last_name text,
    email text,
    phone text,
    relationship_type text,
    priority integer,
    status text,
    pickup_authorized boolean,
    sort_key timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        pcr.id,
        pcr.customer_member_id AS child_id,
        pcr.customer_id AS household_id,
        pcr.person_id,
        p.first_name,
        p.last_name,
        -- Contact points are a SEPARATE grant. Without it the columns are NULL at the source,
        -- not removed by a serializer that someone could later forget to apply.
        CASE WHEN p_include_contact THEN p.email END AS email,
        CASE WHEN p_include_contact THEN p.phone END AS phone,
        pcr.relationship_type,
        pcr.priority,
        pcr.status,

        (
            EXISTS (
                SELECT 1 FROM public.person_child_relationship_roles rr
                WHERE rr.relationship_id = pcr.id
                  AND rr.org_id = p_org_id
                  AND rr.role_key = 'authorized_pickup'
                  AND rr.is_active
            )
            AND NOT EXISTS (
                SELECT 1 FROM public.child_safeguarding_restrictions sr
                WHERE sr.org_id = p_org_id
                  AND sr.customer_member_id = pcr.customer_member_id
                  AND sr.status = 'active'
                  AND sr.operational_effect IN ('may_not_pick_up', 'contact_restricted')
                  AND (sr.effective_from IS NULL OR sr.effective_from <= now())
                  AND (sr.effective_to IS NULL OR sr.effective_to >= now())
                  -- Fail closed on an unresolvable party: a restriction that names its subject
                  -- only in free text cannot be proven NOT to name this person, so it removes
                  -- pickup from every relationship on the child.
                  AND (sr.affected_person_id IS NULL OR sr.affected_person_id = pcr.person_id)
            )
        ) AS pickup_authorized,

        COALESCE(pcr.updated_at, pcr.created_at) AS sort_key
    FROM public.person_child_relationships pcr
    JOIN public.persons p
      ON p.id = pcr.person_id AND p.org_id = p_org_id
    WHERE
        pcr.org_id = p_org_id
        -- The edge is visible exactly when its CHILD is. Relationships never widen the people a
        -- caller can see; they describe the people it can already reach.
        AND EXISTS (
            SELECT 1
            FROM public.child_enrollment_agreements ea
            WHERE ea.customer_member_id = pcr.customer_member_id
              AND ea.org_id = p_org_id
              AND (p_boundary_mode = 'org_wide'
                   OR ea.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
        )
        AND (p_child_id IS NULL OR pcr.customer_member_id = p_child_id)
        AND (p_household_id IS NULL OR pcr.customer_id = p_household_id)
        AND (p_updated_since IS NULL OR COALESCE(pcr.updated_at, pcr.created_at) > p_updated_since)
        AND (p_cursor_sort IS NULL
             OR (COALESCE(pcr.updated_at, pcr.created_at), pcr.id) > (p_cursor_sort, p_cursor_id))
    ORDER BY COALESCE(pcr.updated_at, pcr.created_at) ASC, pcr.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

DO $$
DECLARE
    sig text;
BEGIN
    FOREACH sig IN ARRAY ARRAY[
        'public.list_external_children(uuid, uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid, uuid[], text)',
        'public.list_external_households(uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid[])',
        'public.list_external_relationships(uuid, text, uuid[], boolean, integer, timestamptz, uuid, timestamptz, uuid, uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END LOOP;
END
$$;
