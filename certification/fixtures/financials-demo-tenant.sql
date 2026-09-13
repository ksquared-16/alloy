-- =============================================================================
-- THE FINANCIALS WORKSPACE, GIVEN SOMETHING TO BE A WORKSPACE ABOUT.
--
-- Thread 4A proved the architecture against a tenant holding ONE enrolment agreement. Every
-- section rendered correctly and showed almost nothing, because there was almost nothing: one
-- household carrying nineteen charges is not an operating picture, it is a unit test with a UI.
-- A workspace cannot be product-certified against that, and a demo of it proves the opposite of
-- what it intends.
--
-- So this fixture builds the STRUCTURE a financial day happens to: four households with different
-- financial characters, four children, four enrolment agreements, across the two REAL sites the
-- tenant already has — Riverside and Lakeside — so site provenance is genuine rather than staged.
--
-- ── WHAT THIS FILE DOES NOT DO ──
--
-- It writes no money. Charges, payments, applications, claims and variances are created by the
-- canonical services through `certification/financials/demo-money.seed.ts`, because money has
-- invariants — posting rules, journal attribution, allocation limits, claim state machines — and a
-- fixture that INSERTed its way past them would seed a tenant the product could never have
-- produced, then certify against it. Structure is inert and safe to declare; money is earned.
--
-- ── IDEMPOTENT AND SELF-CLEANING ──
--
-- Same discipline as `financials-charge-spine.sql`: rows a previous run created are removed first,
-- innermost outward, so re-running restores the proving state rather than adding to whatever
-- survived. The cert tenant is SHARED and other sessions reset it without warning.
--
-- Posted childcare money REFUSES delete — that is the guarantee Thread 1 certifies, and it applies
-- to this fixture's leftovers too. `session_replication_role = replica` suspends triggers for THIS
-- session's teardown ONLY, and is restored before a single row is written, so every write below
-- faces the same invariants an operator's would.
-- =============================================================================
\set org       '00000000-0000-4000-8000-000000000001'
-- The tenant's two real campuses. Not invented: a demo that ships its own sites proves nothing
-- about the site semantics the product actually enforces.
\set riverside '00000000-0000-4000-8000-000000000010'
\set lakeside  '00000000-0000-4000-8000-000000000011'

-- Four households, four children, four agreements. `fd0…` is this fixture's own namespace, distinct
-- from the charge-spine fixture (`fc5…`) and the thread proofs (`6f0…`, `7c0…`), so the two can
-- coexist in one tenant without either cleaning up the other's rows.
\set hh_a  'fd000000-0000-4000-8000-0000000c0001'
\set hh_b  'fd000000-0000-4000-8000-0000000c0002'
\set hh_c  'fd000000-0000-4000-8000-0000000c0003'
\set hh_d  'fd000000-0000-4000-8000-0000000c0004'
\set kid_a 'fd000000-0000-4000-8000-0000000d0001'
\set kid_b 'fd000000-0000-4000-8000-0000000d0002'
\set kid_c 'fd000000-0000-4000-8000-0000000d0003'
\set kid_d 'fd000000-0000-4000-8000-0000000d0004'
\set agr_a 'fd000000-0000-4000-8000-0000000a0001'
\set agr_b 'fd000000-0000-4000-8000-0000000a0002'
\set agr_c 'fd000000-0000-4000-8000-0000000a0003'
\set agr_d 'fd000000-0000-4000-8000-0000000a0004'

-- Subsidy needs an agency and a program to be about. The tenant has neither.
\set agency  'fd000000-0000-4000-8000-0000000f0001'
\set program 'fd000000-0000-4000-8000-0000000f0002'

-- A responsible adult for Chen. Thread 6 divides money between real PEOPLE, and expected agency
-- funding attaches to a responsibility share — so subsidy work cannot exist without one.
\set parent_c 'fd000000-0000-4000-8000-0000000b0001'

