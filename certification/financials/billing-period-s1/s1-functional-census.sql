-- S1 DEPLOYED FUNCTIONAL PROOF — the rows the configuration proof produced, read from the store.
--
-- The API answered; this is the store agreeing. Also carries the two proofs that are facts ABOUT the
-- estate rather than about a response: that term start dates do not move a period boundary, and that
-- nothing economic is wired to the new table.
--
-- q1  every materialized period, with the provenance that says why its bounds are what they are
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'customer_id', p.customer_id,
           'period_key', p.period_key,
           'cadence', p.cadence,
           'starts_on', p.starts_on,
           'ends_on', p.ends_on,
           'days', (p.ends_on - p.starts_on + 1),
           'anchor_on', p.anchor_on,
           'status', p.status,
           'closed_at', p.closed_at,
           'close_actor', p.close_actor,
           'calendar_scope', p.calendar_scope,
           'calendar_policy_id', p.calendar_policy_id,
           'calendar_source_location_id', p.calendar_source_location_id,
           'calendar_snapshot', p.calendar_snapshot
       )::text AS payload
FROM public.financial_billing_periods p

UNION ALL

-- q2  one period per customer per identity, and two periods per configured customer
SELECT 'q2', 'row',
       json_build_object(
           'customers_with_periods', count(DISTINCT p.customer_id),
           'periods_total', count(*),
           'distinct_cadences', count(DISTINCT p.cadence),
           'all_open', (count(*) = count(*) FILTER (WHERE p.status = 'open')),
           'none_closed', (count(*) FILTER (WHERE p.status = 'closed') = 0)
       )::text
FROM public.financial_billing_periods p

UNION ALL

-- q3  TERM START INDEPENDENCE. The two households at the monthly location got identical bounds; this
--     shows their agreements do NOT start on the same day, so the boundary came from the calendar.
SELECT 'q3', 'row',
       json_build_object(
           'customer_id', cm.customer_id,
           'agreement_start_dates', json_agg(DISTINCT a.start_date),
           'distinct_starts', count(DISTINCT a.start_date),
           'site_locations', count(DISTINCT a.site_location_id)
       )::text
FROM public.child_enrollment_agreements a
JOIN public.customer_members cm ON cm.id = a.customer_member_id
WHERE cm.customer_id IN (
          'e1c9afe0-5e8d-4077-904d-bb8e748a4fd4',
          'fcaa839f-6960-4b09-b663-b247b99ea9d9')
  AND a.status = ANY (ARRAY['pending_start'::text, 'active'::text, 'ending'::text])
GROUP BY cm.customer_id

UNION ALL

-- q4  EMPTY PERIODS ARE VALID. No economic row can reference a period, so every materialized period
--     holds zero activity by construction — which is the point: the calendar created them.
SELECT 'q4', 'row',
       json_build_object(
           'inbound_foreign_keys_to_billing_periods', count(*),
           'referencing_tables', coalesce(json_agg(DISTINCT c.conrelid::regclass::text), '[]'::json)
       )::text
FROM pg_constraint c
WHERE c.contype = 'f' AND c.confrelid = 'public.financial_billing_periods'::regclass

UNION ALL

-- q5  SIDE-EFFECT FREE. No economic table gained a billing-period column.
SELECT 'q5', 'row',
       json_build_object(
           'table', t.table_name,
           'billing_period_columns', count(*) FILTER (WHERE col.column_name LIKE '%billing_period%')
       )::text
FROM (VALUES ('charges'), ('financial_reduction_applications'), ('financial_journal_entries'),
             ('payments'), ('payment_allocations'), ('resolved_obligations')) AS t(table_name)
LEFT JOIN information_schema.columns col
       ON col.table_schema = 'public' AND col.table_name = t.table_name
GROUP BY t.table_name

UNION ALL

-- q6  the billing_calendar policies the proof authored, and that no OTHER policy type was disturbed
SELECT 'q6', 'row',
       json_build_object(
           'policy_type', p.policy_type,
           'rows', count(*),
           'scopes', json_agg(DISTINCT p.scope_type)
       )::text
FROM public.financial_policies p
GROUP BY p.policy_type

ORDER BY 1
