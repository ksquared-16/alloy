-- S1 DEPLOYED SCHEMA PROOF — asked of the catalog, not of a migration's own label.
--
-- `database.apply_migration` answering `ok` is a label. These questions are the fact. Catalog-only
-- by construction: nothing here selects from the new table, so the census cannot fail merely because
-- the table is young.
--
-- q1  financial_policies: the new column, and that nothing was dropped on the way in
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'customer_id_exists', (SELECT count(*) FROM information_schema.columns
                                   WHERE table_schema = 'public' AND table_name = 'financial_policies'
                                     AND column_name = 'customer_id'),
           'customer_id_type', (SELECT data_type FROM information_schema.columns
                                 WHERE table_schema = 'public' AND table_name = 'financial_policies'
                                   AND column_name = 'customer_id'),
           'customer_id_nullable', (SELECT is_nullable FROM information_schema.columns
                                     WHERE table_schema = 'public' AND table_name = 'financial_policies'
                                       AND column_name = 'customer_id')
       )::text AS payload

UNION ALL

-- q2  the two restated CHECKs, verbatim. `due_date` must still be admitted: restating a CHECK from
--     an older migration's text is how a previously-added type gets silently dropped.
SELECT 'q2', 'row',
       json_build_object(
           'constraint', c.conname,
           'admits_customer', (pg_get_constraintdef(c.oid) LIKE '%''customer''%'),
           'admits_billing_calendar', (pg_get_constraintdef(c.oid) LIKE '%''billing_calendar''%'),
           'admits_due_date', (pg_get_constraintdef(c.oid) LIKE '%''due_date''%'),
           'admits_billing_cadence', (pg_get_constraintdef(c.oid) LIKE '%''billing_cadence''%'),
           'admits_posting_review', (pg_get_constraintdef(c.oid) LIKE '%''posting_review''%'),
           'admits_vacation_credit', (pg_get_constraintdef(c.oid) LIKE '%''vacation_credit''%'),
           'definition', pg_get_constraintdef(c.oid)
       )::text
FROM pg_constraint c
WHERE c.conrelid = 'public.financial_policies'::regclass
  AND c.conname IN ('financial_policies_scope_type_check', 'financial_policies_policy_type_check')

UNION ALL

-- q3  the scope-shape rule still covers every pre-existing scope AND the new one
SELECT 'q3', 'row',
       json_build_object(
           'constraint', c.conname,
           'validated', c.convalidated,
           'covers_org', (pg_get_constraintdef(c.oid) LIKE '%''org''%'),
           'covers_location', (pg_get_constraintdef(c.oid) LIKE '%''location''%'),
           'covers_service', (pg_get_constraintdef(c.oid) LIKE '%''service''%'),
           'covers_rate_plan', (pg_get_constraintdef(c.oid) LIKE '%''rate_plan''%'),
           'covers_customer', (pg_get_constraintdef(c.oid) LIKE '%''customer''%'),
           'definition', pg_get_constraintdef(c.oid)
       )::text
FROM pg_constraint c
WHERE c.conrelid = 'public.financial_policies'::regclass
  AND c.conname = 'financial_policies_scope_shape'

UNION ALL

-- q4  customer org parity is enforced through the EXISTING validation authority, not a second one
SELECT 'q4', 'row',
       json_build_object(
           'function', p.proname,
           'mentions_customer_id', (pg_get_functiondef(p.oid) LIKE '%NEW.customer_id%'),
           'raises_customer_mismatch', (pg_get_functiondef(p.oid) LIKE '%customer org mismatch%'),
           'raises_customer_not_found', (pg_get_functiondef(p.oid) LIKE '%customer_id % not found%'),
           'trigger_count', (SELECT count(*) FROM pg_trigger t
                              WHERE t.tgrelid = 'public.financial_policies'::regclass
                                AND NOT t.tgisinternal
                                AND pg_get_triggerdef(t.oid) LIKE '%validate_financial_policy_scope%')
       )::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'validate_financial_policy_scope'

UNION ALL

-- q5  the new index
SELECT 'q5', 'row',
       json_build_object('index', i.indexname, 'definition', i.indexdef)::text
FROM pg_indexes i
WHERE i.schemaname = 'public' AND i.tablename = 'financial_policies'
  AND i.indexname = 'idx_financial_policies_org_customer'

UNION ALL

-- q6  financial_billing_periods: every required column, by name and type
SELECT 'q6', 'row',
       json_build_object(
           'column', c.column_name, 'type', c.data_type, 'nullable', c.is_nullable, 'default', c.column_default
       )::text
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'financial_billing_periods'

UNION ALL

-- q7  every constraint on the period table, so uniqueness, exclusion and each guard is named
SELECT 'q7', 'row',
       json_build_object(
           'constraint', c.conname,
           'type', CASE c.contype WHEN 'c' THEN 'check' WHEN 'u' THEN 'unique' WHEN 'x' THEN 'exclude'
                                  WHEN 'f' THEN 'foreign_key' WHEN 'p' THEN 'primary_key' ELSE c.contype::text END,
           'validated', c.convalidated,
           'definition', pg_get_constraintdef(c.oid)
       )::text
FROM pg_constraint c
WHERE c.conrelid = 'public.financial_billing_periods'::regclass

UNION ALL

-- q8  RLS, and the two policies the table is supposed to carry
SELECT 'q8', 'row',
       json_build_object(
           'rls_enabled', (SELECT cl.relrowsecurity FROM pg_class cl WHERE cl.oid = 'public.financial_billing_periods'::regclass),
           'rls_forced', (SELECT cl.relforcerowsecurity FROM pg_class cl WHERE cl.oid = 'public.financial_billing_periods'::regclass),
           'policies', (SELECT count(*) FROM pg_policies pol
                         WHERE pol.schemaname = 'public' AND pol.tablename = 'financial_billing_periods'),
           'policy_names', (SELECT json_agg(pol.policyname ORDER BY pol.policyname) FROM pg_policies pol
                             WHERE pol.schemaname = 'public' AND pol.tablename = 'financial_billing_periods')
       )::text

UNION ALL

-- q9  the triggers, and that the immutability rule actually carries its refusals
SELECT 'q9', 'row',
       json_build_object(
           'trigger', t.tgname,
           'definition', pg_get_triggerdef(t.oid)
       )::text
FROM pg_trigger t
WHERE t.tgrelid = 'public.financial_billing_periods'::regclass AND NOT t.tgisinternal

UNION ALL

-- q10 the immutability function's own text — a closed period must be unable to reopen
SELECT 'q10', 'row',
       json_build_object(
           'function', p.proname,
           'freezes_bounds', (pg_get_functiondef(p.oid) LIKE '%billing_period_bounds_frozen%'),
           'refuses_reopen', (pg_get_functiondef(p.oid) LIKE '%billing_period_closed%'),
           'checks_starts_on', (pg_get_functiondef(p.oid) LIKE '%starts_on%'),
           'checks_ends_on', (pg_get_functiondef(p.oid) LIKE '%ends_on%'),
           'checks_period_key', (pg_get_functiondef(p.oid) LIKE '%period_key%'),
           'checks_cadence', (pg_get_functiondef(p.oid) LIKE '%cadence%')
       )::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'enforce_financial_billing_period_immutability'

ORDER BY 1
