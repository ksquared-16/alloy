-- Thread 5 Slice B.4 — the incremental half of the collection contract.
--
-- B.3 shipped cursor pagination and recorded the gap it left (G-12): a partner
-- could page the whole authorized collection but had no way to ask "what changed
-- since". Closing it before more resources inherit the contract matters, because
-- a resync primitive retro-fitted onto three resources is three migrations and
-- three sets of partner code.
--
-- ─── WHAT THIS IS, AND WHAT IT IS NOT ───
--
-- `updated_since` filters on the SAME watermark the ordering already uses,
-- COALESCE(updated_at, created_at). It composes with the cursor rather than
-- replacing it: a bootstrap pages the collection, records the newest watermark it
-- saw, and later asks for everything after it.
--
-- It does NOT detect deletion. A row removed from `locations` simply stops
-- appearing, and no watermark can announce something that is gone. That gap is
-- real, is documented in the developer guide rather than left for a partner to
-- discover, and is why the guide tells integrators to treat a full bootstrap as
-- the only way to reconcile disappearances.
--
-- The boundary clauses are unchanged and still come first. An incremental read
-- cannot reach a location a full read could not.

CREATE OR REPLACE FUNCTION public.list_external_locations(
    p_org_id uuid,
    p_boundary_mode text,
    p_boundary uuid[],
    p_limit integer,
    p_cursor_sort timestamptz DEFAULT NULL,
    p_cursor_id uuid DEFAULT NULL,
    p_types text[] DEFAULT NULL,
    p_parent_id uuid DEFAULT NULL,
    p_location_ids uuid[] DEFAULT NULL,
    p_updated_since timestamptz DEFAULT NULL
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
        l.org_id = p_org_id
        AND l.location_type IN ('site', 'unit')
        AND (
            p_boundary_mode = 'org_wide'
            OR l.id = ANY (COALESCE(p_boundary, ARRAY[]::uuid[]))
            OR public.location_site_id(l.id) = ANY (COALESCE(p_boundary, ARRAY[]::uuid[]))
        )
        AND (p_types IS NULL OR l.location_type = ANY (p_types))
        AND (p_parent_id IS NULL OR l.parent_location_id = p_parent_id)
        AND (p_location_ids IS NULL OR l.id = ANY (p_location_ids))

        -- STRICTLY GREATER THAN. A caller checkpoints the newest watermark it
        -- received; returning that same row again on the next call would make
        -- every incremental read re-deliver its own boundary row forever. `>=`
        -- would be the safer-looking choice and the wrong one, because the
        -- overlap a partner actually needs is one THEY choose by rewinding their
        -- checkpoint — which the developer guide tells them to do, since
        -- updated_at is wall-clock and not transactionally ordered.
        AND (p_updated_since IS NULL OR COALESCE(l.updated_at, l.created_at) > p_updated_since)

        AND (
            p_cursor_sort IS NULL
            OR (COALESCE(l.updated_at, l.created_at), l.id) > (p_cursor_sort, p_cursor_id)
        )
    ORDER BY COALESCE(l.updated_at, l.created_at) ASC, l.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

REVOKE ALL ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[], timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[], timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[], timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[], timestamptz) TO service_role;

-- The nine-argument form is superseded. Dropping it prevents a caller binding to
-- the old signature and silently losing the incremental filter.
DROP FUNCTION IF EXISTS public.list_external_locations(uuid, text, uuid[], integer, timestamptz, uuid, text[], uuid, uuid[]);
