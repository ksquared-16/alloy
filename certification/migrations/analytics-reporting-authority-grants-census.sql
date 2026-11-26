-- Read-only census: WHO HOLDS THE ANALYTICS/REPORTING AUTHORITIES TODAY.
--
-- Phase 15 forbids inheriting the Operational Intelligence numbers. Converging 18 Analytics
-- mutations onto reports.write changes who can reach them, and the direction of that change is a
-- measured fact about the deployed grants, not a guess: any principal the old gates admitted who
-- does NOT hold the key is a NARROWING and must be named before it happens.
--
-- ONE ARTIFACT, EVERY QUESTION. `database.read_census` replays a completed result for an identical
-- query hash inside one Execution Run (DATABASE_READ_CENSUS_CONTEXT_REUSE_DEFECT), so a follow-up
-- question cannot be asked by filing this file again.
--
-- Output contract: question_id | kind | payload — the value must sit third or later, or
-- `parseTrustedHostSqlOutput` consumes it as `kind` and the identity never reaches the caller.
select question_id, kind, payload
from (
    -- 1. Are the two keys catalogued and active? An inactive key cannot be granted, so enforcing
    -- against it would build authority on vocabulary no organization can hold.
    select 'catalog'::text as question_id, 'key_active'::text as kind,
           (pd.key || ' ~ active=' || pd.is_active::text)::text as payload,
           ('1' || pd.key)::text as sort_key
    from public.permission_definitions pd
    where pd.key in ('reports.read','reports.write')

    union all

    -- 2. THE GRANT MATRIX. `reports.write` was deliberately WITHHELD from the ops default by
    -- 20260915120000 (every OI route answered ops 403 before that slice), so ops appearing here
    -- would contradict the promoted doctrine and must be seen rather than assumed.
    select 'grants', 'key_role',
           (g.permission_key || ' ~ role=' || g.role_key
            || ' ~ allowed=' || g.allowed::text
            || ' ~ orgs=' || count(distinct g.org_id)::text),
           '2' || g.permission_key || g.role_key || g.allowed::text
    from public.role_permission_grants g
    where g.permission_key in ('reports.read','reports.write')
    group by g.permission_key, g.role_key, g.allowed

    union all

    -- 3. CUSTOM HOLDERS. A role_key outside the seeded set is a custom role; Phase 16 requires a
    -- custom Reader and Writer to behave identically to a seeded role holding the same key.
    select 'custom_holders', 'key_count',
           (g.permission_key || ' ~ custom_roles=' || count(distinct g.role_key)::text),
           '3' || g.permission_key
    from public.role_permission_grants g
    where g.allowed
      and g.role_key not in ('admin','ops','staff','viewer')
      and g.permission_key in ('reports.read','reports.write')
    group by g.permission_key

    union all

    -- 4. THE DENOMINATOR. Without it a zero is unreadable: "no organization grants this" and
    -- "there are no organizations" look identical.
    select 'scale', 'orgs', count(distinct rd.org_id)::text, '4a'
    from public.role_definitions rd

    union all

    select 'role_keys', 'seeded', (rd.role_key || ' ~ orgs=' || count(distinct rd.org_id)::text), '4b' || rd.role_key
    from public.role_definitions rd
    group by rd.role_key
) rows
order by sort_key;
