-- Read-only census: are the Slice 3 policies actually ORG-SCOPED on this database,
-- or merely present?
--
-- The schema census already answers "RLS enabled, 20 policies". That is a count,
-- and a count cannot tell the difference between a policy that isolates tenants
-- and a policy whose USING clause is `true`. A defect that shipped once as a
-- missing statement can ship again as a permissive one, and it would satisfy
-- every assertion the other census makes.
--
-- So this asks what the predicates SAY. Each answer is the count of policies whose
-- qualifying expression actually names `has_org_role(org_id, ...)` — the same
-- predicate `employments` and `documents` use — and, separately, the count of any
-- policy that would admit every row.
--
-- Catalog-only: pg_policies is a view over the catalog and exists whether or not
-- the Slice 3 tables do, so this is safe on a database that never ran the
-- migration. It returns zeros there rather than failing.
--
-- Output obeys the trusted-host parser: question_id | kind | payload.
select question_id, kind, payload
from (
    select 'policies_total'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_qualification%'), 'p01'::text
    union all
    -- SELECT policies must be org-scoped. Four expected, one per table.
    select 'select_policies_org_scoped'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_qualification%'
              and cmd='SELECT' and coalesce(qual,'') like '%has_org_role(org_id%'), 'p02'::text
    union all
    -- The read role set must match the employments baseline exactly.
    select 'select_policies_read_roleset'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_qualification%'
              and cmd='SELECT'
              and coalesce(qual,'') like '%owner%admin%ops%manager%'), 'p03'::text
    union all
    -- Write policies are narrower: no `manager` anywhere in a write predicate.
    select 'write_policies_org_scoped'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_qualification%'
              and cmd in ('INSERT','UPDATE','DELETE')
              and coalesce(qual,'')||coalesce(with_check,'') like '%has_org_role(org_id%'), 'p04'::text
    union all
    select 'write_policies_naming_manager'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_qualification%'
              and cmd in ('INSERT','UPDATE','DELETE')
              and coalesce(qual,'')||coalesce(with_check,'') like '%manager%'), 'p05'::text
    union all
    -- THE ONE THAT MATTERS MOST: any policy that admits every row.
    -- Expected zero. A permissive policy passes a count and defeats the boundary.
    select 'permissive_true_policies'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_qualification%'
              and (btrim(coalesce(qual,'')) = 'true' or btrim(coalesce(with_check,'')) = 'true')), 'p06'::text
    union all
    -- Service access is explicit rather than incidental.
    select 'service_role_policies'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_qualification%'
              and coalesce(qual,'') like '%service_role%'), 'p07'::text
    union all
    -- WRITE PRIVILEGE, not policy. `authenticated` holds SELECT only on these
    -- tables, so writes are refused before RLS is consulted. Reported as its own
    -- fact so nobody reads the write policies as the thing doing that work.
    select 'authenticated_write_grants'::text, 'count'::text,
           (select count(*)::text from information_schema.role_table_grants
            where table_schema='public' and grantee='authenticated'
              and table_name like 'staff_qualification%'
              and privilege_type in ('INSERT','UPDATE','DELETE')), 'p08'::text
    union all
    select 'authenticated_select_grants'::text, 'count'::text,
           (select count(*)::text from information_schema.role_table_grants
            where table_schema='public' and grantee='authenticated'
              and table_name like 'staff_qualification%'
              and privilege_type='SELECT'), 'p09'::text
    union all
    -- Baseline for comparison: the tables a qualification hangs off.
    select 'employments_select_policies_org_scoped'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename='employments'
              and cmd='SELECT' and coalesce(qual,'') like '%has_org_role(org_id%'), 'p10'::text
) rows(question_id, kind, payload, sort_key)
order by sort_key;
