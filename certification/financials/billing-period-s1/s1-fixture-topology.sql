-- WHICH DEPLOYED ACCOUNTS CAN SERVE AS S1 CONFIGURATION FIXTURES?
--
-- The deployed estate already contains exactly the shapes section 5 asks for: single-location
-- households, two households sharing one location, households at different locations, and the three
-- that span two. Using them avoids minting enrolment topology on a shared staging database, and
-- nothing S1 writes is an economic row — a billing_calendar policy and a period row are
-- configuration, and no charge, reduction, payment, journal or Autopay path reads either.
--
-- Read-only. Names are not selected; ids and counts only.
--
-- q1  every household holding live agreements, with its location set and whether it spans
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'customer_id', t.customer_id,
           'location_ids', t.location_ids,
           'location_count', t.location_count,
           'live_agreements', t.live_agreements,
           'spans_locations', (t.location_count > 1)
       )::text AS payload
FROM (
    SELECT cm.customer_id,
           json_agg(DISTINCT a.site_location_id) AS location_ids,
           count(DISTINCT a.site_location_id) AS location_count,
           count(*) AS live_agreements
      FROM public.child_enrollment_agreements a
      JOIN public.customer_members cm ON cm.id = a.customer_member_id
     WHERE cm.customer_id IS NOT NULL
       AND a.status = ANY (ARRAY['pending_start'::text, 'active'::text, 'ending'::text])
       AND (a.end_date IS NULL OR a.end_date >= current_date)
     GROUP BY cm.customer_id
) t

UNION ALL

-- q2  the locations in play, so a calendar can be configured per location
SELECT 'q2', 'row',
       json_build_object(
           'site_location_id', a.site_location_id,
           'org_id', a.org_id,
           'households', count(DISTINCT cm.customer_id)
       )::text
FROM public.child_enrollment_agreements a
JOIN public.customer_members cm ON cm.id = a.customer_member_id
WHERE a.status = ANY (ARRAY['pending_start'::text, 'active'::text, 'ending'::text])
  AND (a.end_date IS NULL OR a.end_date >= current_date)
GROUP BY a.site_location_id, a.org_id

UNION ALL

-- q3  any billing_calendar policy that already exists, so the proof starts from a known state
SELECT 'q3', 'row',
       json_build_object(
           'policy_id', p.id, 'scope_type', p.scope_type, 'location_id', p.location_id,
           'customer_id', p.customer_id, 'value', p.value, 'is_active', p.is_active,
           'effective_start', p.effective_start
       )::text
FROM public.financial_policies p
WHERE p.policy_type = 'billing_calendar'

UNION ALL

-- q4  and that the period table starts EMPTY, so every row the proof produces is the proof's own
SELECT 'q4', 'row',
       json_build_object('existing_billing_periods', count(*))::text
FROM public.financial_billing_periods

ORDER BY 1
