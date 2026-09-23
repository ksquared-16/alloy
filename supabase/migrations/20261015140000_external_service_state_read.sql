-- Thread 7 Core Resource Expansion — Groups 2 and 3: service state and staff.
--
-- Four synchronised collections and one derived projection. All five apply the installation's
-- authority inside the select; none takes a tenant from the caller.
--
-- ─── THE DISTINCTIONS THE DOMAIN KEEPS, KEPT ───
--
-- Enrollment agreement, placement and schedule assignment are three different commitments and
-- three separate resources. An agreement says a child is enrolled at a site from a date. A
-- placement says which room, from when, superseding the placement before it. A schedule assignment
-- says which recurring pattern applies. Collapsing them would be smaller and would lose the ability
-- to answer any of the three questions precisely.
--
-- ─── SCHEDULES ARE PERSISTED; THE DAY VIEW IS NOT ───
--
-- Earlier Thread 7 wording said schedules are never persisted. That was too broad and is corrected
-- here in the authority itself: `schedule_assignments` is effective-dated committed truth and
-- synchronises like any other collection. What is derived is the DATED view — "who is expected on
-- Tuesday" — which `project_external_schedule_days` computes from those rows and the pattern's
-- weekdays. It returns no sort key and no watermark, because a generated row has no change clock
-- and inventing one would be the single thing the exact-sync law forbids.
--
-- ─── SCHEDULE ASSIGNMENTS ARE POLYMORPHIC, AND THAT IS A BOUNDARY HAZARD ───
--
-- `schedule_assignments.subject_type` is 'child' or 'staff'. A read that forgot the filter would
-- publish staff schedules to a caller holding only a child scope. The filter is therefore part of
-- the contract and lives here beside the boundary, not in a handler where it could be omitted.

