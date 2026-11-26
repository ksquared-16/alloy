-- Read-only census: did the vocabulary authority actually land on staging?
--
-- `ledger: "applied"` is a label the apply action writes about itself, and a
-- version collision can make a skip look like a success. This asks the database.
--
-- Output contract: question_id | kind | payload, and the first branch is ALIASED
-- because a UNION takes its column names from there.
--
-- The two questions that matter return rows only on FAILURE, so totals travel
-- with them: an all-empty answer would otherwise be indistinguishable from a
-- census that queried nothing.
select question_id, kind, payload
from (
    select 'catalog'::text      as question_id,
           'key'::text          as kind,
           (pd.key || ' /' || pd.group_key)::text as payload,
           'a'::text            as sort_key
      from public.permission_definitions pd
     where pd.key = 'configuration.vocabulary.manage' and pd.is_active

    union all

    -- Admin roles WITHOUT it. Empty is the passing answer.
    select 'admin_missing'::text, 'org_role'::text,
           (rd.org_id::text || ' ' || rd.role_key)::text, ('m' || rd.org_id::text)::text
      from public.role_definitions rd
     where rd.is_active and rd.role_key = 'admin'
       and not exists (select 1 from public.role_permission_grants g
                        where g.org_id = rd.org_id and g.role_key = rd.role_key
                          and g.permission_key = 'configuration.vocabulary.manage' and g.allowed)

    union all

    -- ANY non-admin role holding it. Empty is the passing answer: the approved
    -- policy is admin only, and no adjacent Configuration capability inherits it.
    select 'non_admin_holder'::text, 'org_role'::text,
           (rd.org_id::text || ' ' || rd.role_key)::text, ('n' || rd.org_id::text)::text
      from public.role_definitions rd
     where rd.is_active and rd.role_key <> 'admin'
       and exists (select 1 from public.role_permission_grants g
                    where g.org_id = rd.org_id and g.role_key = rd.role_key
                      and g.permission_key = 'configuration.vocabulary.manage' and g.allowed)

    union all

    select 'admin_role_total'::text, 'count'::text, count(*)::text, 'zzz1'::text
      from public.role_definitions where is_active and role_key = 'admin'

    union all

    select 'holders_total'::text, 'count'::text, count(*)::text, 'zzz2'::text
      from public.role_permission_grants
     where permission_key = 'configuration.vocabulary.manage' and allowed
) rows
order by sort_key;
