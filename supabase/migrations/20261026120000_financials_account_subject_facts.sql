-- ONE ACQUISITION FOR THE ACCOUNT-LIST COHORT.
--
-- ── WHAT THE MEASUREMENT SAID ──────────────────────────────────────────────────────────────────
--
-- Deployed instrumentation at 268fc0770 decomposed the subjects branch into six sequential remote
-- waves over a cohort of TWELVE households: households @122ms, members @243, placements @360,
-- process instances @482, programs @582, rooms @679. Mean 113 ms per wave. Row assembly, measured
-- separately, is 0.2 ms.
--
-- The cost follows the NUMBER OF ROUND TRIPS, not the number of rows. Waves two through six exist
-- only because each read needs ids the previous read returned — and the database already holds
-- those ids. This function asks for all ten fact sets once.
--
-- ── WHAT THIS IS NOT ───────────────────────────────────────────────────────────────────────────
--
-- It is a FACT ACQUISITION SEAM, not a second account-list authority. It returns rows and decides
-- nothing. Every rule that currently lives in the application continues to live there, and the
-- columns those rules read are carried out deliberately so they can:
--
--   * site visibility                 -> isFinancialSubjectVisible (site_location_id is returned)
--   * account membership and order    -> the caller; rows come back ordered (name, id)
--   * the scan cap and `truncated`    -> the caller; see p_scan_cap below
--   * a child's activity              -> childNamesFrom          (is_active is returned)
--   * contact eligibility             -> readContactNames        (role_type, status, end_date)
--   * placement liveness              -> readCurrentPlacements   (status is returned)
--   * program precedence              -> readCurrentPlacements   (intents for EVERY member are
--                                        returned, unfiltered, so the placement-first rule stays
--                                        in the application that owns it)
--   * label fallback (label || key)   -> readCurrentPlacements   (both are returned)
--
-- This is the same transport/meaning boundary financials_account_fact_bundle already holds.
--
-- ── TRUNCATION IS THE CALLER'S VERDICT ─────────────────────────────────────────────────────────
--
-- The household scan returns up to p_scan_cap + 1 rows. The caller slices to the cap and reads the
-- extra row as "there were more", which is exactly what its paged loop concluded before. The
-- function does not decide whether a cohort is complete.
--
-- ── SECURITY ───────────────────────────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER, deliberately, matching the posture of financials_account_fact_bundle. The
-- caller is the route's service-role client; the route has already made the capability decision
-- (fin.read) before it gets here, and no authorization decision is taken inside this function.
-- search_path is pinned. EVERY statement carries its own org predicate, so a call for the wrong
-- org returns empty arrays rather than another tenant's rows. EXECUTE is revoked from PUBLIC and
-- from authenticated and granted only to service_role.
CREATE OR REPLACE FUNCTION public.financials_account_subject_facts(
    p_org_id uuid,
    p_scan_cap integer,
    p_enrollment_process_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cap integer := greatest(coalesce(p_scan_cap, 2000), 0);
    v_households jsonb;
    v_members jsonb;
    v_customer_ids uuid[];
    v_member_ids uuid[];
    v_orphans jsonb;
    v_orphan_member_ids uuid[];
    v_placements jsonb;
    v_intents jsonb;
    v_program_ids uuid[];
    v_room_ids uuid[];
BEGIN
    IF p_org_id IS NULL THEN
        RETURN jsonb_build_object('households', '[]'::jsonb);
    END IF;

    /* 1. The cohort itself, ordered exactly as the paged scan ordered it, one row past the cap. */
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name, c.id), '[]'::jsonb)
      INTO v_households
      FROM (
          SELECT id, name
            FROM public.customers
           WHERE org_id = p_org_id
           ORDER BY name, id
           LIMIT v_cap + 1
      ) c;

    /*
     * The household ids the dependent reads are keyed by: the capped set, NOT the extra row.
     * Derived from the rows already in hand rather than by scanning `customers` a second time —
     * the whole point of this function is that a table is read once.
     */
    SELECT coalesce(array_agg((t.e ->> 'id')::uuid), ARRAY[]::uuid[])
      INTO v_customer_ids
      FROM (
          SELECT e, ord FROM jsonb_array_elements(v_households) WITH ORDINALITY x(e, ord)
      ) t
     WHERE t.ord <= v_cap;

    /* 2. Members, read ONCE. is_active travels so the caller can apply its own rule. */
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id, 'customer_id', m.customer_id,
               'display_name', m.display_name, 'first_name', m.first_name,
               'last_name', m.last_name, 'is_active', m.is_active)), '[]'::jsonb),
           coalesce(array_agg(m.id), ARRAY[]::uuid[])
      INTO v_members, v_member_ids
      FROM public.customer_members m
     WHERE m.org_id = p_org_id AND m.customer_id = ANY (v_customer_ids);

    /* 4. Orphan agreements — those carrying no household id at all. */
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'customer_member_id', a.customer_member_id,
               'site_location_id', a.site_location_id) ORDER BY a.id), '[]'::jsonb)
      INTO v_orphans
      FROM (
          SELECT id, customer_member_id, site_location_id
            FROM public.child_enrollment_agreements
           WHERE org_id = p_org_id AND customer_id IS NULL
           ORDER BY id
           LIMIT v_cap
      ) a;

    SELECT coalesce(array_agg(DISTINCT (e ->> 'customer_member_id')::uuid), ARRAY[]::uuid[])
      INTO v_orphan_member_ids
      FROM jsonb_array_elements(v_orphans) e
     WHERE e ->> 'customer_member_id' IS NOT NULL;

    /* 7. Placements. status travels; liveness is the caller's rule. */
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'customer_member_id', p.customer_member_id,
               'program_category_id', p.program_category_id,
               'room_location_id', p.room_location_id,
               'status', p.status)), '[]'::jsonb)
      INTO v_placements
      FROM public.child_placements p
     WHERE p.org_id = p_org_id AND p.customer_member_id = ANY (v_member_ids);

    /* 8. Enrolment intents for EVERY member, unfiltered: precedence belongs to the caller. */
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'subject_id', i.subject_id,
               'metadata', i.metadata)), '[]'::jsonb)
      INTO v_intents
      FROM public.process_instances i
     WHERE i.org_id = p_org_id
       AND i.process_key = p_enrollment_process_key
       AND i.subject_id = ANY (v_member_ids);

    /* 9/10. Candidate labels: every program or room these facts could name. The caller picks. */
    SELECT coalesce(array_agg(DISTINCT pid), ARRAY[]::uuid[]) INTO v_program_ids
      FROM (
          SELECT (e ->> 'program_category_id')::uuid AS pid FROM jsonb_array_elements(v_placements) e
           WHERE e ->> 'program_category_id' IS NOT NULL
          UNION
          SELECT (e -> 'metadata' ->> 'program_category_id')::uuid FROM jsonb_array_elements(v_intents) e
           WHERE e -> 'metadata' ->> 'program_category_id' IS NOT NULL
      ) s WHERE pid IS NOT NULL;

    SELECT coalesce(array_agg(DISTINCT (e ->> 'room_location_id')::uuid), ARRAY[]::uuid[])
      INTO v_room_ids
      FROM jsonb_array_elements(v_placements) e
     WHERE e ->> 'room_location_id' IS NOT NULL;

    RETURN jsonb_build_object(
        'households', v_households,
        'members', v_members,
        'agreement_sites_direct', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'customer_id', a.customer_id, 'site_location_id', a.site_location_id)), '[]'::jsonb)
              FROM public.child_enrollment_agreements a
             WHERE a.org_id = p_org_id AND a.customer_id = ANY (v_customer_ids)),
        'agreement_sites_orphan', v_orphans,
        'orphan_members', (
            SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'customer_id', m.customer_id)), '[]'::jsonb)
              FROM public.customer_members m
             WHERE m.org_id = p_org_id AND m.id = ANY (v_orphan_member_ids)),
        'contacts', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'customer_id', cp.customer_id, 'role_type', cp.role_type,
                       'status', cp.status, 'end_date', cp.end_date,
                       'first_name', pe.first_name, 'last_name', pe.last_name)), '[]'::jsonb)
              FROM public.customer_persons cp
              LEFT JOIN public.persons pe ON pe.id = cp.person_id AND pe.org_id = p_org_id
             WHERE cp.org_id = p_org_id AND cp.customer_id = ANY (v_customer_ids)),
        'placements', v_placements,
        'enrolment_intents', v_intents,
        'program_labels', (
            SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label, 'key', g.key)), '[]'::jsonb)
              FROM public.location_program_categories g
             WHERE g.org_id = p_org_id AND g.id = ANY (v_program_ids)),
        'room_labels', (
            SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label)), '[]'::jsonb)
              FROM public.locations l
             WHERE l.org_id = p_org_id AND l.id = ANY (v_room_ids))
    );
END;
$$;

COMMENT ON FUNCTION public.financials_account_subject_facts(uuid, integer, text) IS
'Account-list cohort FACT ACQUISITION. Returns the ten row sets the subjects cohort reads, in one '
'round trip instead of six sequential waves, carrying the columns the application rules read '
'(is_active, role_type, status, end_date, placement status, label and key) so that site '
'visibility, membership, the scan cap, contact eligibility, placement liveness, program precedence '
'and label fallback all remain with the application authorities that own them. Decides nothing. '
'SECURITY INVOKER, org-scoped on every statement, service_role only.';

REVOKE ALL ON FUNCTION public.financials_account_subject_facts(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financials_account_subject_facts(uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.financials_account_subject_facts(uuid, integer, text) TO service_role;
