-- Read-only census: WHO ACTUALLY HOLDS THE AI AND DOMAIN AUTHORITIES TODAY.
--
-- Phase 5 forbids removing the role-title fallback on an assumption. The
-- fallback currently admits `admin` (and, for review-class keys, `ops`) by ROLE
-- KEY regardless of package, so the question that decides whether this
-- convergence NARROWS, HOLDS or WIDENS is: which role_definitions already carry
-- the capability as a grant? Anything the fallback was admitting that the grant
-- does not is a narrowing, and must be named before it happens rather than
-- discovered by an operator losing a surface.
--
-- ONE ARTIFACT, EVERY QUESTION. `database.read_census` replays a completed
-- result for an identical query hash inside one Execution Run
-- (DATABASE_READ_CENSUS_CONTEXT_REUSE_DEFECT, Phase 27), so a follow-up
-- question cannot be asked by filing this file again. Everything Phases 5, 8,
-- 12, 13 and 21 need is therefore asked here, once.
--
-- Output contract: question_id | kind | payload. The version must sit in the
-- PAYLOAD position, third onward, or `parseTrustedHostSqlOutput` consumes it as
-- `kind` and the identity never reaches the caller.
select question_id, kind, payload
from (
    -- 1. CATALOGUE TRUTH. Is each key present, and is it active? A key that is
    -- inactive cannot be granted (FK + is_active), so enforcing against it
    -- would build authority on vocabulary no organization can hold.
    select 'catalog'::text as question_id,
           'key_active'::text as kind,
           (pd.key || ' ~ active=' || pd.is_active::text)::text as payload,
           ('1' || pd.key)::text as sort_key
    from public.permission_definitions pd
    where pd.key in ('ai.enrichment.use','ai.provider.config.manage','ai.telemetry.review',
                     'ops.workflows.write','ops.workflows.read',
                     'fields.manage','layouts.manage',
                     'config_assist.generate','config_assist.review','config_assist.apply')

    union all

    -- 2. ABSENT FROM THE CATALOGUE ENTIRELY. Reported separately, because "no
    -- row" and "row with is_active false" are different repairs and the first
    -- would otherwise be invisible as a missing line.
    select 'catalog_missing', 'absent', k, '2' || k
    from unnest(array['ai.enrichment.use','ai.provider.config.manage','ai.telemetry.review',
                      'ops.workflows.write','ops.workflows.read',
                      'fields.manage','layouts.manage',
                      'config_assist.generate','config_assist.review','config_assist.apply']) as k
    where not exists (select 1 from public.permission_definitions pd where pd.key = k)

    union all

    -- 3. THE GRANT MATRIX: for each key, which role_key holds it, in how many
    -- organizations, and is it allowed. This is the measurement Phase 5 needs:
    -- `admin` appearing here means the fallback and the grant agree for admin,
    -- and its ABSENCE means removing the fallback narrows admin.
    select 'grants', 'key_role',
           (g.permission_key || ' ~ role=' || g.role_key
            || ' ~ allowed=' || g.allowed::text
            || ' ~ orgs=' || count(distinct g.org_id)::text),
           '3' || g.permission_key || g.role_key || g.allowed::text
    from public.role_permission_grants g
    where g.permission_key in ('ai.enrichment.use','ai.provider.config.manage','ai.telemetry.review',
                               'ops.workflows.write','ops.workflows.read',
                               'fields.manage','layouts.manage',
                               'config_assist.generate','config_assist.review','config_assist.apply')
    group by g.permission_key, g.role_key, g.allowed

    union all

    -- 4. CUSTOM HOLDERS. A role_key outside the seeded four is a custom role,
    -- and Phase 9 requires that such a role become genuinely functional rather
    -- than decorative. Counted so "custom roles hold this" is answerable
    -- without naming any organization's private role vocabulary.
    select 'custom_holders', 'key_count',
           (g.permission_key || ' ~ custom_roles=' || count(distinct g.role_key)::text),
           '4' || g.permission_key
    from public.role_permission_grants g
    where g.allowed
      and g.role_key not in ('admin','ops','staff','viewer')
      and g.permission_key in ('ai.enrichment.use','ops.workflows.write','fields.manage','layouts.manage',
                               'ai.provider.config.manage','ai.telemetry.review')
    group by g.permission_key

    union all

    -- 5. THE DENOMINATOR. Without it a zero cannot be read: "no organization
    -- grants this" and "there are no organizations" look identical.
    select 'scale', 'orgs', count(distinct rd.org_id)::text, '5a'
    from public.role_definitions rd

    union all

    select 'scale', 'role_definitions', count(*)::text, '5b'
    from public.role_definitions

    union all

    -- 6. SEEDED ROLE KEYS actually in use, so the four assumed above can be
    -- checked rather than trusted.
    select 'role_keys', 'seeded', (rd.role_key || ' ~ orgs=' || count(distinct rd.org_id)::text), '6' || rd.role_key
    from public.role_definitions rd
    group by rd.role_key
) rows
order by sort_key;
