-- W7-F011 / W7-F012 — three read-only answers on the deployed primary, one statement.
--
--   commit_parity   the Field trip charge committed on deployed cf55dcf98 through Add Charge on the
--                   non-W7 Alvarez Household (demo), service date Nov 18, 2026. The preview said:
--                   November 2026 · invoiced Oct 25, 2026 · due Nov 1, 2026 · draft until Nov 1.
--                   This reads what was PERSISTED, so preview and commit can be compared.
--   qa_actor        the deployed QA login (registered identity qa-slot1-product) and the named
--                   Person its active link resolves to — the path financialActorIdentity reads.
--   mygrant         every Mygrant charge with its reversal state, before any cleanup.
with org as (select '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid as id),
parity as (
  select 'commit_parity'::text as q, ch.id::text as k, json_build_object(
    'status', ch.status, 'amount_cents', ch.amount_cents, 'service_date', ch.service_date,
    'occurs_on', ch.occurs_on, 'billable_on', ch.billable_on, 'due_date', ch.due_date,
    'posted_at', ch.posted_at, 'description', ch.description,
    'billing_period', (select json_build_object('key', bp.period_key, 'starts_on', bp.starts_on, 'ends_on', bp.ends_on, 'cadence', bp.cadence)
                         from financial_billing_periods bp where bp.id = ch.billing_period_id),
    'charge_dates', ch.metadata -> 'charge_dates',
    'allocations', (select json_agg(json_build_object('party', p.full_name, 'cents', a.assigned_amount_cents, 'state', a.state) order by p.full_name)
                      from financial_responsibility_allocations a left join persons p on p.id = a.responsible_party_id
                     where a.charge_id = ch.id)
  )::text as v
  from charges ch, org
  where ch.org_id = org.id and ch.id = '5c9c0bf3-c3c8-43a9-95b3-97bf1090070b'
),
qa_actor as (
  select 'qa_actor'::text as q, u.id::text as k, json_build_object(
    'links', (select json_agg(json_build_object('status', l.status, 'revoked', l.revoked_at is not null, 'person', p.full_name,
                                                'person_source', p.external_source, 'linked_at', l.linked_at))
                from user_person_links l join persons p on p.id = l.person_id
               where l.user_id = u.id and l.org_id = org.id),
    'roles', (select json_agg(to_jsonb(r) - 'user_id' - 'org_id') from user_roles r where r.user_id = u.id and r.org_id = org.id)
  )::text as v
  from auth.users u, org
  where u.email = 'qa-slot1-product@example.com'
),
mygrant as (
  select 'mygrant'::text as q, ch.id::text as k, json_build_object(
    'household', c.name, 'status', ch.status, 'amount_cents', ch.amount_cents, 'category', ch.charge_category,
    'service_date', ch.service_date, 'billable_on', ch.billable_on, 'posted_at', ch.posted_at, 'voided_at', ch.voided_at,
    'description', ch.description, 'source_charge_id', ch.source_charge_id, 'created_by', ch.created_by,
    'reversed_by', (select json_agg(json_build_object('id', r.id, 'status', r.status, 'amount_cents', r.amount_cents))
                      from charges r where r.source_charge_id = ch.id)
  )::text as v
  from charges ch
  join customers c on c.id = coalesce(
        (select a.customer_id from child_enrollment_agreements a where a.id = ch.billable_source_id),
        case when ch.billable_source_type = 'customer' then ch.billable_source_id end)
  , org
  where ch.org_id = org.id and c.name ilike '%mygrant%'
)
select x.q, 'row', (jsonb_build_object('label', x.k) || x.v::jsonb)::text
  from (
    select q, k, v from parity
    union all select q, k, v from qa_actor
    union all select q, k, v from mygrant
  ) x
 order by 1, 3
