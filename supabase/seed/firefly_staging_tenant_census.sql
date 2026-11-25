-- Firefly staging tenant census (ALY-14 E3) — READ ONLY.
--
-- Answers, before the seed is applied to hosted staging, whether the Firefly tenant's own
-- configuration has what `firefly_staging_seed.sql` binds families to:
--   sites             the seed's north / south / west take the tenant's active sites in this order
--                     (is_primary DESC, location_number, label, id), wrapping when there are fewer
--   program keys      a child's program is the tenant's category of that key at its bound site
--   enrollment        exactly one tenant department keyed `enrollment` (two would double-bind)
--   queue work units  each family stage joins `lifecycle_wu_<stage>` in that department
--   process stages    open cases must sit in a stage of the department's active process
--
-- Every answer is a row `section | key | expected | actual | verdict`; nothing is written. Rows are
-- the tenant's own (ids outside the seed namespace `f17e0000-0000-4000-8000-`). FAIL means a seeded
-- open case would be unbound (no site, department, queue or process stage); WARN means the seed still
-- binds but more coarsely than its dataset (fewer than three sites, a missing program key).
--
--   psql "$DB" -X -v ON_ERROR_STOP=1 -P pager=off -A -F ' | ' -f supabase/seed/firefly_staging_tenant_census.sql

BEGIN READ ONLY;

