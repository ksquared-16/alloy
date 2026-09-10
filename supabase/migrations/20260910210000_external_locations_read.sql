-- Thread 5 Slice B.3 — the first canonical resource an external caller may read.
--
-- ─── WHY THIS IS A FUNCTION AND NOT A QUERY IN THE ROUTE ───
--
-- The installation's boundary is applied HERE, inside the statement that selects
-- the rows. An unauthorized location therefore never enters a result set, which
-- is a stronger property than filtering one out afterwards: pagination cannot
-- leak what the query never returned, and a forged cursor cannot reach past a
-- filter it never sees. Part 7's requirement — "pagination cannot leak records
-- outside the installation boundary" — is satisfied structurally rather than by
-- the adapter remembering.
--
-- ─── WHAT IS PUBLIC, AND WHAT IS NEVER ───
--
-- Only `site` and `unit` rows. `address` is the table's DEFAULT type and those
-- rows are CUSTOMER and VENDOR premises — `locations_owner_xor_check` pairs them
-- with a customer_id or vendor_id. A family's home address, its door code
-- (`access_code`: "Door/gate code when customer selects code-based access"), its
-- access notes and its lat/lng are not organizational locations and have no
-- business on a partner API. They are excluded in SQL, not by a caller
-- remembering to pass a filter.
--
-- ─── HIERARCHY ───
--
-- `public.location_site_id()` is the repository's declared "single
-- site-resolution authority for nested room topology" — a cycle-safe, depth-
-- capped ancestor walk. A boundary naming a site therefore admits the rooms and
-- groups under it, because that is what a site IS in the topology V1 model:
--
--   Site
--   └── Room 1        unit / physical_space
--       └── Toddler 1 unit / operational_group
--   └── Playground    unit / shared_space
--
-- Granting a site while withholding its own rooms would make a site boundary
-- useless for every operational purpose the topology exists to serve. The
-- residual risk is stated in the slice record: authorization then depends on a
-- parent pointer, so re-parenting a room moves who can see it.

CREATE OR REPLACE FUNCTION public.list_external_locations(
    p_org_id uuid,
    p_boundary_mode text,
    p_boundary uuid[],
    p_limit integer,
    p_cursor_sort timestamptz DEFAULT NULL,
    p_cursor_id uuid DEFAULT NULL,
    p_types text[] DEFAULT NULL,
    p_parent_id uuid DEFAULT NULL,
    p_location_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    location_type text,
    unit_role text,
    label text,
    parent_location_id uuid,
    site_id uuid,
    is_active boolean,
    timezone text,
    sort_key timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        l.id,
        l.location_type,
        l.unit_role,
        l.label,
        l.parent_location_id,
        public.location_site_id(l.id) AS site_id,
        l.is_active,
        l.timezone,
        COALESCE(l.updated_at, l.created_at) AS sort_key
    FROM public.locations l
    WHERE
        -- Tenancy. Never negotiable, never from the caller.
        l.org_id = p_org_id

        -- Organizational locations only. Customer and vendor premises are not
        -- public resources at any scope.
        AND l.location_type IN ('site', 'unit')

        -- The installation boundary. An empty restricted list matches nothing,
        -- which is the whole point: a half-provisioned installation fails closed.
        AND (
            p_boundary_mode = 'org_wide'
            OR l.id = ANY (COALESCE(p_boundary, ARRAY[]::uuid[]))
            OR public.location_site_id(l.id) = ANY (COALESCE(p_boundary, ARRAY[]::uuid[]))
        )

        -- Caller filters. Each can only NARROW what the clauses above already
        -- allowed; none of them appears before the boundary.
        AND (p_types IS NULL OR l.location_type = ANY (p_types))
        AND (p_parent_id IS NULL OR l.parent_location_id = p_parent_id)
        AND (p_location_ids IS NULL OR l.id = ANY (p_location_ids))

        -- Keyset pagination on the same (sort_key, id) tuple the ordering uses.
        AND (
            p_cursor_sort IS NULL
            OR (COALESCE(l.updated_at, l.created_at), l.id) > (p_cursor_sort, p_cursor_id)
        )
    ORDER BY COALESCE(l.updated_at, l.created_at) ASC, l.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

REVOKE ALL ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[]) IS
    'Boundary-enforced external read of organizational locations. Tenancy, the installation boundary and the site/unit restriction are applied INSIDE the select, so an unauthorized row never enters a result set and pagination cannot leak one. Customer and vendor premises (location_type = address) are excluded at every scope.';

-- Keyset pagination reads this order on every page.
CREATE INDEX IF NOT EXISTS idx_locations_org_external_keyset
    ON public.locations (org_id, (COALESCE(updated_at, created_at)), id)
    WHERE location_type IN ('site', 'unit');
