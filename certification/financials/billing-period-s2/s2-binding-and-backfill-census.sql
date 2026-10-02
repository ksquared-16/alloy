-- S2 — ECONOMIC BINDING CENSUS AND HISTORICAL BACKFILL CENSUS.
--
-- Two jobs. First, what each economic table actually carries today, so direct-bind / derive /
-- no-period is decided from the schema rather than from a hypothesis. Second, whether every
-- historical economic row can be assigned a commercial period DETERMINISTICALLY FROM HISTORICAL
-- FACTS — not from the customer's current calendar, not from current location cadence, not from a
-- term anchor, and not from today's override.
--
-- The legacy interpretation under test is the one `placeInBillingPeriod` actually used: a CALENDAR
-- MONTH, taken from the first date the row declares, through the fallback chain
-- billable_on -> occurs_on -> service_date -> created_at, with the basis reported so rows placed by
-- inference are distinguishable from rows placed by declaration.
--
-- Read-only. Nothing here writes.
--
-- q1  what every relevant economic table carries — the direct-bind decision's evidence
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'table', t.tbl,
           'has_customer_id', bool_or(c.column_name = 'customer_id'),
           'has_charge_id', bool_or(c.column_name = 'charge_id'),
           'has_billable_source', bool_or(c.column_name = 'billable_source_id'),
           'has_billing_period_id', bool_or(c.column_name = 'billing_period_id'),
           'period_text_columns', coalesce(json_agg(c.column_name) FILTER (
               WHERE c.column_name IN ('period_key','billing_period_key','billing_period','period_start','period_end')), '[]'::json),
           'date_columns', coalesce(json_agg(c.column_name) FILTER (
               WHERE c.column_name IN ('billable_on','occurs_on','service_date','effective_on','effective_date','due_date')), '[]'::json),
           'total_columns', count(*)
       )::text AS payload
FROM (VALUES ('charges'), ('financial_reduction_applications'), ('resolved_obligations'),
             ('financial_journal_entries'), ('payments'), ('payment_allocations'),
             ('financial_responsibility_allocations')) AS t(tbl)
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public' AND c.table_name = t.tbl
GROUP BY t.tbl

UNION ALL

-- q2  how much live economics exists per table, so the backfill's size is a number
SELECT 'q2', 'row', json_build_object('table', 'charges', 'rows', count(*))::text FROM public.charges
UNION ALL
SELECT 'q2', 'row', json_build_object('table', 'financial_reduction_applications', 'rows', count(*))::text FROM public.financial_reduction_applications
UNION ALL
SELECT 'q2', 'row', json_build_object('table', 'resolved_obligations', 'rows', count(*))::text FROM public.resolved_obligations
UNION ALL
SELECT 'q2', 'row', json_build_object('table', 'financial_journal_entries', 'rows', count(*))::text FROM public.financial_journal_entries
UNION ALL
SELECT 'q2', 'row', json_build_object('table', 'payments', 'rows', count(*))::text FROM public.payments
UNION ALL
SELECT 'q2', 'row', json_build_object('table', 'payment_allocations', 'rows', count(*))::text FROM public.payment_allocations

UNION ALL

-- q3  CAN EVERY CHARGE NAME A CUSTOMER? A commercial period is customer-grain, so a charge that
--     reaches no customer cannot have one. `job` rows are governed by job billing and are exempt
--     from this spine — the correction-lineage trigger says so by admitting only the other two.
SELECT 'q3', 'row',
       json_build_object(
           'billable_source_type', c.billable_source_type,
           'charges', count(*),
           'customer_resolved', count(*) FILTER (WHERE
                 (c.billable_source_type = 'customer' AND c.billable_source_id IS NOT NULL)
              OR (c.billable_source_type = 'enrollment_agreement' AND EXISTS (
                     SELECT 1 FROM public.child_enrollment_agreements a
                      LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                      WHERE a.id = c.billable_source_id
                        AND coalesce(a.customer_id, cm.customer_id) IS NOT NULL))),
           'customer_unresolved', count(*) FILTER (WHERE NOT (
                 (c.billable_source_type = 'customer' AND c.billable_source_id IS NOT NULL)
              OR (c.billable_source_type = 'enrollment_agreement' AND EXISTS (
                     SELECT 1 FROM public.child_enrollment_agreements a
                      LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                      WHERE a.id = c.billable_source_id
                        AND coalesce(a.customer_id, cm.customer_id) IS NOT NULL))))
       )::text
