-- How many Opportunities did the certification fixture leak, and can they be named safely?
--
-- The post-fixture delta showed opportunities rising well past what two families create. The cause is
-- in the fixture: removeFixture deletes households, children, participations and journeys, but never
-- the Opportunity Create Lead minted -- so every ensure-after-reset orphans one. That is fixed
-- forward, but the ones already there need a selector, and a selector for a DELETE has to be proven
-- before it is used, not after.
--
-- The fixture's surnames (Certfree, Certopp) are invented and confined to it, the same class of
-- blast-radius argument as the reserved e-mail domain. This checks whether they are actually
-- readable on the Opportunity, and whether "orphaned" alone would over-reach -- a tenant may hold
-- legitimately customer-less Opportunities, and deleting those would be the fixture reaching outside
-- its own namespace.
--
-- Read-only. Counts only; no names, no ids, no titles are returned.
select question_id, 'data' as row_kind, payload
from (
    select 'opportunity_household_link'::text as question_id,
           json_build_object(
               'customer_link', g.customer_link,
               'name_matches_fixture_surname', g.fixture_named,
               'opportunities', g.n
           )::text as payload
    from (
        select case
                   when o.customer_id is null then 'no_customer_id'
                   when c.id is null then 'orphaned_customer_id'
                   else 'live_customer'
               end as customer_link,
               (coalesce(o.name, '') || ' ' || coalesce(o.title, '')) ilike any (array['%Certfree%', '%Certopp%'])
                   as fixture_named,
               count(*) as n
        from public.opportunities o
        left join public.customers c on c.id = o.customer_id
        group by 1, 2
    ) g
) census
order by question_id, payload
