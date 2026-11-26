-- CAN A BILLING-PERIOD-BOUND ECONOMIC FACT RESOLVE TO EXACTLY ONE LOCATION?
--
-- The schema already proves the STOP condition structurally: `charges` carries no `location_id`,
-- `customers` and `customer_members` carry none either, and the only NOT NULL location on this
-- spine is `child_enrollment_agreements.site_location_id`. A `billable_source_type = 'customer'`
-- charge therefore has no location path at all, and the correction-lineage trigger admits exactly
-- two childcare sources — 'enrollment_agreement' and 'customer' — so household grain is canonical
-- rather than accidental.
--
-- What the schema CANNOT say is whether a traversal backfill is available in practice: if no real
-- household has children at two locations, then "resolve a household charge through its members'
-- agreements" is a usable cutover rule. If any household does span locations, that rule has no
-- single answer and the grain decision cannot be deferred to a migration.
--
-- Read-only. Nothing here writes.
--
-- q1  how much of the live economics is household-grain, and therefore locationless
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'billable_source_type', c.billable_source_type,
           'charges', count(*),
           'posted', count(*) FILTER (WHERE c.status <> 'draft' AND c.status <> 'void'),
           'orgs', count(DISTINCT c.org_id)
       )::text AS payload
FROM public.charges c
GROUP BY c.billable_source_type

UNION ALL

-- q2  THE DECIDING QUESTION: households whose children's agreements span more than one location
SELECT 'q2', 'row',
       json_build_object(
           'households_with_agreements', count(*),
           'households_spanning_multiple_locations',
               count(*) FILTER (WHERE location_count > 1),
           'max_locations_on_one_household', coalesce(max(location_count), 0)
       )::text
FROM (
    SELECT cm.customer_id, count(DISTINCT a.site_location_id) AS location_count
      FROM public.child_enrollment_agreements a
      JOIN public.customer_members cm ON cm.id = a.customer_member_id
     WHERE cm.customer_id IS NOT NULL
     GROUP BY cm.customer_id
) spans

UNION ALL

-- q3  household-grain charges that belong to a household which spans locations — the rows for
--     which NO traversal rule can name one location
SELECT 'q3', 'row',
       json_build_object(
           'locationless_charges_on_multi_location_households', count(*)
       )::text
FROM public.charges c
WHERE c.billable_source_type = 'customer'
  AND c.billable_source_id IN (
      SELECT cm.customer_id
        FROM public.child_enrollment_agreements a
        JOIN public.customer_members cm ON cm.id = a.customer_member_id
       WHERE cm.customer_id IS NOT NULL
       GROUP BY cm.customer_id
      HAVING count(DISTINCT a.site_location_id) > 1
  )

UNION ALL

-- q4  reductions that carry no agreement, so inherit no location either
SELECT 'q4', 'row',
       json_build_object(
           'reductions', count(*),
           'without_enrollment_agreement', count(*) FILTER (WHERE r.enrollment_agreement_id IS NULL),
           'without_agreement_and_without_member',
               count(*) FILTER (WHERE r.enrollment_agreement_id IS NULL AND r.customer_member_id IS NULL)
       )::text
FROM public.financial_reduction_applications r

UNION ALL

-- q5  how many distinct locations are actually configured, per org — a single-location tenant makes
--     the grain question moot for that tenant and is worth knowing before a global decision
SELECT 'q5', 'row',
       json_build_object(
           'orgs', count(DISTINCT a.org_id),
           'distinct_site_locations_in_use', count(DISTINCT a.site_location_id)
       )::text
FROM public.child_enrollment_agreements a

ORDER BY 1
