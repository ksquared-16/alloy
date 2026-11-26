-- DID THE FIFTH ANSWER ARRIVE, AND DID THE FOUR THAT EXISTED SURVIVE IT?
--
-- A widened CHECK is easy to get wrong in the direction that matters least visibly: the new value
-- is accepted, and an old one quietly stops being. These questions ask the catalog itself rather
-- than trusting the apply's own report.
--
-- Nothing here writes. The acceptance store is observation, never participation.
--
-- q1  the vocabulary the constraint now admits, read off the constraint
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object('check_clause', pg_get_constraintdef(c.oid))::text AS payload
FROM pg_constraint c
WHERE c.conrelid = 'public.qa_director_acceptance_results'::regclass
  AND c.conname = 'qa_director_acceptance_results_result_check'

UNION ALL

-- q2  a deferral must say why — the second constraint, which is what stops it being a skip
SELECT 'q2', 'row',
       json_build_object('present', count(*) > 0,
                         'check_clause', coalesce(max(pg_get_constraintdef(c.oid)), 'absent'))::text
FROM pg_constraint c
WHERE c.conrelid = 'public.qa_director_acceptance_results'::regclass
  AND c.conname = 'qa_director_acceptance_deferral_is_explained'

UNION ALL

-- q3  and the failure taxonomy still applies only to failures, never to a deferral
SELECT 'q3', 'row',
       json_build_object('check_clause', coalesce(max(pg_get_constraintdef(c.oid)), 'absent'))::text
FROM pg_constraint c
WHERE c.conrelid = 'public.qa_director_acceptance_results'::regclass
  AND c.conname = 'qa_director_acceptance_failure_is_explained'

UNION ALL

-- q4  every answer already recorded, by value. None may have been rewritten or invalidated.
SELECT 'q4', 'row',
       json_build_object(
           'total', count(*),
           'pass', count(*) FILTER (WHERE result = 'pass'),
           'fail', count(*) FILTER (WHERE result = 'fail'),
           'blocked', count(*) FILTER (WHERE result = 'blocked'),
           'not_run', count(*) FILTER (WHERE result = 'not_run'),
           'deferred', count(*) FILTER (WHERE result = 'deferred'),
           'suites', coalesce(string_agg(DISTINCT suite_key, ','), 'none')
       )::text
FROM public.qa_director_acceptance_results

UNION ALL

-- q5  the ledger agrees the migration ran
SELECT 'q5', 'row',
       json_build_object('version_present', count(*) > 0)::text
FROM supabase_migrations.schema_migrations
WHERE version = '20261112120000';
