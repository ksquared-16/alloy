-- W7-F002 — after a controlled Alvarez charge by qa-slot1-product, prove the audit trail
-- names QA Operator · Slot 1 (financialActorIdentity path: created_by → active link → person).
-- Always returns one attribution row so an empty match is legible, not a parse failure.
with org as (select '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid as id),
qa as (
  select u.id as user_id
  from auth.users u
  where u.email = 'qa-slot1-product@example.com'
),
latest as (
  select ch.*
  from charges ch, org, qa
  where ch.org_id = org.id
    and ch.created_by = qa.user_id
    and ch.created_at >= '2026-10-12T23:26:00Z'
  order by ch.created_at desc
  limit 1
)
select 'attribution', 'row', coalesce(
  (select json_build_object(
      'found', true,
      'charge_id', l.id,
      'created_at', l.created_at,
      'created_by', l.created_by,
      'description', l.description,
      'amount_cents', l.amount_cents,
      'household', c.name,
      'is_w7_household', coalesce(c.name ilike 'W7 QA ·%', false),
      'actor_person', (
        select p.full_name
        from user_person_links ul
        join persons p on p.id = ul.person_id, org
        where ul.user_id = l.created_by
          and ul.org_id = org.id
          and ul.status = 'active'
          and ul.revoked_at is null
        limit 1
      ),
      'actor_person_source', (
        select p.external_source
        from user_person_links ul
        join persons p on p.id = ul.person_id, org
        where ul.user_id = l.created_by
          and ul.org_id = org.id
          and ul.status = 'active'
          and ul.revoked_at is null
        limit 1
      ),
      'active_link_count', (
        select count(*)::int
        from user_person_links ul, org
        where ul.user_id = l.created_by
          and ul.org_id = org.id
          and ul.status = 'active'
          and ul.revoked_at is null
      )
    )::text
   from latest l
   left join customers c on c.id = coalesce(
     (select a.customer_id from child_enrollment_agreements a where a.id = l.billable_source_id),
     case when l.billable_source_type = 'customer' then l.billable_source_id end
   )),
  json_build_object(
    'found', false,
    'charge_id', null,
    'created_at', null,
    'created_by', (select user_id from qa),
    'description', null,
    'amount_cents', null,
    'household', null,
    'is_w7_household', null,
    'actor_person', (
      select p.full_name
      from user_person_links ul
      join persons p on p.id = ul.person_id, org, qa
      where ul.user_id = qa.user_id
        and ul.org_id = org.id
        and ul.status = 'active'
        and ul.revoked_at is null
      limit 1
    ),
    'actor_person_source', (
      select p.external_source
      from user_person_links ul
      join persons p on p.id = ul.person_id, org, qa
      where ul.user_id = qa.user_id
        and ul.org_id = org.id
        and ul.status = 'active'
        and ul.revoked_at is null
      limit 1
    ),
    'active_link_count', (
      select count(*)::int
      from user_person_links ul, org, qa
      where ul.user_id = qa.user_id
        and ul.org_id = org.id
        and ul.status = 'active'
        and ul.revoked_at is null
    ),
    'note', 'no charge by qa-slot1-product after person-link timestamp'
  )::text
);
