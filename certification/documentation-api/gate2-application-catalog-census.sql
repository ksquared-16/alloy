-- Is the deployed platform application catalog EMPTY, or was the question never answered?
--
-- The Gate 2 artifact concludes "developer_applications: 0 rows, all statuses". Its census asked
-- that question as `q1_developer_applications`, a 'row'-kind GROUP BY over the table — and an empty
-- table makes a GROUP BY emit nothing at all. The results JSON carries only the four 'scalar'
-- questions (q2, q3, q4, q6); both 'row'-kind questions (q1 and q5) are absent. So the central
-- premise of the follow-on mission rests on an ABSENCE, which reads the same whether the table is
-- empty or the question never produced output.
--
-- A scalar count always emits a row, including when the answer is zero. q1 and q2 below therefore
-- answer the question directly. q3 is a control: it counts a table that is certainly populated, so a
-- zero in q1/q2 cannot be confused with a query that ran against the wrong target or returned
-- nothing at all.
SELECT question_id, kind, payload
FROM (
    SELECT 'q1_developer_applications_total' AS question_id, 'scalar' AS kind,
           count(*)::text AS payload, 1 AS ord
      FROM public.developer_applications

    UNION ALL

    SELECT 'q2_developer_applications_active', 'scalar', count(*)::text, 2
      FROM public.developer_applications
     WHERE status = 'active'

    UNION ALL

    SELECT 'q3_control_orgs_total', 'scalar', count(*)::text, 3
      FROM public.orgs
) q
ORDER BY ord;
