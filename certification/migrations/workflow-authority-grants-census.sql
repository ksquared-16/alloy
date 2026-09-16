-- Read-only census: WHO HOLDS WORKFLOW AUTHORITY, AND WHAT DOES REMOVING THE TITLE COST?
--
-- Phase 13 forbids inheriting the AI + Agent V2 numbers. Five Workflow configuration mutations were
-- gated on `requireAdmin()` — a ROLE TITLE — so every principal the title admitted who does NOT hold
-- `ops.workflows.write` is a NARROWING, and every holder who is not titled admin is a WIDENING.
-- Both directions have to be named from measurement rather than assumed.
--
-- ONE ARTIFACT, EVERY QUESTION: `database.read_census` replays a completed result for an identical
-- query hash inside one Execution Run (DATABASE_READ_CENSUS_CONTEXT_REUSE_DEFECT).
--
-- Output contract: question_id | kind | payload — the value must sit third or later or
-- `parseTrustedHostSqlOutput` consumes it as `kind`.
select question_id, kind, payload
from (
    select 'catalog'::text as question_id, 'key_active'::text as kind,
           (pd.key || ' ~ active=' || pd.is_active::text)::text as payload,
           ('1' || pd.key)::text as sort_key
    from public.permission_definitions pd
    where pd.key in ('ops.workflows.write','ops.workflows.read')

    union all

    -- THE GRANT MATRIX. `admin` missing this key anywhere would mean the title was admitting a
    -- principal the package does not, which is the narrowing this slice has to disclose.
    select 'grants', 'key_role',
           (g.permission_key || ' ~ role=' || g.role_key
            || ' ~ allowed=' || g.allowed::text
            || ' ~ orgs=' || count(distinct g.org_id)::text),
           '2' || g.permission_key || g.role_key || g.allowed::text
    from public.role_permission_grants g
    where g.permission_key in ('ops.workflows.write','ops.workflows.read')
    group by g.permission_key, g.role_key, g.allowed

    union all

    -- CUSTOM HOLDERS. A custom Workflow Writer is exactly who the role title was refusing.
    select 'custom_holders', 'key_count',
           (g.permission_key || ' ~ custom_roles=' || count(distinct g.role_key)::text),
           '3' || g.permission_key
    from public.role_permission_grants g
    where g.allowed
      and g.role_key not in ('admin','ops','staff','viewer')
      and g.permission_key in ('ops.workflows.write','ops.workflows.read')
    group by g.permission_key

    union all

    select 'scale', 'orgs', count(distinct rd.org_id)::text, '4a'
    from public.role_definitions rd

    union all

    select 'role_keys', 'seeded', (rd.role_key || ' ~ orgs=' || count(distinct rd.org_id)::text), '4b' || rd.role_key
    from public.role_definitions rd
    group by rd.role_key
) rows
order by sort_key;
