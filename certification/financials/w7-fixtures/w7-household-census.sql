-- W7-F012 — THE FIVE W7 QA HOUSEHOLDS, AS THE DEPLOYED PRIMARY HOLDS THEM.
--
-- Read-only. One statement, `question_id | kind | payload` per row (the census output contract).
-- Every household is addressed by its fixture id (fd000000-…-0000007c000N), never by name, so a
-- similarly named staging family cannot satisfy it. Per household: campus of each child's
-- agreement, the adults and their roles, the standing arrangement and its shares, any account
-- policy, and counts of charges, payments and journal entries (which must be zero before the
-- Director starts). Also: the three campus calendars the households depend on, whether the legacy
-- Alvarez household is untouched, the QA login's named-person link, and the Mygrant rows the
-- cleanup step will act on.
with org as (select '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid as id),
w7 as (
  select c.id, c.name
    from customers c, org
   where c.org_id = org.id and c.id::text like 'fd000000-0000-4000-8000-0000007c%'
),
household as (
  select 'w7_household'::text as q, w7.name as k, json_build_object(
    'customer_id', w7.id,
    'children', (select coalesce(json_agg(json_build_object('child', cm.display_name, 'campus', l.label, 'agreement_status', a.status, 'start', a.start_date) order by cm.display_name), '[]')
                   from customer_members cm
                   left join child_enrollment_agreements a on a.customer_member_id = cm.id
                   left join locations l on l.id = a.site_location_id
                  where cm.customer_id = w7.id),
    'adults', (select coalesce(json_agg(json_build_object('person', p.full_name, 'role', cp.role_type, 'status', cp.status) order by p.full_name), '[]')
                 from customer_persons cp join persons p on p.id = cp.person_id
                where cp.customer_id = w7.id),
    'arrangements', (select coalesce(json_agg(json_build_object(
                        'state', ar.state, 'start', ar.effective_start, 'end', ar.effective_end,
                        'member_scoped', ar.customer_member_id is not null, 'charge_scoped', ar.charge_id is not null,
                        'shares', (select json_agg(json_build_object('person', p.full_name, 'method', s.method, 'bp', s.percent_basis_points) order by p.full_name)
                                     from financial_responsibility_shares s join persons p on p.id = s.responsible_party_id
                                    where s.arrangement_id = ar.id))), '[]')
                       from financial_responsibility_arrangements ar where ar.customer_id = w7.id),
    'account_policies', (select coalesce(json_agg(json_build_object('type', fp.policy_type, 'value', fp.value, 'active', fp.is_active, 'start', fp.effective_start, 'end', fp.effective_end)), '[]')
                           from financial_policies fp where fp.customer_id = w7.id),
    'charges', (select count(*) from charges ch
                 where ch.billable_source_id = w7.id
                    or ch.billable_source_id in (select a.id from child_enrollment_agreements a where a.customer_id = w7.id)),
    'payments', (select count(*) from payments pm
                  where pm.customer_id = w7.id or pm.billable_source_id = w7.id
                     or pm.billable_source_id in (select a.id from child_enrollment_agreements a where a.customer_id = w7.id)),
    'journal_entries', (select count(*) from financial_journal_entries j
                         where j.billable_source_id = w7.id
                            or j.billable_source_id in (select a.id from child_enrollment_agreements a where a.customer_id = w7.id))
  )::text as v
  from w7
),
campus as (
  select 'campus_calendar'::text as q, l.label as k, json_build_object(
    'location_id', l.id,
    'billing_calendar', (select json_agg(json_build_object('value', fp.value, 'start', fp.effective_start, 'end', fp.effective_end, 'active', fp.is_active) order by fp.effective_start)
                           from financial_policies fp
                          where fp.org_id = l.org_id and fp.scope_type = 'location' and fp.location_id = l.id
                            and fp.policy_type = 'billing_calendar' and fp.is_active)
  )::text as v
  from locations l, org
  where l.org_id = org.id and l.location_type = 'site' and l.is_active
    and l.label in ('North Campus', 'South Campus', 'West Campus')
),
org_default as (
  select 'org_billing_calendar'::text as q, 'org'::text as k,
         json_build_object('calendars', coalesce(json_agg(json_build_object('value', fp.value, 'start', fp.effective_start, 'end', fp.effective_end) order by fp.effective_start), '[]'))::text as v
    from financial_policies fp, org
   where fp.org_id = org.id and fp.scope_type = 'org' and fp.policy_type = 'billing_calendar' and fp.is_active
),
legacy as (
  select 'legacy_alvarez'::text as q, 'fd000000-0000-4000-8000-0000000c0001'::text as k, json_build_object(
    'present', exists (select 1 from customers where id = 'fd000000-0000-4000-8000-0000000c0001'),
    'charges', (select count(*) from charges where billable_source_id in ('fd000000-0000-4000-8000-0000000a0001'::uuid, 'fd000000-0000-4000-8000-0000000c0001'::uuid)),
    'payments', (select count(*) from payments where billable_source_id in ('fd000000-0000-4000-8000-0000000a0001'::uuid, 'fd000000-0000-4000-8000-0000000c0001'::uuid)),
    'journal_entries', (select count(*) from financial_journal_entries where billable_source_id in ('fd000000-0000-4000-8000-0000000a0001'::uuid, 'fd000000-0000-4000-8000-0000000c0001'::uuid))
  )::text as v
),
qa_link as (
  select 'qa_person_link'::text as q, p.full_name as k, json_build_object(
    'external_source', p.external_source,
    'active_links', (select count(*) from user_person_links u where u.person_id = p.id and u.status = 'active' and u.revoked_at is null)
  )::text as v
  from persons p, org
  where p.org_id = org.id and p.external_source = 'alloy_qa_fixture'
),
mygrant as (
  select 'mygrant_charge'::text as q, ch.id::text as k, json_build_object(
    'household', c.name, 'status', ch.status, 'amount_cents', ch.amount_cents, 'category', ch.charge_category,
    'service_date', ch.service_date, 'billable_on', ch.billable_on, 'posted_at', ch.posted_at, 'voided_at', ch.voided_at,
    'created_at', ch.created_at, 'description', ch.description, 'source_charge_id', ch.source_charge_id,
    'billable_source_type', ch.billable_source_type
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
    select q, k, v from household
    union all select q, k, v from campus
    union all select q, k, v from org_default
    union all select q, k, v from legacy
    union all select q, k, v from qa_link
    union all select q, k, v from mygrant
  ) x
 order by 1, 3
