-- Read-only census: did the assignment authority actually land on staging?
--
-- `ledger: "applied"` is a label the apply action writes about itself, and a
-- version collision can make a skip look like a success. This asks the database.
--
-- Output contract: question_id | kind | payload. The value must sit in the
-- payload position or the parser consumes it as `kind` and loses it.
--
-- The two questions that matter return rows only on FAILURE, so totals travel
-- with them: an all-empty answer would otherwise be indistinguishable from a
-- census that queried nothing.
select question_id, kind, payload
from (
    -- ALIASED, AND THE UNION TAKES ITS NAMES FROM HERE. The first draft left every
    -- branch positional, so the outer select could not find `question_id` at all and
    -- the census failed rather than returning a wrong answer -- the better of the two
    -- failure modes, but a failure.
    select 'catalog'::text     as question_id,
           'key'::text         as kind,
           pd.key::text        as payload,
           'a'::text           as sort_key
      from public.permission_definitions pd
     where pd.key = 'communications.assign' and pd.is_active
       and pd.group_key = 'communications'

    union all

    -- System roles that did NOT receive it. Empty is the passing answer.
    select 'system_role_missing'::text, 'org_role'::text,
           (rd.org_id::text || ' ' || rd.role_key)::text, ('m' || rd.org_id::text)::text
      from public.role_definitions rd
     where rd.is_active and rd.role_key in ('admin','ops')
       and not exists (select 1 from public.role_permission_grants g
                        where g.org_id = rd.org_id and g.role_key = rd.role_key
                          and g.permission_key = 'communications.assign' and g.allowed)

    union all

    -- THE SEPARATION. Any role that holds SEND and also ASSIGN without being a
    -- system role would mean the backfill reached beyond the approved policy and
    -- the scope-escalation path is open again. Empty is the passing answer.
    select 'custom_role_inherited'::text, 'org_role'::text,
           (rd.org_id::text || ' ' || rd.role_key)::text, ('n' || rd.org_id::text)::text
      from public.role_definitions rd
     where rd.is_active and rd.role_key not in ('admin','ops')
       and exists (select 1 from public.role_permission_grants g
                    where g.org_id = rd.org_id and g.role_key = rd.role_key
                      and g.permission_key = 'communications.assign' and g.allowed)

    union all

    select 'system_role_total'::text, 'count'::text, count(*)::text, 'zzz1'::text
      from public.role_definitions where is_active and role_key in ('admin','ops')

    union all

    select 'holders_total'::text, 'count'::text, count(*)::text, 'zzz2'::text
      from public.role_permission_grants
     where permission_key = 'communications.assign' and allowed
) rows
order by sort_key;