FROM public.charges c
GROUP BY c.billable_source_type

UNION ALL

-- q4  WHICH DATE PLACES EACH CHARGE? A row placed by `created_at` is placed by inference, and the
--     count of those is the honest measure of "insufficient historical information".
SELECT 'q4', 'row',
       json_build_object(
           'basis', CASE WHEN c.billable_on IS NOT NULL THEN 'billable_on'
                         WHEN c.occurs_on IS NOT NULL THEN 'occurs_on'
                         WHEN c.service_date IS NOT NULL THEN 'service_date'
                         ELSE 'created_at' END,
           'charges', count(*),
           'declared', (CASE WHEN c.billable_on IS NOT NULL THEN 'billable_on'
                             WHEN c.occurs_on IS NOT NULL THEN 'occurs_on'
                             WHEN c.service_date IS NOT NULL THEN 'service_date'
                             ELSE 'created_at' END) <> 'created_at'
       )::text
FROM public.charges c
GROUP BY CASE WHEN c.billable_on IS NOT NULL THEN 'billable_on'
              WHEN c.occurs_on IS NOT NULL THEN 'occurs_on'
              WHEN c.service_date IS NOT NULL THEN 'service_date'
              ELSE 'created_at' END

UNION ALL

-- q5  the size of the historical materialisation: distinct (customer, legacy month) pairs
SELECT 'q5', 'row',
       json_build_object(
           'charges_with_a_customer', count(*),
           'distinct_customers', count(DISTINCT h.customer_id),
           'distinct_legacy_periods_needed', count(DISTINCT (h.customer_id::text || ':' || h.legacy_month)),
           'earliest_month', min(h.legacy_month),
           'latest_month', max(h.legacy_month)
       )::text
FROM (
    SELECT CASE WHEN c.billable_source_type = 'customer' THEN c.billable_source_id
                ELSE (SELECT coalesce(a.customer_id, cm.customer_id)
                        FROM public.child_enrollment_agreements a
                        LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                       WHERE a.id = c.billable_source_id) END AS customer_id,
           to_char(coalesce(c.billable_on, c.occurs_on, c.service_date, c.created_at::date), 'YYYY-MM') AS legacy_month
      FROM public.charges c
     WHERE c.billable_source_type = ANY (ARRAY['customer'::text, 'enrollment_agreement'::text])
) h
WHERE h.customer_id IS NOT NULL

UNION ALL

-- q6  THE DECIDING QUESTION. Would a legacy MONTHLY period OVERLAP a canonical period the customer
--     already holds? One customer cannot hold two commercial clocks over the same day — the
--     exclusion constraint certified in S1 refuses it — so any overlap here is a hard blocker, not
--     a preference.
SELECT 'q6', 'row',
       json_build_object(
           'customer_id', h.customer_id,
           'legacy_month', h.legacy_month,
           'legacy_start', h.m_start,
           'legacy_end', h.m_end,
           'collides_with_period_key', p.period_key,
           'collides_cadence', p.cadence,
           'collides_span', (p.starts_on::text || '..' || p.ends_on::text),
           'charges_in_that_month', h.n
       )::text
