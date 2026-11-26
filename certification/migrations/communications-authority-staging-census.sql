-- Read-only census: did the Communications authority model actually land on staging?
--
-- `ledger: "applied"` is a LABEL the apply action writes about itself. It is not
-- evidence that the migration's effects exist, and a version collision can make
-- a skip look like a success. So this asks the database what it holds.
--
-- Output contract: question_id | kind | payload. The parser reads the first two
-- columns as identity and everything from the third as the row, so the VALUE
-- must sit in the payload position or it is consumed as `kind` and lost.
--
-- Three questions, each answering a different half of the approved policy:
--   catalog  - the three new capabilities exist, active, in the right group
--   admin    - every admin role holds all five
--   ops      - no ops role holds any of the three management keys
--
-- No DDL, no writes: the trusted-host read action permits nothing else.
select question_id, kind, payload
from (
    select
        'catalog'::text as question_id,
        'key'::text     as kind,
        pd.key::text    as payload,
        pd.key::text    as sort_key
    from public.permission_definitions pd
    where pd.key in ('communications.templates.manage',
                     'communications.provider.configure',
                     'communications.bulk.send')
      and pd.is_active
      and pd.group_key = 'communications'

    union all

    -- Admin roles NOT holding all five. An empty answer is the passing answer.
    select
        'admin_short'::text,
        'org_role'::text,
        (rd.org_id::text || ' ' || rd.role_key)::text,
        ('m' || rd.org_id::text)::text
    from public.role_definitions rd
    where rd.is_active and rd.role_key = 'admin'
      and (select count(*) from public.role_permission_grants g
            where g.org_id = rd.org_id and g.role_key = rd.role_key and g.allowed
              and g.permission_key in ('communications.read','communications.send',
                                       'communications.templates.manage',
                                       'communications.provider.configure',
                                       'communications.bulk.send')) <> 5

    union all

    -- Ops roles that GAINED a management key. An empty answer is the passing answer.
    select
        'ops_leaked'::text,
        'org_role'::text,
        (rd.org_id::text || ' ' || rd.role_key)::text,
        ('n' || rd.org_id::text)::text
    from public.role_definitions rd
    where rd.is_active and rd.role_key = 'ops'
      and exists (select 1 from public.role_permission_grants g
                   where g.org_id = rd.org_id and g.role_key = rd.role_key and g.allowed
                     and g.permission_key in ('communications.templates.manage',
                                              'communications.provider.configure',
                                              'communications.bulk.send'))

    union all

    -- Totals, so an all-empty result cannot be confused with "queried nothing".
    select 'admin_role_total'::text, 'count'::text,
           count(*)::text, 'zzz1'::text
      from public.role_definitions where is_active and role_key = 'admin'

    union all

    select 'ops_read_send_total'::text, 'count'::text,
           count(*)::text, 'zzz2'::text
      from public.role_definitions rd
     where rd.is_active and rd.role_key = 'ops'
       and (select count(*) from public.role_permission_grants g
             where g.org_id = rd.org_id and g.role_key = rd.role_key and g.allowed
               and g.permission_key in ('communications.read','communications.send')) = 2
) rows
order by sort_key;
