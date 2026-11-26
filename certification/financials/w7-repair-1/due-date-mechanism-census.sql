-- WHO POPULATES charges.due_date, AND IS THE NULL ON THE OTHER 88 ROWS INTENTIONAL?
--
-- The surface says "Due — Configured policy" unconditionally. Measured: due_date is set on 37 of
-- 125 rows. Before any projection is written, this asks what separates the 37 from the 88 — the
-- charge type, the template, the writer, or nothing at all. Policy is NOT inferred from the mere
-- existence of populated rows.
--
-- GROUP BY names expressions, never output positions: position 3 is the json object and it holds
-- the aggregate.
--
-- Nothing here writes.
--
-- q1  the 37 against the 88, split by what the row says about itself
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'charge_type', charge_type,
           'source', coalesce(metadata->>'source', '(null)'),
           'billable_source_type', billable_source_type,
           'has_template', (charge_template_id IS NOT NULL),
           'rows', count(*),
           'due_set', count(due_date),
           'due_null', count(*) FILTER (WHERE due_date IS NULL)
       )::text AS payload
FROM public.charges
GROUP BY charge_type, coalesce(metadata->>'source', '(null)'), billable_source_type,
         (charge_template_id IS NOT NULL)

UNION ALL

-- q2  where a due date exists, what is its offset from billable_on?  A constant offset is a
--     policy; a scatter is not.
SELECT 'q2', 'row',
       json_build_object(
           'offset_days', (due_date - billable_on),
           'charges', count(*),
           'charge_types', count(DISTINCT charge_type)
       )::text
FROM public.charges
WHERE due_date IS NOT NULL AND billable_on IS NOT NULL
GROUP BY (due_date - billable_on)

UNION ALL

-- q3  do two charges of the SAME template disagree about having a due date?  If they do, the
--     due date is not a property of the template.
SELECT 'q3', 'row',
       json_build_object(
           'charge_template_id', charge_template_id,
           'rows', count(*),
           'due_set', count(due_date),
           'due_null', count(*) FILTER (WHERE due_date IS NULL),
           'mixed', (count(due_date) > 0 AND count(*) FILTER (WHERE due_date IS NULL) > 0)
       )::text
FROM public.charges
WHERE charge_template_id IS NOT NULL
GROUP BY charge_template_id

UNION ALL

-- q4  do MANUALLY created charges (a human actor) get a due date at all?  This is the question
--     the Add command's own projection depends on.
SELECT 'q4', 'row',
       json_build_object(
           'human_created', (created_by IS NOT NULL),
           'rows', count(*),
           'due_set', count(due_date),
           'due_null', count(*) FILTER (WHERE due_date IS NULL)
       )::text
FROM public.charges
GROUP BY (created_by IS NOT NULL)

UNION ALL

-- q5  is there any due-date configuration object in the catalog at all, by name?  Absence here is
--     the finding: it means no canonical policy store exists to resolve a date from.
SELECT 'q5', 'row',
       json_build_object('table', t.table_name, 'kind', t.table_type)::text
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND (t.table_name LIKE '%due%' OR t.table_name LIKE '%billing_polic%'
       OR t.table_name LIKE '%payment_term%' OR t.table_name LIKE '%net_term%')

UNION ALL

-- q6  and any due-bearing COLUMN outside charges, which is where a policy would be configured
SELECT 'q6', 'row',
       json_build_object('table', table_name, 'column', column_name, 'type', data_type)::text
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name LIKE '%due%' OR column_name LIKE '%net_term%' OR column_name LIKE '%grace%')
  AND table_name <> 'charges'

ORDER BY 1