-- ── THE HOUSEHOLD RESPONSIBILITY IS DECIDED ON ──────────────────────────────────────────────────
--
-- Alvarez carries real outstanding money and NO responsibility arrangement, which makes it the one
-- account that proves the capability can be reached from nothing — the state every household in a
-- new tenant is in, and the state Manage Responsibility was unusable in.
--
-- Two adults, because one adult cannot demonstrate a split, and the whole point of an arrangement
-- is that an obligation can be divided. They hold DIFFERENT roles (`parent`, `guardian`) so the
-- picker is proven to read the role vocabulary rather than one hard-coded value.
--
-- `child_a2` is a person carrying the `child` role on the household. Children are normally
-- `customer_members` and have no person identity at all, so without this row the exclusion rule
-- has nothing to exclude and the live certification would pass by absence. Some orgs do record a
-- child as a person; this makes that case real, and a child who must never be offered the bill.
\set parent_a1 'fd000000-0000-4000-8000-0000000b0002'
\set parent_a2 'fd000000-0000-4000-8000-0000000b0003'
\set child_a2  'fd000000-0000-4000-8000-0000000b0004'
\set kid_a2    'fd000000-0000-4000-8000-0000000d0005'

-- ── TEARDOWN ────────────────────────────────────────────────────────────────────────────────────
set session_replication_role = replica;