FROM (
    SELECT customer_id, legacy_month,
           (legacy_month || '-01')::date AS m_start,
           ((legacy_month || '-01')::date + interval '1 month - 1 day')::date AS m_end,
           count(*) AS n
      FROM (
        SELECT CASE WHEN c.billable_source_type = 'customer' THEN c.billable_source_id
                    ELSE (SELECT coalesce(a.customer_id, cm.customer_id)
                            FROM public.child_enrollment_agreements a
                            LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                           WHERE a.id = c.billable_source_id) END AS customer_id,
               to_char(coalesce(c.billable_on, c.occurs_on, c.service_date, c.created_at::date), 'YYYY-MM') AS legacy_month
          FROM public.charges c
         WHERE c.billable_source_type = ANY (ARRAY['customer'::text, 'enrollment_agreement'::text])
      ) x
     WHERE x.customer_id IS NOT NULL
     GROUP BY customer_id, legacy_month
) h
JOIN public.financial_billing_periods p
  ON p.customer_id = h.customer_id
 AND daterange(p.starts_on, p.ends_on, '[]') && daterange(h.m_start, h.m_end, '[]')

UNION ALL

-- q7  and the same question as a single verdict
SELECT 'q7', 'row',
       json_build_object(
           'legacy_periods_colliding_with_canonical', count(*)
       )::text
FROM (
    SELECT h.customer_id, h.legacy_month
      FROM (
        SELECT customer_id, legacy_month,
               (legacy_month || '-01')::date AS m_start,
               ((legacy_month || '-01')::date + interval '1 month - 1 day')::date AS m_end
          FROM (
            SELECT CASE WHEN c.billable_source_type = 'customer' THEN c.billable_source_id
                        ELSE (SELECT coalesce(a.customer_id, cm.customer_id)
                                FROM public.child_enrollment_agreements a
                                LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                               WHERE a.id = c.billable_source_id) END AS customer_id,
                   to_char(coalesce(c.billable_on, c.occurs_on, c.service_date, c.created_at::date), 'YYYY-MM') AS legacy_month
              FROM public.charges c
             WHERE c.billable_source_type = ANY (ARRAY['customer'::text, 'enrollment_agreement'::text])
          ) x
         WHERE x.customer_id IS NOT NULL
         GROUP BY customer_id, legacy_month
      ) h
      JOIN public.financial_billing_periods p
        ON p.customer_id = h.customer_id
       AND daterange(p.starts_on, p.ends_on, '[]') && daterange(h.m_start, h.m_end, '[]')
     GROUP BY h.customer_id, h.legacy_month
) collisions

UNION ALL

-- q8  does the legacy monthly reading AGREE with what the journal historically recorded? The journal
--     is the only place a billing period was ever persisted, so it is the only available witness to
--     what Alloy actually showed.
SELECT 'q8', 'row',
       json_build_object(
           'journal_entries_with_a_billing_period_key', count(*) FILTER (WHERE j.billing_period_key IS NOT NULL),
           'journal_entries_total', count(*),
           'distinct_billing_period_keys', count(DISTINCT j.billing_period_key),
           'non_monthly_shaped_keys', count(*) FILTER (
               WHERE j.billing_period_key IS NOT NULL AND j.billing_period_key !~ '^\d{4}-\d{2}$')
       )::text
FROM public.financial_journal_entries j

UNION ALL

-- q9  reductions: can each one reach a customer, and what period text does it already carry?
SELECT 'q9', 'row',
       json_build_object(
           'reductions', count(*),
           'with_customer_id', count(*) FILTER (WHERE r.customer_id IS NOT NULL),
           'with_charge_id', count(*) FILTER (WHERE r.charge_id IS NOT NULL),
           'with_period_key', count(*) FILTER (WHERE r.period_key IS NOT NULL),
           'non_monthly_period_keys', count(*) FILTER (WHERE r.period_key IS NOT NULL AND r.period_key !~ '^\d{4}-\d{2}$'),
           'distinct_period_keys', count(DISTINCT r.period_key)
       )::text
FROM public.financial_reduction_applications r

ORDER BY 1