-- ── ENROLLMENTS ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_external_enrollments(
    p_org_id uuid, p_boundary_mode text, p_site_ids uuid[], p_limit integer,
    p_cursor_sort timestamptz DEFAULT NULL, p_cursor_id uuid DEFAULT NULL,
    p_updated_since timestamptz DEFAULT NULL,
    p_child_id uuid DEFAULT NULL, p_site_id uuid DEFAULT NULL, p_status text DEFAULT NULL
)
RETURNS TABLE (
    id uuid, child_id uuid, household_id uuid, site_location_id uuid,
    status text, start_date date, end_date date, sort_key timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    -- Absent on purpose: opportunity_id and opportunity_customer_member_id (sales pipeline
    -- internals), activation_policy_key and source_key (operator machinery), created_by/updated_by
    -- (internal actor identity), metadata (unbounded and uncontrolled).
    SELECT ea.id, ea.customer_member_id, ea.customer_id, ea.site_location_id,
           ea.status, ea.start_date, ea.end_date,
           COALESCE(ea.updated_at, ea.created_at)
    FROM public.child_enrollment_agreements ea
    WHERE ea.org_id = p_org_id
      AND (p_boundary_mode = 'org_wide' OR ea.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
      AND (p_child_id IS NULL OR ea.customer_member_id = p_child_id)
      AND (p_site_id IS NULL OR ea.site_location_id = p_site_id)
      AND (p_status IS NULL OR ea.status = p_status)
      AND (p_updated_since IS NULL OR COALESCE(ea.updated_at, ea.created_at) > p_updated_since)
      AND (p_cursor_sort IS NULL OR (COALESCE(ea.updated_at, ea.created_at), ea.id) > (p_cursor_sort, p_cursor_id))
    ORDER BY COALESCE(ea.updated_at, ea.created_at) ASC, ea.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

-- ── PLACEMENTS ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_external_placements(
    p_org_id uuid, p_boundary_mode text, p_site_ids uuid[], p_limit integer,
    p_cursor_sort timestamptz DEFAULT NULL, p_cursor_id uuid DEFAULT NULL,
    p_updated_since timestamptz DEFAULT NULL,
    p_child_id uuid DEFAULT NULL, p_site_id uuid DEFAULT NULL,
    p_room_id uuid DEFAULT NULL, p_status text DEFAULT NULL
)
RETURNS TABLE (
    id uuid, enrollment_id uuid, child_id uuid, site_location_id uuid,
    room_location_id uuid, program_category_id uuid, status text,
    start_date date, end_date date, supersedes_placement_id uuid, sort_key timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    -- `room_location_id` is a Location id from the topology `GET /api/v1/locations` already
    -- publishes, so a partner resolves the room through the resource it already syncs rather than
    -- through a second room vocabulary. Internal keys such as the cohort key are not published.
    SELECT cp.id, cp.enrollment_agreement_id, cp.customer_member_id, cp.site_location_id,
           cp.room_location_id, cp.program_category_id, cp.status,
           cp.start_date, cp.end_date, cp.supersedes_placement_id,
           COALESCE(cp.updated_at, cp.created_at)
    FROM public.child_placements cp
    WHERE cp.org_id = p_org_id
      AND (p_boundary_mode = 'org_wide' OR cp.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
      AND (p_child_id IS NULL OR cp.customer_member_id = p_child_id)
      AND (p_site_id IS NULL OR cp.site_location_id = p_site_id)
      AND (p_room_id IS NULL OR cp.room_location_id = p_room_id)
      AND (p_status IS NULL OR cp.status = p_status)
      AND (p_updated_since IS NULL OR COALESCE(cp.updated_at, cp.created_at) > p_updated_since)
      AND (p_cursor_sort IS NULL OR (COALESCE(cp.updated_at, cp.created_at), cp.id) > (p_cursor_sort, p_cursor_id))
    ORDER BY COALESCE(cp.updated_at, cp.created_at) ASC, cp.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

-- ── SCHEDULE ASSIGNMENTS ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_external_schedule_assignments(
    p_org_id uuid, p_boundary_mode text, p_site_ids uuid[], p_limit integer,
    p_cursor_sort timestamptz DEFAULT NULL, p_cursor_id uuid DEFAULT NULL,
    p_updated_since timestamptz DEFAULT NULL,
    p_child_id uuid DEFAULT NULL, p_site_id uuid DEFAULT NULL, p_status text DEFAULT NULL
)
RETURNS TABLE (
    id uuid, enrollment_id uuid, child_id uuid, site_location_id uuid, room_location_id uuid,
    schedule_pattern_id uuid, pattern_label text, schedule_type_key text, weekdays integer[],
    status text, commitment_kind text, is_primary boolean,
    start_date date, end_date date, supersedes_assignment_id uuid, sort_key timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT sa.id, sa.enrollment_agreement_id, sa.customer_member_id, sa.site_location_id,
           sa.room_location_id, sa.schedule_pattern_id, sp.label, sp.schedule_type_key, sp.weekdays,
           sa.status, sa.commitment_kind, sa.is_primary,
           sa.start_date, sa.end_date, sa.supersedes_assignment_id,
           COALESCE(sa.updated_at, sa.created_at)
    FROM public.schedule_assignments sa
    LEFT JOIN public.schedule_patterns sp ON sp.id = sa.schedule_pattern_id AND sp.org_id = p_org_id
    WHERE sa.org_id = p_org_id
      -- NOT OPTIONAL. Staff assignments live in this same table.
      AND sa.subject_type = 'child'
      AND (p_boundary_mode = 'org_wide' OR sa.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
      AND (p_child_id IS NULL OR sa.customer_member_id = p_child_id)
      AND (p_site_id IS NULL OR sa.site_location_id = p_site_id)
      AND (p_status IS NULL OR sa.status = p_status)
      AND (p_updated_since IS NULL OR COALESCE(sa.updated_at, sa.created_at) > p_updated_since)
      AND (p_cursor_sort IS NULL OR (COALESCE(sa.updated_at, sa.created_at), sa.id) > (p_cursor_sort, p_cursor_id))
    ORDER BY COALESCE(sa.updated_at, sa.created_at) ASC, sa.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

-- ── DATED SCHEDULE PROJECTION (DERIVED) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_external_schedule_days(
    p_org_id uuid, p_boundary_mode text, p_site_ids uuid[],
    p_from date, p_to date,
    p_child_id uuid DEFAULT NULL, p_site_id uuid DEFAULT NULL
)
RETURNS TABLE (
    date date, weekday integer, child_id uuid, site_location_id uuid, room_location_id uuid,
    schedule_assignment_id uuid, schedule_pattern_id uuid, schedule_type_key text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    -- Derived, and deliberately shaped so it cannot be mistaken for a synchronised collection:
    -- no id, no sort key, no watermark. The caller names a closed date window and gets the days
    -- that window implies, computed from committed assignments and their patterns.
    --
    -- Deterministic by construction: the same window over the same committed authority yields the
    -- same rows in the same order, because the ordering is total over (date, child, assignment).
    SELECT d::date,
           EXTRACT(DOW FROM d)::integer,
           sa.customer_member_id, sa.site_location_id, sa.room_location_id,
           sa.id, sa.schedule_pattern_id, sp.schedule_type_key
    FROM public.schedule_assignments sa
    JOIN public.schedule_patterns sp
      ON sp.id = sa.schedule_pattern_id AND sp.org_id = p_org_id
    CROSS JOIN LATERAL generate_series(
        GREATEST(p_from, sa.start_date)::timestamp,
        LEAST(p_to, COALESCE(sa.end_date, p_to))::timestamp,
        interval '1 day'
    ) AS d
    WHERE sa.org_id = p_org_id
      AND sa.subject_type = 'child'
      AND sa.status IN ('active', 'planned')
      AND (p_boundary_mode = 'org_wide' OR sa.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
      AND (p_child_id IS NULL OR sa.customer_member_id = p_child_id)
      AND (p_site_id IS NULL OR sa.site_location_id = p_site_id)
      AND EXTRACT(DOW FROM d)::integer = ANY (COALESCE(sp.weekdays, ARRAY[]::integer[]))
    ORDER BY d::date ASC, sa.customer_member_id ASC, sa.id ASC;
$$;

-- ── STAFF (COMPOSED PROJECTION) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_external_staff(
    p_org_id uuid, p_boundary_mode text, p_site_ids uuid[], p_include_contact boolean,
    p_limit integer, p_cursor_sort timestamptz DEFAULT NULL, p_cursor_id uuid DEFAULT NULL,
    p_updated_since timestamptz DEFAULT NULL,
    p_site_id uuid DEFAULT NULL, p_employment_status text DEFAULT NULL
)
RETURNS TABLE (
    id uuid, person_id uuid, external_employee_id text, badge_number text,
    first_name text, last_name text, email text, phone text,
    employment_status text, employment_type text, position_label text,
    primary_location_id uuid, start_date date, end_date date, sort_key timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    -- Staff is a PROJECTION over Person and Employment, not a new identity. The external id is the
    -- employment id; the person is reached through it. No staff table is created and none exists.
    --
    -- Compensation lives in `employment_compensation_terms` and is never joined here, so pay is
    -- not exposable through this resource rather than merely forbidden. Nothing selects payroll,
    -- tax, HR notes, safeguarding, medical facts or internal access grants.
    SELECT e.id, e.person_id, e.external_employee_id, e.badge_number,
           p.first_name, p.last_name,
           CASE WHEN p_include_contact THEN p.email END,
           CASE WHEN p_include_contact THEN p.phone END,
           e.employment_status, e.employment_type, pos.label,
           e.primary_location_id, e.start_date, e.end_date,
           COALESCE(e.updated_at, e.created_at)
    FROM public.employments e
    JOIN public.persons p ON p.id = e.person_id AND p.org_id = p_org_id
    LEFT JOIN public.employment_positions pos ON pos.id = e.position_id AND pos.org_id = p_org_id
    WHERE e.org_id = p_org_id
      -- Employment is organization-scoped; visibility is not. A staff member with no primary
      -- location is invisible, the same fail-closed rule the children use.
      AND e.primary_location_id IS NOT NULL
      AND (p_boundary_mode = 'org_wide' OR e.primary_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
      AND (p_site_id IS NULL OR e.primary_location_id = p_site_id)
      AND (p_employment_status IS NULL OR e.employment_status = p_employment_status)
      AND (p_updated_since IS NULL OR COALESCE(e.updated_at, e.created_at) > p_updated_since)
      AND (p_cursor_sort IS NULL OR (COALESCE(e.updated_at, e.created_at), e.id) > (p_cursor_sort, p_cursor_id))
    ORDER BY COALESCE(e.updated_at, e.created_at) ASC, e.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

DO $$
DECLARE sig text;
BEGIN
    FOREACH sig IN ARRAY ARRAY[
        'public.list_external_enrollments(uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid, uuid, text)',
        'public.list_external_placements(uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid, uuid, uuid, text)',
        'public.list_external_schedule_assignments(uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid, uuid, text)',
        'public.project_external_schedule_days(uuid, text, uuid[], date, date, uuid, uuid)',
        'public.list_external_staff(uuid, text, uuid[], boolean, integer, timestamptz, uuid, timestamptz, uuid, text)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END LOOP;
END
$$;
