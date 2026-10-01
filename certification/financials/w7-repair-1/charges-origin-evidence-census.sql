-- WHAT ORIGIN CAN BE EVIDENCED, AND WHERE DOES THE EVIDENCE LIVE?
--
-- The first census answered which columns exist. This answers whether they carry anything a Details
-- surface may say out loud. `job_id` is set on zero rows, every `created_by`-null charge has neither
-- a job nor a source charge, and those rows carry a `source` key in metadata — so the question is
-- whether that key is a canonical origin or a free-text leftover.
--
-- Nothing here writes.
--
-- q1  the dating and origin columns the first census found but did not count
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'rows', count(*),
           'schedule_id_set', count(schedule_id),
           'subscription_id_set', count(subscription_id),
           'charge_template_id_set', count(charge_template_id),
           'due_date_set', count(due_date),
           'occurs_on_set', count(occurs_on),
           'billable_on_set', count(billable_on),
           'posted_at_set', count(posted_at)
       )::text AS payload
FROM public.charges

UNION ALL

-- q2  every distinct metadata `source` value, with how many charges carry it, split by whether a
--     human actor is recorded. This is the only candidate origin evidence that exists.
SELECT 'q2', 'row',
       json_build_object(
           'source', coalesce(metadata->>'source', '(null)'),
           'charges', count(*),
           'created_by_set', count(created_by),
           'created_by_null', count(*) FILTER (WHERE created_by IS NULL)
       )::text
FROM public.charges
GROUP BY coalesce(metadata->>'source', '(null)')

UNION ALL

-- q3  for the charges with no human actor, what else is on the row that could name an origin
SELECT 'q3', 'row',
       json_build_object(
           'source', coalesce(metadata->>'source', '(null)'),
           'charge_type', charge_type,
           'billable_source_type', billable_source_type,
           'schedule_id_set', (schedule_id IS NOT NULL),
           'subscription_id_set', (subscription_id IS NOT NULL),
           'charge_template_id_set', (charge_template_id IS NOT NULL),
           'lifecycle_status', metadata->>'lifecycle_status',
           'charges', count(*)
       )::text
FROM public.charges
WHERE created_by IS NULL
/* GROUP BY the EXPRESSIONS, never by output position: position 3 is the json object, and it
   carries the aggregate — which Postgres refuses, correctly. */
GROUP BY coalesce(metadata->>'source', '(null)'), charge_type, billable_source_type,
         (schedule_id IS NOT NULL), (subscription_id IS NOT NULL),
         (charge_template_id IS NOT NULL), metadata->>'lifecycle_status'

UNION ALL

-- q4  is `due_date` derivable where it is absent?  Stated as the gap it is, not guessed at.
SELECT 'q4', 'row',
       json_build_object(
           'rows', count(*),
           'due_date_set', count(due_date),
           'due_date_null', count(*) FILTER (WHERE due_date IS NULL),
           'due_null_but_billable_set', count(*) FILTER (WHERE due_date IS NULL AND billable_on IS NOT NULL),
           'due_equals_billable', count(*) FILTER (WHERE due_date IS NOT NULL AND due_date = billable_on),
           'due_after_billable', count(*) FILTER (WHERE due_date IS NOT NULL AND billable_on IS NOT NULL AND due_date > billable_on)
       )::text
FROM public.charges

UNION ALL

-- q5  billing period: does the row carry an interval, or only the dates Details would derive one from?
SELECT 'q5', 'row',
       json_build_object('column', column_name, 'type', data_type)::text
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'charges'
  AND (column_name LIKE '%period%' OR column_name LIKE '%interval%'
       OR column_name LIKE '%cycle%' OR column_name LIKE '%_start' OR column_name LIKE '%_end')

ORDER BY 1
