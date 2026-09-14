-- Read-only census: which hosted fixture household can serve as the Core Financials QA subject,
-- and is its money genuinely at zero before this run creates any?
--
-- WHY THIS RUNS BEFORE ANY WRITE. Thread 11 readiness has to seed ONE deterministic obligation and
-- then claim a clean vector for it. A vector is only clean if the household started empty, and the
-- fixture deliberately writes NO money — so "empty" is a claim about the hosted tenant, not about
-- the fixture, and it can only be settled by reading. Seeding on top of money that was already
-- there would produce a vector that is arithmetically right and evidentially worthless.
--
-- WHY IT ALSO COUNTS THE TENANT. This is a SHARED certification tenant. A household count of zero
-- and a tenant count of zero mean different things: the first is a clean subject, the second is a
-- wrong org id. Both are reported so neither can be mistaken for the other.
--
-- THE FIXTURE IDS ARE REPOSITORY-OWNED. They are declared in
-- `certification/fixtures/financials-demo-tenant.sql` and frozen there, so naming them here reads
-- the same rows the seam wrote rather than guessing at them by name.
--
-- WHY ALVAREZ AND NOT CHEN. Both are the only fixture households with a responsible adult through
-- `customer_persons`. Chen carries the fixture's subsidy authorization, and this run must prove
-- Expected Funding works with NO subsidy operational state anywhere near it. So Alvarez is the
-- subject and Chen's authorization is counted only to prove it is not attached to Alvarez.
select question_id, kind, payload
from (
    -- ── 0. IS THIS THE RIGHT TENANT AT ALL ─────────────────────────────────────────────────────
    select 'tenant'::text as question_id, 'row'::text as kind,
           ('org_exists ~ ' || count(*)::text)::text as payload, '0a'::text as sort_key
    from public.orgs where id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
    union all
    select 'tenant', 'row', 'customers_total ~ ' || count(*)::text, '0b'
    from public.customers where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
    union all
    select 'tenant', 'row', 'charges_total ~ ' || count(*)::text, '0c'
    from public.charges where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
    union all
    select 'tenant', 'row', 'payments_total ~ ' || count(*)::text, '0d'
    from public.payments where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid

    -- ── 1. FIXTURE RELATIONSHIP STATE, AS THE HANDOFF DESCRIBES IT ─────────────────────────────
    union all
    select 'fixture_state', 'row', 'customers ~ ' || count(*)::text, '1a'
    from public.customers
    where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and id in ('fd000000-0000-4000-8000-0000000c0001'::uuid, 'fd000000-0000-4000-8000-0000000c0002'::uuid,
                 'fd000000-0000-4000-8000-0000000c0003'::uuid, 'fd000000-0000-4000-8000-0000000c0004'::uuid)
    union all
    select 'fixture_state', 'row', 'customer_members ~ ' || count(*)::text, '1b'
    from public.customer_members
    where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and customer_id in ('fd000000-0000-4000-8000-0000000c0001'::uuid, 'fd000000-0000-4000-8000-0000000c0002'::uuid,
                          'fd000000-0000-4000-8000-0000000c0003'::uuid, 'fd000000-0000-4000-8000-0000000c0004'::uuid)
    union all
    select 'fixture_state', 'row', 'agreements ~ ' || count(*)::text, '1c'
    from public.child_enrollment_agreements
    where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid and source_key = 'demo_tenant'
    union all
    select 'fixture_state', 'row', 'customer_persons ~ ' || count(*)::text, '1d'
    from public.customer_persons
    where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and customer_id in ('fd000000-0000-4000-8000-0000000c0001'::uuid, 'fd000000-0000-4000-8000-0000000c0003'::uuid)
    union all
    select 'fixture_state', 'row', 'funding_agencies ~ ' || count(*)::text, '1e'
    from public.financial_funding_agencies
    where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and id = 'fd000000-0000-4000-8000-0000000f0001'::uuid
    union all
    select 'fixture_state', 'row', 'subsidy_authorizations ~ ' || count(*)::text, '1f'
    from public.financial_subsidy_authorizations
    where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid and source_key = 'demo_tenant'

    -- ── 2. THE CANDIDATE SUBJECT, NAMED ────────────────────────────────────────────────────────
    union all
    select 'subject', 'row',
           'customer ~ ' || c.id::text || ' ~ ' || c.name || ' ~ ' || coalesce(c.status_key, 'null'), '2a'
    from public.customers c
    where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and c.id = 'fd000000-0000-4000-8000-0000000c0001'::uuid
    union all
    select 'subject', 'row', 'member ~ ' || m.id::text || ' ~ ' || m.display_name || ' ~ active=' || m.is_active::text, '2b'
    from public.customer_members m
    where m.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and m.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid
    union all
    select 'subject', 'row',
           'agreement ~ ' || a.id::text || ' ~ member=' || a.customer_member_id::text
           || ' ~ site=' || coalesce(a.site_location_id::text, 'null') || ' ~ ' || a.status, '2c'
    from public.child_enrollment_agreements a
    where a.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid
    union all
    select 'subject', 'row',
           'site ~ ' || l.id::text || ' ~ ' || coalesce(l.label, 'unlabelled'), '2d'
    from public.locations l
    where l.id in (
        select a.site_location_id from public.child_enrollment_agreements a
        where a.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
          and a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid)
    union all
    -- The responsible adults, INCLUDING the one whose status is deliberately null. A read that
    -- filters on status = 'active' drops Rosa and nothing announces the loss; the census must be
    -- able to see that, so it does not filter.
    select 'subject', 'row',
           'person ~ ' || p.id::text || ' ~ ' || p.full_name || ' ~ role=' || cp.role_type
           || ' ~ primary=' || cp.is_primary::text || ' ~ status=' || coalesce(cp.status, 'NULL'), '2e'
    from public.customer_persons cp
    join public.persons p on p.id = cp.person_id
    where cp.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and cp.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid

    -- ── 3. CLEAN MONEY START FOR THE SUBJECT ───────────────────────────────────────────────────
    --
    -- Charges reach an account through `billable_source_id` = the enrollment agreement, which is
    -- the same edge `buildFinancialsCardVM` reads. Counting by customer_id would miss the charges
    -- the product can actually see and count ones it cannot.
    union all
    select 'subject_money', 'row', 'charges_posted ~ ' || count(*)::text, '3a'
    from public.charges ch
    where ch.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and ch.status = 'posted'
      and ch.billable_source_id in (
          select a.id from public.child_enrollment_agreements a
          where a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid)
    union all
    select 'subject_money', 'row', 'charges_draft ~ ' || count(*)::text, '3b'
    from public.charges ch
    where ch.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and ch.status = 'draft'
      and ch.billable_source_id in (
          select a.id from public.child_enrollment_agreements a
          where a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid)
    union all
    select 'subject_money', 'row', 'charges_other_status ~ ' || count(*)::text, '3c'
    from public.charges ch
    where ch.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and ch.status not in ('posted', 'draft')
      and ch.billable_source_id in (
          select a.id from public.child_enrollment_agreements a
          where a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid)
    union all
    select 'subject_money', 'row', 'reductions ~ ' || count(*)::text, '3d'
    from public.financial_reduction_applications r
    where r.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and r.charge_id in (
          select ch.id from public.charges ch
          where ch.billable_source_id in (
              select a.id from public.child_enrollment_agreements a
              where a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid))
    union all
    select 'subject_money', 'row', 'payments ~ ' || count(*)::text, '3e'
    from public.payments pm
    where pm.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and pm.billable_source_id in (
          select a.id from public.child_enrollment_agreements a
          where a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid)
    union all
    select 'subject_money', 'row', 'allocations ~ ' || count(*)::text, '3f'
    from public.payment_allocations pa
    where pa.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and pa.charge_id in (
          select ch.id from public.charges ch
          where ch.billable_source_id in (
              select a.id from public.child_enrollment_agreements a
              where a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid))
    union all
    select 'subject_money', 'row', 'refund_payments ~ ' || count(*)::text, '3g'
    from public.payments pm
    where pm.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and pm.direction = 'outbound'
      and pm.billable_source_id in (
          select a.id from public.child_enrollment_agreements a
          where a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid)
    union all
    select 'subject_money', 'row', 'responsibility_arrangements ~ ' || count(*)::text, '3h'
    from public.financial_responsibility_arrangements ra
    where ra.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and ra.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid
    union all
    select 'subject_money', 'row', 'responsibility_allocations ~ ' || count(*)::text, '3i'
    from public.financial_responsibility_allocations al
    where al.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and al.charge_id in (
          select ch.id from public.charges ch
          where ch.billable_source_id in (
              select a.id from public.child_enrollment_agreements a
              where a.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid))
    union all
    select 'subject_money', 'row', 'expected_funding ~ ' || count(*)::text, '3j'
    -- Expected funding carries no customer of its own: it hangs off the arrangement, the share or
    -- the allocation. Scoping it through the arrangement is the same edge the canonical reader uses.
    from public.financial_expected_funding ef
    where ef.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and ef.arrangement_id in (
          select ra.id from public.financial_responsibility_arrangements ra
          where ra.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid)
    union all
    select 'subject_money', 'row', 'subsidy_authorizations ~ ' || count(*)::text, '3k'
    from public.financial_subsidy_authorizations sa
    where sa.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      and sa.customer_id = 'fd000000-0000-4000-8000-0000000c0001'::uuid

    -- ── 4. THE CHARGE TEMPLATES THE PRODUCT WILL OFFER ─────────────────────────────────────────
    --
    -- Add Charge posts from a template. If the tenant has none active, Part 4 stops at the surface
    -- rather than inside the service, and that is worth knowing before opening a browser.
    union all
    select 'charge_templates', 'row',
           'template ~ ' || tpl.id::text || ' ~ ' || tpl.label || ' ~ ' || tpl.charge_category
           || ' ~ ' || tpl.amount_strategy || ' ~ ' || coalesce(tpl.amount_cents::text, 'null'), '4a'
    from public.financial_charge_templates tpl
    where tpl.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid and tpl.is_active is true
) q
order by sort_key, payload;
