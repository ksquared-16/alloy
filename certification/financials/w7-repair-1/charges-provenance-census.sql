-- WHAT CAN LEDGER DETAILS TRUTHFULLY SAY ABOUT A CHARGE TODAY?
--
-- Discovery before model change. The instruction names provenance dimensions to project; some of
-- them may simply not be stored, and a Details surface that infers an origin it cannot evidence is
-- the fabrication this whole surface is written against. So the catalog is asked first, and the
-- population is asked second — a column that exists but is null on every row answers nothing.
--
-- Nothing here writes.
--
-- q1  every column `charges` actually has, with type and nullability
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable)::text AS payload
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'charges'

UNION ALL

-- q2  the requested provenance dimensions, each answered present/absent by name.
--     Absence is the finding here, not an error.
SELECT 'q2', 'row',
       json_build_object('requested', d.name, 'exists', (c.column_name IS NOT NULL))::text
FROM (VALUES
        ('created_by'), ('created_at'), ('updated_by'), ('updated_at'),
        ('posted_by'), ('posted_at'), ('job_id'), ('source_charge_id'),
        ('schedule_id'), ('subscription_id'), ('enrollment_agreement_id'),
        ('charge_template_id'), ('template_id'), ('due_date'), ('occurs_on'),
        ('billable_on'), ('service_date'), ('metadata'), ('billable_source_type'),
        ('billable_source_id'), ('charge_category'), ('charge_type'), ('status'),
        ('amount_cents'), ('currency_code'), ('org_id')
     ) AS d(name)
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public' AND c.table_name = 'charges' AND c.column_name = d.name

UNION ALL

-- q3  population of the provenance columns that DO exist — a column that is always null
--     cannot carry a Details line, however well typed it is
SELECT 'q3', 'row',
       json_build_object(
           'rows', count(*),
           'created_by_set', count(created_by),
           'posted_by_set', count(posted_by),
           'updated_by_set', count(updated_by),
           'job_id_set', count(job_id),
           'source_charge_id_set', count(source_charge_id),
           'due_date_set', count(due_date),
           'service_date_set', count(service_date),
           'metadata_non_empty', count(*) FILTER (WHERE metadata IS NOT NULL AND metadata::text NOT IN ('{}', 'null'))
       )::text
FROM public.charges

UNION ALL

-- q4  what a null `created_by` co-occurs with. This is the question that decides whether
--     "system generated" can ever be narrowed to a named origin from stored evidence alone.
SELECT 'q4', 'row',
       json_build_object(
           'created_by_null', count(*),
           'with_job_id', count(job_id),
           'with_source_charge_id', count(source_charge_id),
           'with_neither', count(*) FILTER (WHERE job_id IS NULL AND source_charge_id IS NULL),
           'distinct_metadata_keys', (
               SELECT coalesce(json_agg(DISTINCT k)::text, '[]')
               FROM public.charges c2, jsonb_object_keys(coalesce(c2.metadata, '{}'::jsonb)) AS k
               WHERE c2.created_by IS NULL
           )
       )::text
FROM public.charges
WHERE created_by IS NULL

UNION ALL

-- q5  the tables Details would have to join for responsibility, reductions and accounting —
--     present or absent, by name
SELECT 'q5', 'row',
       json_build_object('table', t.name, 'exists', (c.table_name IS NOT NULL))::text
FROM (VALUES
        ('financial_responsibility_arrangements'),
        ('financial_responsibility_allocations'),
        ('financial_reductions'),
        ('financial_reduction_applications'),
        ('charge_discount_applications'),
        ('financial_journal_entries'),
        ('ledger_transactions'),
        ('charge_templates')
     ) AS t(name)
LEFT JOIN information_schema.tables c
       ON c.table_schema = 'public' AND c.table_name = t.name

UNION ALL

-- q6  the two Alvarez-shaped rows Kelly read as duplicates: the same label at two grains.
--     Read-only, and deliberately not naming the household — the GRAIN is the finding.
SELECT 'q6', 'row',
       json_build_object(
           'billable_source_type', billable_source_type,
           'charge_type', charge_type,
           'status', status,
           'amount_cents', amount_cents,
           'service_date', service_date,
           'created_at', created_at,
           'created_by_set', (created_by IS NOT NULL),
           'job_id_set', (job_id IS NOT NULL),
           'source_charge_id_set', (source_charge_id IS NOT NULL)
       )::text
FROM public.charges
WHERE lower(coalesce(description, '')) LIKE '%field trip%'
   OR lower(coalesce(charge_type, '')) LIKE '%field_trip%'
ORDER BY 1
