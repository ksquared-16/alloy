-- Thread 7 post-closeout hardening — the external child visibility LIFECYCLE law.
--
-- ─── THE DEFECT ───
--
-- `20261015130000_external_people_read.sql` made a child externally visible whenever an enrollment
-- agreement EXISTED at a reachable site. It never looked at the agreement's status. So a family
-- that signed, then withdrew before their child ever attended a single day, stayed published on the
-- public API — name, household, and every relationship edge — indefinitely. Hosted certification
-- measured exactly that: an agreement moved to `canceled` and `GET /api/v1/children` still returned
-- the child with `status: active`.
--
-- ─── WHY `canceled` IS THE ONE STATE THAT MUST NOT CONFER VISIBILITY ───
--
-- The canonical vocabulary is `pending_start | active | ending | ended | canceled`. `canceled` is
-- not a general-purpose terminal state: `cancelAgreementBeforeStart` is its ONLY writer and it
-- refuses any agreement whose status is not `pending_start`. So `canceled` carries a single,
-- provable meaning — **service was committed and then withdrawn before it ever began**. No
-- attendance, no placement history, no operational fact was ever created under it.
--
-- `ended` is the opposite kind of terminal. Service happened and concluded. Attendance rows,
-- invoices and incident records reference that child by id, and a partner reconciling last term's
-- attendance must still be able to resolve who the id belongs to. Dropping `ended` children would
-- orphan history that Alloy itself published.
--
-- So the law is NOT "currently in service" and NOT "the agreement exists". It is:
--
--     A child is externally visible when a service commitment exists that was not withdrawn
--     before service began.
--
-- which is exactly `status <> 'canceled'`. `pending_start` is included deliberately: it is a
-- committed agreement, partners need the roster before the first day, and admitting a child only
-- at midnight on their start date would be a worse sync contract than admitting them on signature.
--
-- ─── ONE LAW, NOT THREE FILTERS ───
--
-- The predicate was physically duplicated in `list_external_children`, `list_external_households`
-- and `list_external_relationships` — three copies that a future edit could drift apart, which is
-- the precise shape of the bug being repaired. It is replaced here by ONE function that all three
-- call. `list_external_relationships` is deliberately NOT special-cased: its own comment already
-- says "the edge is visible exactly when its CHILD is", and that promise is now mechanical.
--
-- ─── WHY THE AGREEMENT-GRAIN READS ARE LEFT ALONE ───
--
-- `list_external_enrollments` still returns `canceled` rows, on purpose. Visibility CAN now end —
-- a `pending_start` child who is cancelled leaves `/api/v1/children` — and a partner must be able
-- to learn that safely rather than watch a record silently vanish. The enrollment IS the lifecycle
-- record: `child_enrollment_agreements` carries a `set_updated_at` trigger, so cancellation bumps
-- `updated_at` and a partner polling `/api/v1/enrollments?updated_since=...` observes the row turn
-- `canceled` on its normal sync pass. Filtering it there too would remove the only observable
-- terminal signal and produce exactly the silent disappearance this migration exists to avoid.

-- ─── THE SINGLE ELIGIBILITY PREDICATE ───
--
-- Plain STABLE SQL (not SECURITY DEFINER): it is called from inside the SECURITY DEFINER readers
-- and must execute with their authority, not acquire its own. Postgres inlines a scalar SQL
-- function of this shape, so the three readers keep the plan they had.
CREATE OR REPLACE FUNCTION public.external_child_service_commitment_exists(
    p_org_id uuid,
    p_customer_member_id uuid,
    p_boundary_mode text,
    p_site_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.child_enrollment_agreements ea
        WHERE ea.customer_member_id = p_customer_member_id
          AND ea.org_id = p_org_id
          -- Withdrawn before service began. Never a participant, so never published.
          AND ea.status <> 'canceled'
          AND (p_boundary_mode = 'org_wide'
               OR ea.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
    );
$$;

REVOKE ALL ON FUNCTION public.external_child_service_commitment_exists(uuid, uuid, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.external_child_service_commitment_exists(uuid, uuid, text, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.external_child_service_commitment_exists(uuid, uuid, text, uuid[]) FROM authenticated;

COMMENT ON FUNCTION public.external_child_service_commitment_exists(uuid, uuid, text, uuid[]) IS
    'The single external visibility law for person-grain public resources: a child is visible when a service commitment exists at a reachable site that was not withdrawn before service began (status <> canceled). Called by list_external_children, list_external_households and list_external_relationships — never duplicate this predicate.';


-- ─── THE THREE READERS, REPOINTED AT THE SHARED LAW ───
-- Signatures are unchanged, so no grant, no route and no caller moves.

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
        -- ONE law, shared with households and relationships. See
        -- external_child_service_commitment_exists: a commitment withdrawn before service began
        -- (`canceled`) never publishes a child; a commitment that was served and ended still does.
        AND public.external_child_service_commitment_exists(
                p_org_id, cm.id, p_boundary_mode, p_site_ids)
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
        -- A household is an anchor for visible children, so it inherits the SAME law. A family
        -- whose only agreement was withdrawn before service began is not a customer to publish.
        AND EXISTS (
            SELECT 1
            FROM public.customer_members cm
            WHERE cm.customer_id = c.id
              AND cm.org_id = p_org_id
              AND public.external_child_service_commitment_exists(
                      p_org_id, cm.id, p_boundary_mode, p_site_ids)
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
        AND public.external_child_service_commitment_exists(
                p_org_id, pcr.customer_member_id, p_boundary_mode, p_site_ids)
        AND (p_child_id IS NULL OR pcr.customer_member_id = p_child_id)
        AND (p_household_id IS NULL OR pcr.customer_id = p_household_id)
        AND (p_updated_since IS NULL OR COALESCE(pcr.updated_at, pcr.created_at) > p_updated_since)
        AND (p_cursor_sort IS NULL
             OR (COALESCE(pcr.updated_at, pcr.created_at), pcr.id) > (p_cursor_sort, p_cursor_id))
    ORDER BY COALESCE(pcr.updated_at, pcr.created_at) ASC, pcr.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

-- ─── GUARD ───
--
-- The defect was three copies of one predicate drifting. Assert mechanically that all three
-- readers now route through the shared law and that none of them still carries its own inline
-- agreement lookup, so a future edit that reintroduces a private copy fails the migration rather
-- than quietly republishing withdrawn families.
DO $$
DECLARE
    fn text;
    def text;
BEGIN
    IF to_regprocedure('public.external_child_service_commitment_exists(uuid, uuid, text, uuid[])') IS NULL THEN
        RAISE EXCEPTION 'shared visibility predicate is missing';
    END IF;

    FOREACH fn IN ARRAY ARRAY[
        'public.list_external_children(uuid, uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid, uuid[], text)',
        'public.list_external_households(uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid[])',
        'public.list_external_relationships(uuid, text, uuid[], boolean, integer, timestamptz, uuid, timestamptz, uuid, uuid)'
    ]
    LOOP
        def := pg_get_functiondef(to_regprocedure(fn));
        IF def NOT LIKE '%external_child_service_commitment_exists%' THEN
            RAISE EXCEPTION '% does not use the shared visibility law', fn;
        END IF;
        IF def LIKE '%FROM public.child_enrollment_agreements%' THEN
            RAISE EXCEPTION '% still carries a private copy of the eligibility predicate', fn;
        END IF;
    END LOOP;
END
$$;
