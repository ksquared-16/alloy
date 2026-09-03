-- Financial transaction spine (Thread 1) — certification fixture.
--
-- Idempotent AND self-cleaning: rows a previous run created are removed first, so re-running
-- restores the PROVING STATE rather than adding to whatever survived. The cert tenant is SHARED
-- and other sessions reset it without warning.
--
-- What the spine needs, and nothing else: a household, a child, an enrolment agreement to hang an
-- enrolled child's charges off, a fixed-amount charge template for Add Charge, and the GL codes the
-- ledger renders. No opportunities, no process instances — a charge derives from a billable source,
-- not from an enrolment funnel.
\set org  '00000000-0000-4000-8000-000000000001'
\set site 'fc500000-0000-4000-8000-00000000f001'
\set hh   'fc500000-0000-4000-8000-0000000c0001'
\set kid  'fc500000-0000-4000-8000-0000000c0002'
\set agr  'fc500000-0000-4000-8000-0000000a0001'
\set tpl  'fc500000-0000-4000-8000-0000000d0001'
\set gla  'fc500000-0000-4000-8000-0000000e0001'

-- ── Remove what previous runs of THIS certification created, innermost first.
--
--    POSTED CHILDCARE MONEY REFUSES DELETE — that is the guarantee being certified, and it applies
--    to the certification's own leftovers too. `session_replication_role = replica` suspends the
--    triggers for THIS session's teardown only: restoring a proving state is not an operator action,
--    and a fixture that could delete posted money through the normal path would mean the guarantee
--    was not there. It is restored immediately after, before anything is written.
set session_replication_role = replica;

-- Money received against this account, and its applications. An application is not deletable and a
-- posted childcare payment refuses DELETE — the same guarantees, suspended for teardown only.
-- Applications go first: they reference both a payment and a charge.
delete from payment_allocations where org_id = :'org'::uuid and payment_id in
  (select id from payments where org_id = :'org'::uuid
     and billable_source_id in (:'agr'::uuid, :'hh'::uuid));
-- Refunds before receipts: `payments_refunds_payment_id_fkey` is ON DELETE RESTRICT.
delete from payments where org_id = :'org'::uuid and refunds_payment_id in
  (select id from payments where org_id = :'org'::uuid
     and billable_source_id in (:'agr'::uuid, :'hh'::uuid));
delete from payments where org_id = :'org'::uuid
  and billable_source_id in (:'agr'::uuid, :'hh'::uuid);

delete from charges where org_id = :'org'::uuid and source_charge_id in
  (select id from charges where org_id = :'org'::uuid
     and billable_source_id in (:'agr'::uuid, :'hh'::uuid));
delete from charges where org_id = :'org'::uuid
  and billable_source_id in (:'agr'::uuid, :'hh'::uuid);
delete from child_enrollment_agreements where id = :'agr'::uuid;
delete from customer_members where id = :'kid'::uuid;
delete from customers where id = :'hh'::uuid;
delete from gl_account_mappings where org_id = :'org'::uuid and key in ('fee', 'credit', 'tuition');
delete from gl_accounts where id = :'gla'::uuid;
delete from financial_charge_templates where id = :'tpl'::uuid;
delete from locations where id = :'site'::uuid;

set session_replication_role = origin;

-- ── The site an agreement is anchored to. `site_location_id` is NOT NULL on the agreement.
-- `location_type = 'site'` is not decoration: the agreement's consistency trigger refuses any
-- other kind, which is the schema saying a child is enrolled at a SITE, not at an address.
insert into locations (id, org_id, label, location_number, location_type, is_active)
values (:'site'::uuid, :'org'::uuid, 'Certification Site', 900001, 'site', true);

-- ── The household. A `customer` is a billable source in its own right — this is what a family owes
--    against BEFORE anyone is enrolled (a registration or waitlist fee).
insert into customers (id, org_id, name, customer_number, customer_type, status_key)
values (:'hh'::uuid, :'org'::uuid, 'Certification Household', 900001, 'residential', 'active');

-- ── The child. In this schema a child IS a `customer_members` row.
insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, is_active)
values (:'kid'::uuid, :'org'::uuid, :'hh'::uuid, 'Certa Childers', 'Certa', 'Childers', true);

-- ── The enrolment agreement: the OTHER childcare billable source. An enrolled child's charges hang
--    off this; the two sources are what the lineage rules must treat identically.
insert into child_enrollment_agreements
  (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key)
values
  (:'agr'::uuid, :'org'::uuid, :'kid'::uuid, :'hh'::uuid, :'site'::uuid, 'active', current_date - 30,
   'certification');

-- ── Add Charge needs a configured template. Fixed amount so the certification asserts an exact
--    number rather than whatever a resolver happens to price.
insert into financial_charge_templates
  (id, org_id, template_key, label, charge_category, trigger_type, amount_strategy, amount_cents,
   currency_code, occurs_on_strategy, billable_on_strategy, effective_start, is_active)
values
  (:'tpl'::uuid, :'org'::uuid, 'certification_fee', 'Certification fee', 'fee', 'manual', 'fixed',
   130000, 'USD', 'now', 'immediate', current_date - 365, true);

-- ── GL codes, so the ledger's GL column renders a code rather than `Unmapped`.
insert into gl_accounts (id, org_id, code, name, type, is_active)
values (:'gla'::uuid, :'org'::uuid, '4000', 'Program Revenue', 'revenue', true);

insert into gl_account_mappings (org_id, key, gl_account_id, is_active)
values (:'org'::uuid, 'fee', :'gla'::uuid, true),
       (:'org'::uuid, 'credit', :'gla'::uuid, true),
       (:'org'::uuid, 'tuition', :'gla'::uuid, true);
