-- Read-only census: WHO HOLDS THE FINANCIAL AUTHORITIES, AND WHAT WOULD CONVERGING A DELETE COST?
--
-- Two questions decide this slice. First, repairing the Accounts defect removes a role title that
-- sits AFTER the `fin.write` check, so the reach it currently withholds is exactly "holders of
-- fin.write who are not titled admin" — that set has to be named, not guessed.
--
-- Second, and the reason the earlier Financials slice stopped where it did: six commercial-catalogue
-- DELETE handlers perform a HARD `.delete()` and are gated on the admin title, while their POST and
-- PATCH siblings already answer to `fin.write`. Converging them would hand row destruction to every
-- fin.write holder. Whether that is a widening depends entirely on who holds the key.
--
-- ONE ARTIFACT, EVERY QUESTION: `database.read_census` replays a completed result for an identical
-- query hash inside one Execution Run (DATABASE_READ_CENSUS_CONTEXT_REUSE_DEFECT). The column
-- inventory comes first, because a single guessed identifier fails the whole statement.
--
-- Output contract: question_id | kind | payload — the value must sit third or later, or
-- `parseTrustedHostSqlOutput` consumes it as `kind`.
select question_id, kind, payload
from (
    select 'catalog'::text as question_id, 'key'::text as kind,
           (pd.key || ' ~ active=' || pd.is_active::text)::text as payload,
           ('1' || pd.key)::text as sort_key
    from public.permission_definitions pd
    where pd.key like 'fin.%'

    union all

    -- THE GRANT MATRIX. `ops` appearing against fin.write is the fact that decides whether the six
    -- DELETE conversions are a widening or a correction.
    select 'grants', 'key_role',
           (g.permission_key || ' ~ role=' || g.role_key || ' ~ allowed=' || g.allowed::text
            || ' ~ orgs=' || count(distinct g.org_id)::text),
           '2' || g.permission_key || g.role_key || g.allowed::text
    from public.role_permission_grants g
    where g.permission_key like 'fin.%'
    group by g.permission_key, g.role_key, g.allowed

    union all

    -- CUSTOM HOLDERS. A custom Financial Writer is precisely the principal the Accounts role title
    -- refuses today, so this says whether anyone real is currently harmed by the defect.
    select 'custom_holders', 'key_count',
           (g.permission_key || ' ~ custom_roles=' || count(distinct g.role_key)::text),
           '3' || g.permission_key
    from public.role_permission_grants g
    where g.allowed and g.role_key not in ('admin','ops','staff','viewer')
      and g.permission_key like 'fin.%'
    group by g.permission_key

    union all

    -- HOW MUCH COMMERCIAL CATALOGUE IS THERE TO DESTROY? Volume sizes the consequence of the six
    -- hard deletes; it does not by itself decide the owner.
    select 'catalogue', 'service_offerings', count(*)::text, '4a' from public.service_offerings
    union all
    select 'catalogue', 'pricing_addons', count(*)::text, '4b' from public.pricing_addons
    union all
    select 'catalogue', 'service_plan_templates', count(*)::text, '4c' from public.service_plan_templates

    union all

    select 'scale', 'orgs_with_roles', count(distinct rd.org_id)::text, '5a'
    from public.role_definitions rd
    union all
    select 'role_keys', 'seeded', (rd.role_key || ' ~ orgs=' || count(distinct rd.org_id)::text), '5b' || rd.role_key
    from public.role_definitions rd
    group by rd.role_key
) rows
order by sort_key;