-- Attributions hang off an ALLOCATION, not a payment: they record which responsible party's share
-- a particular application met.
delete from payment_responsibility_attributions where org_id = :'org'::uuid
  and payment_allocation_id in (select a.id from payment_allocations a
    join payments p on p.id = a.payment_id
   where a.org_id = :'org'::uuid
     and p.billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid,
                                  :'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid));
delete from payment_allocations where org_id = :'org'::uuid
  and payment_id in (select id from payments where org_id = :'org'::uuid
    and billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid,
                               :'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid));
-- Refunds before receipts: `payments_refunds_payment_id_fkey` is ON DELETE RESTRICT.
delete from payments where org_id = :'org'::uuid and refunds_payment_id in
  (select id from payments where org_id = :'org'::uuid
     and billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid,
                                :'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid));
delete from payments where org_id = :'org'::uuid
  and billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid,
                             :'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid);

-- The journal names its billable source directly; it has no charge_id column.
delete from financial_journal_entries where org_id = :'org'::uuid
  and billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid,
                             :'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid);
delete from financial_responsibility_allocations where org_id = :'org'::uuid
  and charge_id in (select id from charges where org_id = :'org'::uuid
    and billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid));
delete from financial_reduction_applications where org_id = :'org'::uuid
  and charge_id in (select id from charges where org_id = :'org'::uuid
    and billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid));
delete from charges where org_id = :'org'::uuid and source_charge_id in
  (select id from charges where org_id = :'org'::uuid
     and billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid,
                                :'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid));
delete from charges where org_id = :'org'::uuid
  and billable_source_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid,
                             :'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid);

delete from financial_subsidy_variances where org_id = :'org'::uuid;
delete from financial_subsidy_remittance_lines where org_id = :'org'::uuid;
delete from financial_subsidy_remittances where org_id = :'org'::uuid;
delete from financial_subsidy_claim_lines where org_id = :'org'::uuid;
delete from financial_subsidy_claims where org_id = :'org'::uuid;
delete from financial_subsidy_authorizations where org_id = :'org'::uuid;
delete from financial_subsidy_programs where id = :'program'::uuid;
delete from financial_funding_agencies where id = :'agency'::uuid;

delete from financial_expected_funding where org_id = :'org'::uuid
  and arrangement_id in (select id from financial_responsibility_arrangements where org_id = :'org'::uuid
    and customer_id in (:'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid));
delete from financial_responsibility_shares where org_id = :'org'::uuid
  and arrangement_id in (select id from financial_responsibility_arrangements where org_id = :'org'::uuid
    and customer_id in (:'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid));
delete from financial_responsibility_arrangements where org_id = :'org'::uuid
  and customer_id in (:'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid);

delete from enrollment_pricing_terms where org_id = :'org'::uuid
  and enrollment_agreement_id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid);
delete from child_enrollment_agreements
  where id in (:'agr_a'::uuid, :'agr_b'::uuid, :'agr_c'::uuid, :'agr_d'::uuid);
delete from customer_members
  where id in (:'kid_a'::uuid, :'kid_b'::uuid, :'kid_c'::uuid, :'kid_d'::uuid, :'kid_a2'::uuid);
delete from customer_persons where org_id = :'org'::uuid and person_id in
  (:'parent_c'::uuid, :'parent_a1'::uuid, :'parent_a2'::uuid, :'child_a2'::uuid);
delete from customers
  where id in (:'hh_a'::uuid, :'hh_b'::uuid, :'hh_c'::uuid, :'hh_d'::uuid);
delete from persons where id in
  (:'parent_c'::uuid, :'parent_a1'::uuid, :'parent_a2'::uuid, :'child_a2'::uuid);

set session_replication_role = origin;

-- ── HOUSEHOLDS ──────────────────────────────────────────────────────────────────────────────────
--
-- Four financial characters, so the workspace has something to sort, filter and worry about:
--
--   Alvarez  — carries real outstanding money, part-paid. The account an operator opens first.
--   Brennan  — settled. Proves "current" is a state the surface can show, not just an empty row.
--   Chen     — agency-funded, with a claim that will not reconcile. The variance case.
--   Okafor   — money received that is not yet applied to anything. The unapplied case.
--
-- Names are unmistakably synthetic. A demo tenant that reads like real families is a demo tenant
-- someone eventually mistakes for one.
insert into customers (id, org_id, name, customer_number, customer_type, status_key) values
  (:'hh_a'::uuid, :'org'::uuid, 'Alvarez Household (demo)', 900010, 'residential', 'active'),
  (:'hh_b'::uuid, :'org'::uuid, 'Brennan Household (demo)', 900011, 'residential', 'active'),
  (:'hh_c'::uuid, :'org'::uuid, 'Chen Household (demo)',    900012, 'residential', 'active'),
  (:'hh_d'::uuid, :'org'::uuid, 'Okafor Household (demo)',  900013, 'residential', 'active');

insert into customer_members
  (id, org_id, customer_id, display_name, first_name, last_name, is_active) values
  (:'kid_a'::uuid, :'org'::uuid, :'hh_a'::uuid, 'Ana Alvarez',   'Ana',   'Alvarez', true),
  (:'kid_b'::uuid, :'org'::uuid, :'hh_b'::uuid, 'Ben Brennan',   'Ben',   'Brennan', true),
  (:'kid_c'::uuid, :'org'::uuid, :'hh_c'::uuid, 'Cai Chen',      'Cai',   'Chen',    true),
  (:'kid_d'::uuid, :'org'::uuid, :'hh_d'::uuid, 'Obi Okafor',    'Obi',   'Okafor',  true),
  -- A SECOND CHILD ON ONE ACCOUNT. `billing.configure_responsibility` records an arrangement for a
  -- HOUSEHOLD, and an account with one child cannot show the difference between "this family's
  -- money" and "this child's money". Rio has no agreement and therefore no charges of their own —
  -- the claim under test is the grain of the arrangement, not a second stream of billing.
  (:'kid_a2'::uuid, :'org'::uuid, :'hh_a'::uuid, 'Rio Alvarez',   'Rio',   'Alvarez', true);

-- ── THE ADULT WHO OWES ───────────────────────────────────────────────────────────────────────────
--
-- Thread 6 divides an obligation between named people, and Thread 9's expected funding attaches to
-- one of those shares. Without a responsible adult on the account there is no share, so there is
-- nothing for agency money to be expected AGAINST — which is why an authorization alone left the
-- Subsidy surface correctly empty.
insert into persons (id, org_id, first_name, last_name, full_name, person_number, status_key) values
  (:'parent_c'::uuid, :'org'::uuid, 'Mei', 'Chen', 'Mei Chen', 900014, 'active');

-- The 9009xx block, not 9000xx: 900015-900019 are already taken by other fixtures in this shared
-- tenant, and a certification that cannot be re-seeded twice is not a certification.
insert into persons (id, org_id, first_name, last_name, full_name, person_number, status_key) values
  (:'parent_a1'::uuid, :'org'::uuid, 'Dana', 'Alvarez', 'Dana Alvarez', 900915, 'active'),
  (:'parent_a2'::uuid, :'org'::uuid, 'Rosa', 'Alvarez', 'Rosa Alvarez', 900916, 'active'),
  (:'child_a2'::uuid,  :'org'::uuid, 'Ana',  'Alvarez', 'Ana Alvarez',  900917, 'active');

-- ── THE CANONICAL HOUSEHOLD EDGE ────────────────────────────────────────────────────────────────
--
-- `customer_persons` is how the product knows which people belong to an account: customer to
-- person, with a role, a status and date bounds. It is the edge Manage Responsibility reads, and
-- these rows are declared here rather than through `contacts` BECAUSE that is the defect — the
-- picker read a table this tenant has zero rows in, so every household offered nobody.
--
-- The `child` row is deliberate and must stay: it is the only thing making "a child is never
-- offered the bill" a live claim instead of a vacuous one.
--
-- `status` IS NULLABLE AND HAS NO DEFAULT. 1,800 rows in this tenant say 'active' and two say
-- nothing at all, so Rosa's status is deliberately left unset: a read that filters on
-- `status = 'active'` drops her, the account shows one adult instead of two, and nothing announces
-- the loss. The certification must be able to see that happen.
insert into customer_persons (org_id, customer_id, person_id, role_type, is_primary, status) values
  (:'org'::uuid, :'hh_c'::uuid, :'parent_c'::uuid,  'parent',   true,  'active'),
  (:'org'::uuid, :'hh_a'::uuid, :'parent_a1'::uuid, 'parent',   true,  'active'),
  (:'org'::uuid, :'hh_a'::uuid, :'parent_a2'::uuid, 'guardian', false, null),
  (:'org'::uuid, :'hh_a'::uuid, :'child_a2'::uuid,  'child',    false, 'active');

-- ── AGREEMENTS, SPLIT ACROSS BOTH CAMPUSES ──────────────────────────────────────────────────────
--
-- Two at Riverside, two at Lakeside. This is what makes the site filter a real proof rather than a
-- control that narrows an already-single-site list to itself: a site selection must change WHICH
-- households appear, and the only way to certify that is for the answer to differ.
--
-- `site_location_id` on the agreement is the site a charge resolves to
-- (charge -> billable_source -> child_enrollment_agreements.site_location_id). The agreement's
-- consistency trigger refuses a location that is not a `site`, which is the schema insisting a
-- child is enrolled at a campus, not at an address.
insert into child_enrollment_agreements
  (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key) values
  (:'agr_a'::uuid, :'org'::uuid, :'kid_a'::uuid, :'hh_a'::uuid, :'riverside'::uuid, 'active',
   current_date - 120, 'demo_tenant'),
  (:'agr_b'::uuid, :'org'::uuid, :'kid_b'::uuid, :'hh_b'::uuid, :'lakeside'::uuid,  'active',
   current_date - 120, 'demo_tenant'),
  (:'agr_c'::uuid, :'org'::uuid, :'kid_c'::uuid, :'hh_c'::uuid, :'riverside'::uuid, 'active',
   current_date - 120, 'demo_tenant'),
  (:'agr_d'::uuid, :'org'::uuid, :'kid_d'::uuid, :'hh_d'::uuid, :'lakeside'::uuid,  'active',
   current_date - 120, 'demo_tenant');

-- ── AN AGENCY AND A PROGRAM ─────────────────────────────────────────────────────────────────────
--
-- Thread 9's surfaces are empty in this tenant for a plain reason: there is no agency to be funded
-- by and no program to claim against. Subsidy work cannot be demonstrated without them, and
-- inventing them inside the workspace would be a second subsidy product.
insert into financial_funding_agencies (id, org_id, name, agency_key, jurisdiction, is_active) values
  (:'agency'::uuid, :'org'::uuid, 'State Childcare Assistance (demo)', 'demo_state_cca', 'STATE', true);

insert into financial_subsidy_programs
  (id, org_id, agency_id, name, program_key, funding_source_type, jurisdiction, is_active) values
  (:'program'::uuid, :'org'::uuid, :'agency'::uuid, 'Childcare Assistance Program (demo)',
   'demo_ccap', 'government_subsidy', 'STATE', true);

-- ── AN AUTHORIZATION TO CLAIM AGAINST ───────────────────────────────────────────────────────────
--
-- Chen is authorized for agency funding with a family copay, which is the shape that makes subsidy
-- interesting: the family still owes something, the agency owes the rest, and the two must not be
-- confused for one another. The claim, remittance and the variance that follows are built by the
-- canonical subsidy commands, not declared here.
insert into financial_subsidy_authorizations
  (id, org_id, program_id, customer_id, customer_member_id, coverage_start, coverage_end,
   authorized_amount_cents, family_copay_cents, state, source_key) values
  ('fd000000-0000-4000-8000-0000000f0003'::uuid, :'org'::uuid, :'program'::uuid, :'hh_c'::uuid,
   :'kid_c'::uuid, current_date - 90, current_date + 180, 90000, 15000, 'active', 'demo_tenant');
