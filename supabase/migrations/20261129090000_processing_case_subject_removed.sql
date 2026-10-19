-- A PROCESSING CASE WHOSE FAMILY OR CHILD NO LONGER EXISTS IS EVIDENCE, NOT WORK.
--
-- Enrollment V0.5 debt closeout (Director authorization). Measured on deployed staging (2026-10-19):
-- 122 Processing cases (121 received, 1 archived) come from Enrollment packet sessions whose household or
-- child was hard-deleted (a certification fixture reset, before 20261128090000 made that impossible).
-- They sat in Incoming as if a family were waiting, and approve "completed" them with nothing to hand off.
--
-- processing_case_subject_removed(case) answers one question from the case's own primary source:
--   a form_packet_session primary source whose crm_snapshot names a household (customer_id) or a child
--   (customer_member_id) that no longer exists in the org, or whose Enrollment journey's child
--   (process_instances.subject_id, subject_type 'child') no longer exists.
-- It is a PostgREST computed field: the read model filters active queues and counts on it in the database
-- (so cursor pages and exact counts stay exact), selects it to label the case, and a route can read it to
-- refuse approve or commit. Nothing is stored and nothing is changed: no table, column, row, status or
-- evidence. A case is "removed" only while its subject is absent — so this is reversible by construction.
--
-- What it never flags: form_submission cases (another source_kind), lead intake (the snapshot names no
-- household), packets outside a journey (process_instance_id null) whose household exists, and an
-- ARCHIVED (is_active = false) child — archived is not removed. A malformed id in the snapshot reads as
-- "not named" (false), never as an error.
--
-- SECURITY DEFINER with a pinned search_path: existence must not depend on what the CALLER may see — a
-- location-restricted operator whose RLS hides a household must not see that household's case as removed.
-- It returns one boolean about a case row the caller has already read. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.processing_case_subject_removed(c public.processing_cases)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
    SELECT EXISTS (
        SELECT 1
        FROM public.processing_case_sources s
        JOIN public.form_packet_sessions f ON f.id = s.source_id AND f.org_id = s.org_id
        LEFT JOIN public.process_instances pi ON pi.id = f.process_instance_id AND pi.org_id = f.org_id
        CROSS JOIN LATERAL (
            SELECT
                CASE WHEN (f.crm_snapshot->>'customer_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     THEN (f.crm_snapshot->>'customer_id')::uuid END AS household_id,
                CASE WHEN (f.crm_snapshot->>'customer_member_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     THEN (f.crm_snapshot->>'customer_member_id')::uuid END AS child_id
        ) snap
        WHERE s.processing_case_id = c.id
          AND s.org_id = c.org_id
          AND s.role = 'primary'
          AND s.source_kind = 'form_packet_session'
          AND (
                (snap.household_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM public.customers x WHERE x.id = snap.household_id AND x.org_id = c.org_id))
             OR (snap.child_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM public.customer_members m WHERE m.id = snap.child_id AND m.org_id = c.org_id))
             OR (pi.subject_type = 'child' AND pi.subject_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM public.customer_members m WHERE m.id = pi.subject_id AND m.org_id = c.org_id))
          )
    );
$fn$;

COMMENT ON FUNCTION public.processing_case_subject_removed(public.processing_cases) IS
    'Processing: true when the case''s primary packet-session source names a household or child that no longer exists — evidence only, never active work. Computed field; stores nothing.';

REVOKE ALL ON FUNCTION public.processing_case_subject_removed(public.processing_cases) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.processing_case_subject_removed(public.processing_cases) FROM anon;
GRANT EXECUTE ON FUNCTION public.processing_case_subject_removed(public.processing_cases) TO authenticated, service_role;