WITH
firefly AS (SELECT '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid AS id),
seed_sites(site_key, ord, expected_programs) AS (VALUES
    ('north', 0, ARRAY['infant', 'toddler', 'preschool', 'pre_k', 'school_age', 'kindergarten']),
    ('south', 1, ARRAY['infant', 'toddler', 'preschool', 'pre_k', 'school_age']),
    ('west',  2, ARRAY['infant', 'toddler', 'preschool', 'pre_k', 'school_age'])
),
seed_stages(stage, is_open) AS (VALUES
    ('lead', true), ('tour', true), ('decision', true), ('waitlist', true), ('enrolling', true),
    ('enrolled', true), ('closed', false), ('closed_withdrawn', false)
),
tenant_sites AS (
    SELECT l.id, l.label, l.location_number, l.is_primary,
           row_number() OVER (ORDER BY l.is_primary DESC NULLS LAST, l.location_number NULLS LAST, l.label, l.id) - 1 AS rn,
           count(*) OVER () AS n
    FROM public.locations l, firefly f
    WHERE l.org_id = f.id AND l.location_type = 'site' AND l.is_active
      AND l.id::text NOT LIKE 'f17e0000-0000-4000-8000-%'
),
bound_sites AS (
    SELECT k.site_key, k.ord, k.expected_programs, s.id, s.label, s.location_number
    FROM seed_sites k LEFT JOIN tenant_sites s ON s.rn = k.ord % s.n
),
enrollment AS (
    SELECT d.id, d.metadata
    FROM public.departments d, firefly f
    WHERE d.org_id = f.id AND d.key = 'enrollment' AND d.id::text NOT LIKE 'f17e0000-0000-4000-8000-%'
),
process_stages AS (
    SELECT DISTINCT st->>'key' AS stage_key
    FROM enrollment d
    CROSS JOIN LATERAL jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') p
    CROSS JOIN LATERAL jsonb_array_elements(p->'stages') st
    WHERE p->>'id' = d.metadata->'lifecycle_builder_v1'->>'active_process_id'
),
answers(section, key, expected, actual, verdict, ord) AS (
    SELECT 'org', 'firefly_org', 'present',
           CASE WHEN EXISTS (SELECT 1 FROM public.orgs o, firefly f WHERE o.id = f.id) THEN 'present' ELSE 'absent' END,
           NULL::text, 10
    UNION ALL
    SELECT 'org', 'retired_separate_staging_org', 'absent',
           CASE WHEN EXISTS (SELECT 1 FROM public.orgs WHERE id = 'f17e0000-0000-4000-8000-000000000001'::uuid) THEN 'present' ELSE 'absent' END,
           NULL, 11
    UNION ALL
    SELECT 'org', 'seed_rows_already_present', 'informational',
           (SELECT count(*)::text FROM public.customers c, firefly f WHERE c.org_id = f.id AND c.id::text LIKE 'f17e0000-0000-4000-8000-%'),
           'INFO', 12
    UNION ALL
    SELECT 'sites', 'tenant_active_sites', '>= 1 (3 for one site per seed campus)',
           (SELECT count(*)::text FROM tenant_sites), NULL, 20
    UNION ALL
    SELECT 'sites', 'bound_' || b.site_key, 'a tenant site',
           coalesce(b.label || ' (#' || coalesce(b.location_number::text, '-') || ', ' || b.id || ')', '<unbound>'),
           NULL, 21 + b.ord
    FROM bound_sites b
    UNION ALL
    SELECT 'programs', b.site_key || ':' || k.key || ' @ ' || coalesce(b.label, '<unbound site>'), 'present',
           CASE WHEN EXISTS (
               SELECT 1 FROM public.location_program_categories c, firefly f
               WHERE c.org_id = f.id AND c.location_id = b.id AND c.key = k.key AND c.is_active
           ) THEN 'present' ELSE 'absent' END,
           NULL, 30 + b.ord
    FROM bound_sites b CROSS JOIN LATERAL unnest(b.expected_programs) AS k(key)
    UNION ALL
    SELECT 'programs', 'tenant_keys_at_' || b.site_key, 'informational',
           coalesce((SELECT string_agg(c.key, ',' ORDER BY c.key) FROM public.location_program_categories c, firefly f
                     WHERE c.org_id = f.id AND c.location_id = b.id AND c.is_active), '<none>'),
           'INFO', 35 + b.ord
    FROM bound_sites b
    UNION ALL
    SELECT 'enrollment', 'enrollment_department', '1', (SELECT count(*)::text FROM enrollment), NULL, 40
    UNION ALL
    SELECT 'enrollment', 'active_process_id', 'set',
           coalesce((SELECT d.metadata->'lifecycle_builder_v1'->>'active_process_id' FROM enrollment d LIMIT 1), '<none>'),
           NULL, 41
    UNION ALL
    SELECT 'queues', 'lifecycle_wu_' || s.stage, CASE WHEN s.is_open THEN 'active' ELSE 'active (closed cases; optional)' END,
           CASE WHEN EXISTS (
               SELECT 1 FROM public.work_units w JOIN enrollment d ON w.department_id = d.id
               WHERE w.key = 'lifecycle_wu_' || s.stage AND w.is_active
           ) THEN 'active' ELSE 'absent' END,
           CASE WHEN s.is_open THEN NULL ELSE 'INFO' END, 50
    FROM seed_stages s
    UNION ALL
    SELECT 'queues', 'tenant_work_unit_keys', 'informational',
           coalesce((SELECT string_agg(w.key || CASE WHEN w.is_active THEN '' ELSE '(inactive)' END, ',' ORDER BY w.key)
                     FROM public.work_units w JOIN enrollment d ON w.department_id = d.id), '<none>'),
           'INFO', 58
    UNION ALL
    SELECT 'process', 'stage_' || s.stage, CASE WHEN s.is_open THEN 'in active process' ELSE 'informational (closed)' END,
           CASE WHEN EXISTS (SELECT 1 FROM process_stages p WHERE p.stage_key = s.stage) THEN 'in active process' ELSE 'absent' END,
           CASE WHEN s.is_open THEN NULL ELSE 'INFO' END, 60
    FROM seed_stages s
    UNION ALL
    SELECT 'process', 'active_process_stage_keys', 'informational',
           coalesce((SELECT string_agg(stage_key, ',' ORDER BY stage_key) FROM process_stages), '<none>'),
           'INFO', 68
    UNION ALL
    -- Managed QA identities (`qa-slot<N>-…@example.com`, the only shape the toolkit provisions) and
    -- the Firefly roles they hold. E3 wants exactly three; the toolkit's access step grants `admin` in
    -- DEV_QUEUE_ORG_ID, which may already have put earlier slot identities here.
    SELECT 'qa_identities', 'managed_qa_accounts', 'informational',
           (SELECT count(*)::text FROM auth.users u WHERE u.email ~* '^qa-slot[0-9]+-[a-z0-9-]+@example\.com$'),
           'INFO', 70
    UNION ALL
    SELECT 'qa_identities', 'firefly_member:' || u.email, 'informational',
           (SELECT string_agg(r.role, ',' ORDER BY r.role) FROM public.user_roles r, firefly f WHERE r.user_id = u.id AND r.org_id = f.id),
           'INFO', 71
    FROM auth.users u
    WHERE u.email ~* '^qa-slot[0-9]+-[a-z0-9-]+@example\.com$'
      AND EXISTS (SELECT 1 FROM public.user_roles r, firefly f WHERE r.user_id = u.id AND r.org_id = f.id)
    UNION ALL
    SELECT 'qa_identities', 'firefly_managed_qa_members', '3',
           (SELECT count(DISTINCT u.id)::text FROM auth.users u JOIN public.user_roles r ON r.user_id = u.id, firefly f
            WHERE r.org_id = f.id AND u.email ~* '^qa-slot[0-9]+-[a-z0-9-]+@example\.com$'),
           NULL, 72
    UNION ALL
    -- The installed access step first creates a "QA Operator · Slot N" person fixture in the org.
    SELECT 'qa_identities', 'firefly_qa_person_fixtures', 'informational',
           (SELECT count(*)::text FROM public.persons p, firefly f WHERE p.org_id = f.id AND p.external_source = 'alloy_qa_fixture'),
           'INFO', 72
    UNION ALL
    -- Shared-QA (ZZ Alloy QA) identities must never hold a Firefly membership.
    SELECT 'qa_identities', 'shared_qa_accounts_in_firefly', '0',
           (SELECT count(DISTINCT u.id)::text FROM auth.users u JOIN public.user_roles r ON r.user_id = u.id, firefly f
            WHERE r.org_id = f.id AND u.email ~* '^qa-(shared-actor|secondary-admin|pool-[0-9]+)@example\.com$'),
           NULL, 73
)
SELECT section, key, expected, actual,
       coalesce(verdict,
           CASE
               WHEN expected = actual THEN 'PASS'
               WHEN key = 'tenant_active_sites' AND actual::int >= 3 THEN 'PASS'
               WHEN key = 'tenant_active_sites' AND actual::int >= 1 THEN 'WARN'
               WHEN key LIKE 'bound_%' AND actual <> '<unbound>' THEN 'PASS'
               -- the seed still writes; that child's program is left unbound
               WHEN section = 'programs' AND expected = 'present' THEN 'WARN'
               WHEN key = 'active_process_id' AND actual <> '<none>' THEN 'PASS'
               ELSE 'FAIL'
           END) AS verdict
FROM answers
ORDER BY ord, section, key;

ROLLBACK;
