-- Read-only census: can the DEPLOYED QA identity actually perform the Financials writes Thread 11
-- readiness depends on, in the certification tenant?
--
-- WHY THIS IS A SEPARATE QUESTION. The household census proved the SUBJECT is clean. It said
-- nothing about the ACTOR. The deployed target's managed identity is `qa-slot1-product@example.com`
-- (declared in `scripts/local-dev/lib/vacilando/deployed-target-registry.mjs`), which is a
-- different account from any slot-local certification identity — so every permission proven on a
-- local stack was proven for somebody else.
--
-- WHY IT RUNS BEFORE THE BROWSER OPENS. Add Charge, Manage Responsibility and Expected Funding all
-- gate on grants. If any is missing, the surface renders a refusal and the run learns it after a
-- session mint, a navigation and a timeout — as a UI symptom, with no way to tell "not permitted"
-- from "not rendered". Read as a fact, it is unambiguous.
--
-- THIS CENSUS DOES NOT ASK FOR A GRANT TO BE CREATED. Manufacturing a permission to make a
-- certification pass would certify the manufacture. If a grant is absent, that is the finding.
select question_id, kind, payload
from (
    -- ── 1. DOES THE IDENTITY EXIST, AND IS IT IN THIS ORG ──────────────────────────────────────
    --
    -- Two answers again: an identity that does not exist and an identity with no role read the
    -- same way downstream — both produce a surface that refuses — and they are repaired
    -- differently.
    select 'identity'::text as question_id, 'row'::text as kind,
           ('deployed_qa_user_exists ~ ' || count(*)::text)::text as payload, '1a'::text as sort_key
    from auth.users u where u.email = 'qa-slot1-product@example.com'
    union all
    select 'identity', 'row', 'roles_in_cert_org ~ ' || count(*)::text, '1b'
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where u.email = 'qa-slot1-product@example.com'
      and ur.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
    union all
    select 'identity', 'row', 'role ~ ' || ur.role, '1c'
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where u.email = 'qa-slot1-product@example.com'
      and ur.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid

    -- ── 2. THE FOUR GRANTS THIS RUN DEPENDS ON ────────────────────────────────────────────────
    --
    -- Reported per permission and per role the identity actually holds, so a green line means
    -- "this actor may do this here" rather than "some role somewhere has it".
    union all
    select 'grants', 'row',
           perm.key || ' ~ ' || ur.role || ' ~ allowed=' || coalesce(g.allowed::text, 'NO_GRANT_ROW'), '2a'
    from (values ('fin.read'), ('fin.write'), ('fin.adjust'), ('fin.responsibility')) as perm(key)
    cross join (
        select distinct ur.role
        from public.user_roles ur
        join auth.users u on u.id = ur.user_id
        where u.email = 'qa-slot1-product@example.com'
          and ur.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
    ) ur
    left join public.role_permission_grants g
      on g.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
     and g.role_key = ur.role
     and g.permission_key = perm.key

    -- ── 3. DO THE PERMISSIONS EVEN EXIST AS DEFINITIONS ───────────────────────────────────────
    --
    -- A grant FKs to `permission_definitions`. An inactive or absent definition makes every grant
    -- for it unreachable, which looks exactly like a missing grant and is not one.
    union all
    select 'definitions', 'row',
           perm.key || ' ~ defined=' || (count(pd.key) > 0)::text
           || ' ~ active=' || coalesce(bool_or(pd.is_active)::text, 'n/a'), '3a'
    from (values ('fin.read'), ('fin.write'), ('fin.adjust'), ('fin.responsibility')) as perm(key)
    left join public.permission_definitions pd on pd.key = perm.key
    group by perm.key

    -- ── 4. WHICH ROLES IN THIS ORG HOLD THEM AT ALL ───────────────────────────────────────────
    --
    -- Context for a negative: if no role in the tenant holds `fin.responsibility`, the finding is
    -- about the tenant's grant set, not about this identity.
    union all
    select 'org_grant_map', 'row',
           g.permission_key || ' ~ ' || g.role_key || ' ~ allowed=' || g.allowed::text, '4a'
    from public.role_permission_grants g
    where g.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and g.permission_key in ('fin.read', 'fin.write', 'fin.adjust', 'fin.responsibility')
) q
order by sort_key, payload;
