-- DOES KELLY'S W7 TESTIMONY SURVIVE THE REPAIR THAT ANSWERS IT?
--
-- An acceptance is testimony about the build it was given. Repair Batch 1 deployed a NEW revision,
-- and the one thing a repair may never do is reach back and rewrite the evidence that motivated it.
-- `add_charge_honours_review_boundary` was answered FAIL / PRODUCT_DEFECT against the prior build;
-- it must still read FAIL, still carry its classification and the tester's own words, and still be
-- bound to the revision it was about — not silently promoted to a pass by the deploy.
--
-- Nothing here writes. The acceptance store is observation, never participation.
--
-- q1  the scenario Kelly answered, in full, every row it has ever had
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'result', r.result,
           'classification', coalesce(r.classification, 'none'),
           'deployed_revision', r.deployed_revision,
           'environment', r.environment,
           'scenario_definition_version', r.scenario_definition_version,
           'has_observation', (r.observation IS NOT NULL AND length(btrim(r.observation)) > 0),
           'observation_chars', coalesce(length(r.observation), 0),
           'recorded_at', r.created_at
       )::text AS payload
FROM public.qa_director_acceptance_results r
WHERE r.scenario_key = 'add_charge_honours_review_boundary'

UNION ALL

-- q2  the preservation question stated as an answer, not left to a reader to compute:
--     is there any PASS for this scenario, on any build?  There must not be.
SELECT 'q2', 'row',
       json_build_object(
           'rows_total', count(*),
           'fail_rows', count(*) FILTER (WHERE result = 'fail'),
           'pass_rows', count(*) FILTER (WHERE result = 'pass'),
           'product_defect_rows', count(*) FILTER (WHERE classification = 'PRODUCT_DEFECT'),
           'distinct_revisions', count(DISTINCT deployed_revision),
           'preserved', (count(*) FILTER (WHERE result = 'fail' AND classification = 'PRODUCT_DEFECT') >= 1
                         AND count(*) FILTER (WHERE result = 'pass') = 0)
       )::text
FROM public.qa_director_acceptance_results
WHERE scenario_key = 'add_charge_honours_review_boundary'

UNION ALL

-- q3  the whole W7 suite by result, so "44 scenarios, zero advanced" stays checkable
SELECT 'q3', 'row',
       json_build_object(
           'suite_key', suite_key,
           'answered', count(*),
           'pass', count(*) FILTER (WHERE result = 'pass'),
           'fail', count(*) FILTER (WHERE result = 'fail'),
           'blocked', count(*) FILTER (WHERE result = 'blocked'),
           'not_run', count(*) FILTER (WHERE result = 'not_run')
       )::text
FROM public.qa_director_acceptance_results
GROUP BY suite_key

UNION ALL

-- q4  which revisions the store holds testimony about, and how many rows each carries.
--     A repair that rewrote history in place would show one revision where there were two.
SELECT 'q4', 'row',
       json_build_object('deployed_revision', deployed_revision, 'rows', count(*))::text
FROM public.qa_director_acceptance_results
GROUP BY deployed_revision

UNION ALL

-- q5  every scenario that is not a pass, so the repair batch can be aimed at the real list
SELECT 'q5', 'row',
       json_build_object(
           'scenario_key', scenario_key,
           'result', result,
           'classification', coalesce(classification, 'none'),
           'deployed_revision', deployed_revision
       )::text
FROM public.qa_director_acceptance_results
WHERE result <> 'pass'
ORDER BY 1
