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
-- ── THE TENANT IS THE GOVERNED RUNNER'S, NEVER THIS FILE'S ──────────────────────────────────────
--
-- This line used to read `\set org '00000000-0000-4000-8000-000000000001'`, which is the LOCAL
-- cert tenant. psql applies `-v org=...` at startup and then reads this file, so a `\set` here
-- wins: the registered reconciliation froze one organization, the runner reported that
-- organization in `fixture_audit`, and every statement below ran against a different one. On
-- deployed staging that organization does not exist at all, and the audit would have named a
-- tenant the writes never reached.
--
-- So the fixture now chooses no tenant. An absent `org` refuses here rather than defaulting to
-- somebody's database.
\if :{?org}
\else
do $$ begin
  raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>. It does not choose a tenant for itself.';
end $$;
\endif

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

-- ── ONE TRANSACTION, OR NONE ────────────────────────────────────────────────────────────────────
--
-- psql -f is autocommit: every statement stood alone, so a foreign key that refused halfway
-- through left the statements before it committed. Against the shared local stack that was
-- survivable; against a hosted tenant holding real charges and journal entries it is not. The
-- whole fixture -- preconditions, teardown and declaration -- is now one transaction. It succeeds
-- completely or the database is untouched.
--
-- The preconditions are inside it deliberately: the sites resolved below and the rows written
-- against them are then read and written in ONE snapshot, so a site cannot be retired between the
-- lookup and the insert that depends on it.
begin;

-- ── PRECONDITIONS, BEFORE ANY MUTATION ──────────────────────────────────────────────────────────
--
-- The governed runner already probes the organization. It is probed again here because THIS file
-- is what the transaction protects, and a fixture that trusts its caller's checks is a fixture
-- with no checks.
select count(*) = 1 as org_present from orgs where id = :'org'::uuid
\gset
\if :org_present
\else
do $$ begin
  raise exception 'the governed organization does not exist on this target; a fixture seeds INTO a tenant and does not create one';
end $$;
\endif

-- ── THE CAMPUSES ARE RESOLVED FROM THE TENANT, NOT NAMED BY THIS FILE ───────────────────────────
--
-- Two agreements at one campus and two at another is what makes the site filter a real proof: a
-- site selection must change WHICH households appear. That needs two DIFFERENT sites -- it does
-- not need two PARTICULAR ones, and naming particular ones is what made this fixture run in
-- exactly one database. The previous constants were the local stack's Riverside and Lakeside;
-- deployed staging has neither, and `child_enrollment_agreements.site_location_id` is NOT NULL
-- REFERENCES locations(id), so the agreements simply could not be written there.
--
-- `order by id` rather than by name or creation time: a certification fixture must pick the same
-- two campuses on every rerun, and id is the only ordering this schema guarantees is total and
-- immutable. `location_type = 'site'` is the agreement's own consistency trigger restated --
-- a child is enrolled at a campus, not at an address.
select
  (select l.id from locations l
    where l.org_id = :'org'::uuid and l.location_type = 'site' and l.is_active
    order by l.id limit 1) as site_1,
  (select l.id from locations l
    where l.org_id = :'org'::uuid and l.location_type = 'site' and l.is_active
    order by l.id offset 1 limit 1) as site_2,
  (select count(*) >= 2 from locations l
    where l.org_id = :'org'::uuid and l.location_type = 'site' and l.is_active) as sites_ok
\gset
\if :sites_ok
\else
do $$ begin
  raise exception 'this tenant has fewer than two active site locations; the fixture proves a site filter and cannot invent a campus to prove it with';
end $$;
\endif

-- ── THE LEGACY HOUSEHOLDS ARE REBUILT ONLY WHERE THAT DESTROYS NOTHING ANYONE IS USING ────────
--
-- The teardown below deletes these households' charges, payments and journal entries with the
-- money triggers suspended. On the shared LOCAL stack that is the point: `demo-tenant.sh` passes
-- `-v legacy_reset=1` and gets the proving state back. On deployed staging these households carry
-- QA history the Director has asked to keep — residue is resolved through governed corrections,
-- never by hard deletion — so where they already exist and no reset was asked for, the whole
-- legacy block is skipped and the W7 section below still runs. (W7-F012)
select (:{?legacy_reset} or not exists (
  select 1 from customers where id = :'hh_a'::uuid and org_id = :'org'::uuid)) as legacy_rebuild
\gset
\if :legacy_rebuild

-- ── TEARDOWN ────────────────────────────────────────────────────────────────────────────────────
--
-- SET LOCAL, not SET: the suspension is bounded by this transaction and is restored by COMMIT or
-- ROLLBACK whichever happens, so a failure cannot leave a session with its triggers off. The
-- explicit restore below still stands, because the writes must face the real invariants and that
-- should be visible in the file rather than inferred from transaction semantics.
set local session_replication_role = replica;

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

-- ── SUBSIDY TEARDOWN, NARROWED TO THIS FIXTURE'S OWN CHAIN ──
--
-- These six were `where org_id = :'org'` — every subsidy claim, remittance,
-- authorization and variance in the tenant, whoever created them, deleted with
-- the protective triggers suspended. On the shared local cert stack that was
-- defensible: the tenant is disposable and other sessions reset it anyway. This
-- fixture is now reachable through a governed action against HOSTED staging,
-- where it is not, and where unrelated subsidy data may exist tomorrow even if
-- none exists today.
--
-- Every row this fixture creates in the chain descends from its own program and
-- agency, so the whole teardown is derivable from two fixture-owned ids:
--
--   authorizations   .program_id   -> :program
--   claims           .program_id   -> :program   (and .agency_id -> :agency)
--   claim_lines      .claim_id     -> those claims
--   remittances      .agency_id    -> :agency
--   remittance_lines .remittance_id-> those remittances
--   variances        .claim_line_id-> those claim lines
--
-- Innermost outward, so a foreign key never blocks its own cleanup. Emptiness of
-- these tables today is NOT the safety argument — the predicates are.
delete from financial_subsidy_variances
  where org_id = :'org'::uuid
    and claim_line_id in (
      select cl.id from financial_subsidy_claim_lines cl
        join financial_subsidy_claims c on c.id = cl.claim_id
       where c.org_id = :'org'::uuid and c.program_id = :'program'::uuid);

delete from financial_subsidy_remittance_lines
  where org_id = :'org'::uuid
    and remittance_id in (
      select r.id from financial_subsidy_remittances r
       where r.org_id = :'org'::uuid and r.agency_id = :'agency'::uuid);

delete from financial_subsidy_remittances
  where org_id = :'org'::uuid and agency_id = :'agency'::uuid;

delete from financial_subsidy_claim_lines
  where org_id = :'org'::uuid
    and claim_id in (
      select c.id from financial_subsidy_claims c
       where c.org_id = :'org'::uuid and c.program_id = :'program'::uuid);

delete from financial_subsidy_claims
  where org_id = :'org'::uuid and program_id = :'program'::uuid;

delete from financial_subsidy_authorizations
  where org_id = :'org'::uuid and program_id = :'program'::uuid;

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

set local session_replication_role = origin;

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
  (:'agr_a'::uuid, :'org'::uuid, :'kid_a'::uuid, :'hh_a'::uuid, :'site_1'::uuid, 'active',
   current_date - 120, 'demo_tenant'),
  (:'agr_b'::uuid, :'org'::uuid, :'kid_b'::uuid, :'hh_b'::uuid, :'site_2'::uuid,  'active',
   current_date - 120, 'demo_tenant'),
  (:'agr_c'::uuid, :'org'::uuid, :'kid_c'::uuid, :'hh_c'::uuid, :'site_1'::uuid, 'active',
   current_date - 120, 'demo_tenant'),
  (:'agr_d'::uuid, :'org'::uuid, :'kid_d'::uuid, :'hh_d'::uuid, :'site_2'::uuid,  'active',
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

\else
\echo 'legacy demo households already present: left untouched (pass -v legacy_reset=1 to rebuild them)'
\endif

-- =============================================================================
-- W7 QA HOUSEHOLDS — PURPOSE-BUILT FOR THE FINANCIALS + PAYMENTS HUMAN WALKTHROUGH (W7-F012)
--
-- The Director's W7 walkthrough used to run against Alvarez and whatever else staging happened to
-- hold: households carrying months of prior QA charges, payments and overrides nobody could
-- explain. These five exist ONLY for W7. Each has one job, a name that says so, a known campus, a
-- known billing resolution and a known responsibility arrangement — and no money at all until the
-- Director creates it.
--
--   W7 QA · Monthly Family     North Campus            monthly (no account override)   100% Mara
--   W7 QA · Weekly Family      South Campus            weekly location override        100% Wes
--   W7 QA · West Family        West Campus             weekly, a different anchor      100% Wren
--   W7 QA · Multi-Site Family  North + South Campus    explicit ACCOUNT calendar       50/50
--   W7 QA · Split Family       North Campus            monthly                         50/50 + Gale
--   W7 QA · Tuition Family     North Campus            monthly, recurring tuition      100% Tess
--
-- The Tuition Family (W7 Scenario 9) is the one household with an ENROLMENT ASSIGNMENT: an
-- opportunity, a child on it, and the agreement linked to that assignment — the shape the accept-
-- tuition action and `billing.generate_tuition` read. It carries no pricing term: tuition is accepted
-- afterwards through the registered `enrollment.pricing.accept` action, so the term is resolved by
-- the canonical resolver rather than written here. Its assignment starts Nov 1, 2026, so the accepted
-- term starts then too, and automatic billing has no started period to bill before the Director runs
-- Generate tuition for November.
--
-- ── CONVERGE, NEVER RESET ──
--
-- Every write is insert-if-absent and nothing here deletes. Re-running restores a missing row and
-- leaves an existing one — including whatever money the walkthrough has since created — exactly as
-- it is. Residue a walkthrough leaves behind is resolved through the governed correction path, not
-- by rebuilding the household. No `session_replication_role` window: every row faces the same
-- triggers an operator's would.
--
-- ── CAMPUSES BY NAME, FROM THIS TENANT ──
--
-- The walkthrough is about North, South and West Campus specifically, because their billing
-- calendars differ. They are resolved by name inside the governed organization; a tenant without
-- all three (the local cert stack has Riverside and Lakeside) skips this section and says so, it
-- never substitutes a different campus.
-- =============================================================================
\set w7_hh_monthly  'fd000000-0000-4000-8000-0000007c0001'
\set w7_hh_weekly   'fd000000-0000-4000-8000-0000007c0002'
\set w7_hh_west     'fd000000-0000-4000-8000-0000007c0003'
\set w7_hh_multi    'fd000000-0000-4000-8000-0000007c0004'
\set w7_hh_split    'fd000000-0000-4000-8000-0000007c0005'
\set w7_kid_milo    'fd000000-0000-4000-8000-0000007d0001'
\set w7_kid_willa   'fd000000-0000-4000-8000-0000007d0002'
\set w7_kid_wyatt   'fd000000-0000-4000-8000-0000007d0003'
\set w7_kid_mika    'fd000000-0000-4000-8000-0000007d0004'
\set w7_kid_max     'fd000000-0000-4000-8000-0000007d0005'
\set w7_kid_sasha   'fd000000-0000-4000-8000-0000007d0006'
\set w7_mara        'fd000000-0000-4000-8000-0000007b0001'
\set w7_wes         'fd000000-0000-4000-8000-0000007b0002'
\set w7_wren        'fd000000-0000-4000-8000-0000007b0003'
\set w7_morgan      'fd000000-0000-4000-8000-0000007b0004'
\set w7_sam         'fd000000-0000-4000-8000-0000007b0005'
\set w7_dana        'fd000000-0000-4000-8000-0000007b0006'
\set w7_rosa        'fd000000-0000-4000-8000-0000007b0007'
\set w7_gale        'fd000000-0000-4000-8000-0000007b0008'
\set w7_agr_milo    'fd000000-0000-4000-8000-0000007a0001'
\set w7_agr_willa   'fd000000-0000-4000-8000-0000007a0002'
\set w7_agr_wyatt   'fd000000-0000-4000-8000-0000007a0003'
\set w7_agr_mika    'fd000000-0000-4000-8000-0000007a0004'
\set w7_agr_max     'fd000000-0000-4000-8000-0000007a0005'
\set w7_agr_sasha   'fd000000-0000-4000-8000-0000007a0006'
\set w7_arr_monthly 'fd000000-0000-4000-8000-0000007e0001'
\set w7_arr_weekly  'fd000000-0000-4000-8000-0000007e0002'
\set w7_arr_west    'fd000000-0000-4000-8000-0000007e0003'
\set w7_arr_multi   'fd000000-0000-4000-8000-0000007e0004'
\set w7_arr_split   'fd000000-0000-4000-8000-0000007e0005'
\set w7_cal_multi   'fd000000-0000-4000-8000-0000007f0001'
\set w7_hh_tuition  'fd000000-0000-4000-8000-0000007c0006'
\set w7_kid_tilly   'fd000000-0000-4000-8000-0000007d0007'
\set w7_tess        'fd000000-0000-4000-8000-0000007b0009'
\set w7_agr_tilly   'fd000000-0000-4000-8000-0000007a0007'
\set w7_arr_tuition 'fd000000-0000-4000-8000-0000007e0006'
\set w7_opp_tuition 'fd000000-0000-4000-8000-000000790001'
\set w7_ocm_tilly   'fd000000-0000-4000-8000-000000790002'
-- The Tuition Family's enrolment starts on the first day of the period Scenario 9 generates.
\set w7_tuition_start '2026-11-01'
-- One fixed, known start for every W7 enrolment, arrangement and calendar.
\set w7_start '2026-09-01'

select
  (select l.id from locations l
    where l.org_id = :'org'::uuid and l.location_type = 'site' and l.is_active and l.label = 'North Campus'
    order by l.id limit 1) as w7_north,
  (select l.id from locations l
    where l.org_id = :'org'::uuid and l.location_type = 'site' and l.is_active and l.label = 'South Campus'
    order by l.id limit 1) as w7_south,
  (select l.id from locations l
    where l.org_id = :'org'::uuid and l.location_type = 'site' and l.is_active and l.label = 'West Campus'
    order by l.id limit 1) as w7_west,
  (select count(distinct l.label) = 3 from locations l
    where l.org_id = :'org'::uuid and l.location_type = 'site' and l.is_active
      and l.label in ('North Campus', 'South Campus', 'West Campus')) as w7_sites_ok
\gset

-- The Tuition Family's program, by KEY at North Campus — the tenant's own authored Toddler program,
-- whose full-time 3-day monthly private-pay rate is the one Scenario 9 expects ($1,200.00). Absent,
-- the tuition household is skipped and says so; it never substitutes another program.
select
  (select c.id from location_program_categories c
     join locations l on l.id = c.location_id
    where c.org_id = :'org'::uuid and c.key = 'toddler' and c.is_active
      and l.location_type = 'site' and l.is_active and l.label = 'North Campus'
    order by c.id limit 1) as w7_north_toddler,
  exists (select 1 from location_program_categories c
     join locations l on l.id = c.location_id
    where c.org_id = :'org'::uuid and c.key = 'toddler' and c.is_active
      and l.location_type = 'site' and l.is_active and l.label = 'North Campus') as w7_tuition_ok
\gset

\if :w7_sites_ok

insert into customers (id, org_id, name, customer_type, status_key) values
  (:'w7_hh_monthly'::uuid, :'org'::uuid, 'W7 QA · Monthly Family',    'residential', 'active'),
  (:'w7_hh_weekly'::uuid,  :'org'::uuid, 'W7 QA · Weekly Family',     'residential', 'active'),
  (:'w7_hh_west'::uuid,    :'org'::uuid, 'W7 QA · West Family',       'residential', 'active'),
  (:'w7_hh_multi'::uuid,   :'org'::uuid, 'W7 QA · Multi-Site Family', 'residential', 'active'),
  (:'w7_hh_split'::uuid,   :'org'::uuid, 'W7 QA · Split Family',      'residential', 'active')
on conflict (id) do nothing;

insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, is_active) values
  (:'w7_kid_milo'::uuid,  :'org'::uuid, :'w7_hh_monthly'::uuid, 'Milo Monthly',    'Milo',  'Monthly',   true),
  (:'w7_kid_willa'::uuid, :'org'::uuid, :'w7_hh_weekly'::uuid,  'Willa Weekly',    'Willa', 'Weekly',    true),
  (:'w7_kid_wyatt'::uuid, :'org'::uuid, :'w7_hh_west'::uuid,    'Wyatt Westbrook', 'Wyatt', 'Westbrook', true),
  (:'w7_kid_mika'::uuid,  :'org'::uuid, :'w7_hh_multi'::uuid,   'Mika Multisite',  'Mika',  'Multisite', true),
  (:'w7_kid_max'::uuid,   :'org'::uuid, :'w7_hh_multi'::uuid,   'Max Multisite',   'Max',   'Multisite', true),
  (:'w7_kid_sasha'::uuid, :'org'::uuid, :'w7_hh_split'::uuid,   'Sasha Split',     'Sasha', 'Split',     true)
on conflict (id) do nothing;

-- Record numbers are omitted: the org-scoped BEFORE INSERT trigger assigns the next free one, so
-- these can never collide with a number some other fixture or operator already holds.
insert into persons (id, org_id, first_name, last_name, full_name, status_key) values
  (:'w7_mara'::uuid,   :'org'::uuid, 'Mara',   'Monthly',   'Mara Monthly',     'active'),
  (:'w7_wes'::uuid,    :'org'::uuid, 'Wes',    'Weekly',    'Wes Weekly',       'active'),
  (:'w7_wren'::uuid,   :'org'::uuid, 'Wren',   'Westbrook', 'Wren Westbrook',   'active'),
  (:'w7_morgan'::uuid, :'org'::uuid, 'Morgan', 'Multisite', 'Morgan Multisite', 'active'),
  (:'w7_sam'::uuid,    :'org'::uuid, 'Sam',    'Multisite', 'Sam Multisite',    'active'),
  (:'w7_dana'::uuid,   :'org'::uuid, 'Dana',   'Split',     'Dana Split',       'active'),
  (:'w7_rosa'::uuid,   :'org'::uuid, 'Rosa',   'Split',     'Rosa Split',       'active'),
  (:'w7_gale'::uuid,   :'org'::uuid, 'Gale',   'Split',     'Gale Split',       'active')
on conflict (id) do nothing;

-- Every adult is an ACTIVE member of their household, so every one of them is an eligible party.
-- Gale is the point of the Split Family: eligible, on the account, and NOT responsible — the
-- person "+ Add responsible member" exists to add.
insert into customer_persons (org_id, customer_id, person_id, role_type, is_primary, status)
select :'org'::uuid, v.customer_id, v.person_id, v.role_type, v.is_primary, 'active'
  from (values
    (:'w7_hh_monthly'::uuid, :'w7_mara'::uuid,   'parent',   true),
    (:'w7_hh_weekly'::uuid,  :'w7_wes'::uuid,    'parent',   true),
    (:'w7_hh_west'::uuid,    :'w7_wren'::uuid,   'parent',   true),
    (:'w7_hh_multi'::uuid,   :'w7_morgan'::uuid, 'parent',   true),
    (:'w7_hh_multi'::uuid,   :'w7_sam'::uuid,    'parent',   false),
    (:'w7_hh_split'::uuid,   :'w7_dana'::uuid,   'parent',   true),
    (:'w7_hh_split'::uuid,   :'w7_rosa'::uuid,   'parent',   false),
    (:'w7_hh_split'::uuid,   :'w7_gale'::uuid,   'guardian', false)
  ) as v(customer_id, person_id, role_type, is_primary)
 where not exists (
   select 1 from customer_persons cp
    where cp.org_id = :'org'::uuid and cp.customer_id = v.customer_id and cp.person_id = v.person_id);

-- One enrolment per child, at the campus the family exists to exercise. The Multi-Site Family's
-- two children attend DIFFERENT campuses with different calendars — the case only an account
-- billing calendar can resolve.
insert into child_enrollment_agreements
  (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key) values
  (:'w7_agr_milo'::uuid,  :'org'::uuid, :'w7_kid_milo'::uuid,  :'w7_hh_monthly'::uuid, :'w7_north'::uuid, 'active', :'w7_start'::date, 'w7_qa_fixture'),
  (:'w7_agr_willa'::uuid, :'org'::uuid, :'w7_kid_willa'::uuid, :'w7_hh_weekly'::uuid,  :'w7_south'::uuid, 'active', :'w7_start'::date, 'w7_qa_fixture'),
  (:'w7_agr_wyatt'::uuid, :'org'::uuid, :'w7_kid_wyatt'::uuid, :'w7_hh_west'::uuid,    :'w7_west'::uuid,  'active', :'w7_start'::date, 'w7_qa_fixture'),
  (:'w7_agr_mika'::uuid,  :'org'::uuid, :'w7_kid_mika'::uuid,  :'w7_hh_multi'::uuid,   :'w7_north'::uuid, 'active', :'w7_start'::date, 'w7_qa_fixture'),
  (:'w7_agr_max'::uuid,   :'org'::uuid, :'w7_kid_max'::uuid,   :'w7_hh_multi'::uuid,   :'w7_south'::uuid, 'active', :'w7_start'::date, 'w7_qa_fixture'),
  (:'w7_agr_sasha'::uuid, :'org'::uuid, :'w7_kid_sasha'::uuid, :'w7_hh_split'::uuid,   :'w7_north'::uuid, 'active', :'w7_start'::date, 'w7_qa_fixture')
on conflict (id) do nothing;

-- ── RESPONSIBILITY — the same rows `configureResponsibilityArrangement` writes ─────────────────
--
-- A standing HOUSEHOLD arrangement (no child, no charge) per family, effective from the W7 start,
-- named people only, shares totalling exactly 100%. The shape is the service's own insert,
-- including its defaults (`responsible_party_type = 'person'`, priority 100).
insert into financial_responsibility_arrangements
  (id, org_id, customer_id, customer_member_id, effective_start, state, source_key, source_reference) values
  (:'w7_arr_monthly'::uuid, :'org'::uuid, :'w7_hh_monthly'::uuid, null, :'w7_start'::date, 'active', 'w7_qa_fixture', 'W7 QA: 100% Mara'),
  (:'w7_arr_weekly'::uuid,  :'org'::uuid, :'w7_hh_weekly'::uuid,  null, :'w7_start'::date, 'active', 'w7_qa_fixture', 'W7 QA: 100% Wes'),
  (:'w7_arr_west'::uuid,    :'org'::uuid, :'w7_hh_west'::uuid,    null, :'w7_start'::date, 'active', 'w7_qa_fixture', 'W7 QA: 100% Wren'),
  (:'w7_arr_multi'::uuid,   :'org'::uuid, :'w7_hh_multi'::uuid,   null, :'w7_start'::date, 'active', 'w7_qa_fixture', 'W7 QA: Morgan 50% / Sam 50%'),
  (:'w7_arr_split'::uuid,   :'org'::uuid, :'w7_hh_split'::uuid,   null, :'w7_start'::date, 'active', 'w7_qa_fixture', 'W7 QA: Dana 50% / Rosa 50%')
on conflict (id) do nothing;

insert into financial_responsibility_shares
  (id, org_id, arrangement_id, responsible_party_type, responsible_party_id, method, percent_basis_points, priority) values
  ('fd000000-0000-4000-8000-0000007e1001'::uuid, :'org'::uuid, :'w7_arr_monthly'::uuid, 'person', :'w7_mara'::uuid,   'percentage', 10000, 100),
  ('fd000000-0000-4000-8000-0000007e1002'::uuid, :'org'::uuid, :'w7_arr_weekly'::uuid,  'person', :'w7_wes'::uuid,    'percentage', 10000, 100),
  ('fd000000-0000-4000-8000-0000007e1003'::uuid, :'org'::uuid, :'w7_arr_west'::uuid,    'person', :'w7_wren'::uuid,   'percentage', 10000, 100),
  ('fd000000-0000-4000-8000-0000007e1004'::uuid, :'org'::uuid, :'w7_arr_multi'::uuid,   'person', :'w7_morgan'::uuid, 'percentage',  5000, 100),
  ('fd000000-0000-4000-8000-0000007e1005'::uuid, :'org'::uuid, :'w7_arr_multi'::uuid,   'person', :'w7_sam'::uuid,    'percentage',  5000, 100),
  ('fd000000-0000-4000-8000-0000007e1006'::uuid, :'org'::uuid, :'w7_arr_split'::uuid,   'person', :'w7_dana'::uuid,   'percentage',  5000, 100),
  ('fd000000-0000-4000-8000-0000007e1007'::uuid, :'org'::uuid, :'w7_arr_split'::uuid,   'person', :'w7_rosa'::uuid,   'percentage',  5000, 100)
on conflict (id) do nothing;

-- ── THE ONE ACCOUNT OVERRIDE, AND IT IS THE POINT ──────────────────────────────────────────────
--
-- The Multi-Site Family's children bill on two different location calendars; the binder refuses to
-- guess between them. An explicit account-level MONTHLY calendar is the resolution the walkthrough
-- exercises. No other W7 household carries an account override.
insert into financial_policies
  (id, org_id, scope_type, customer_id, policy_type, label, value, is_active, effective_start, source_key, metadata) values
  (:'w7_cal_multi'::uuid, :'org'::uuid, 'customer', :'w7_hh_multi'::uuid, 'billing_calendar',
   'W7 QA · Multi-Site Family account calendar', '{"cadence":"monthly","anchor_on":null}'::jsonb, true,
   :'w7_start'::date, 'w7_qa_fixture', '{"fixture":"w7_qa"}'::jsonb)
on conflict (id) do nothing;

\echo 'w7_fixture: converged (5 households, 6 children, 8 adults, 6 agreements, 5 arrangements, 1 account calendar)'

-- ── W7 QA · TUITION FAMILY — RECURRING TUITION (W7 Scenario 9) ─────────────────────────────────
--
-- One child, Tilly Tuition, at North Campus, on an enrolment assignment the canonical pricing
-- resolver can price: Toddler program, full-time attendance, three days a week. The resolver's only
-- applicable option for those facts is the organization's Toddler · full-time · 3 days · monthly ·
-- private-pay rate, so accepting tuition records one monthly term at that authored amount.
--
-- The opportunity carries NO work unit and no stage: it exists so the assignment exists, and it does
-- not appear in any Enrollment lane, Work View or waitlist the Director walks for other scenarios.
-- The agreement names the assignment it belongs to — the link `assignment_not_enrolled` asks for.
\if :w7_tuition_ok
insert into customers (id, org_id, name, customer_type, status_key) values
  (:'w7_hh_tuition'::uuid, :'org'::uuid, 'W7 QA · Tuition Family', 'residential', 'active')
on conflict (id) do nothing;

insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, is_active) values
  (:'w7_kid_tilly'::uuid, :'org'::uuid, :'w7_hh_tuition'::uuid, 'Tilly Tuition', 'Tilly', 'Tuition', true)
on conflict (id) do nothing;

insert into persons (id, org_id, first_name, last_name, full_name, status_key) values
  (:'w7_tess'::uuid, :'org'::uuid, 'Tess', 'Tuition', 'Tess Tuition', 'active')
on conflict (id) do nothing;

insert into customer_persons (org_id, customer_id, person_id, role_type, is_primary, status)
select :'org'::uuid, :'w7_hh_tuition'::uuid, :'w7_tess'::uuid, 'parent', true, 'active'
 where not exists (
   select 1 from customer_persons cp
    where cp.org_id = :'org'::uuid and cp.customer_id = :'w7_hh_tuition'::uuid and cp.person_id = :'w7_tess'::uuid);

insert into opportunities (id, org_id, customer_id, location_id, name, title, primary_person_id, metadata) values
  (:'w7_opp_tuition'::uuid, :'org'::uuid, :'w7_hh_tuition'::uuid, :'w7_north'::uuid,
   'W7 QA · Tuition Family — enrolment', 'W7 QA · Tuition Family — enrolment', :'w7_tess'::uuid,
   '{"fixture":"w7_qa","purpose":"recurring tuition assignment for W7 Scenario 9"}'::jsonb)
on conflict (id) do nothing;

insert into opportunity_customer_members
  (id, org_id, opportunity_id, customer_member_id, schedule_type, location_id, program_category_id, start_date, metadata) values
  (:'w7_ocm_tilly'::uuid, :'org'::uuid, :'w7_opp_tuition'::uuid, :'w7_kid_tilly'::uuid, 'full_time',
   :'w7_north'::uuid, :'w7_north_toddler'::uuid, :'w7_tuition_start'::date,
   '{"fixture":"w7_qa","requested_days_per_week":3}'::jsonb)
on conflict (id) do nothing;

insert into child_enrollment_agreements
  (id, org_id, customer_member_id, customer_id, site_location_id, opportunity_id, opportunity_customer_member_id,
   status, start_date, source_key) values
  (:'w7_agr_tilly'::uuid, :'org'::uuid, :'w7_kid_tilly'::uuid, :'w7_hh_tuition'::uuid, :'w7_north'::uuid,
   :'w7_opp_tuition'::uuid, :'w7_ocm_tilly'::uuid, 'pending_start', :'w7_tuition_start'::date, 'w7_qa_fixture')
on conflict (id) do nothing;

insert into financial_responsibility_arrangements
  (id, org_id, customer_id, customer_member_id, effective_start, state, source_key, source_reference) values
  (:'w7_arr_tuition'::uuid, :'org'::uuid, :'w7_hh_tuition'::uuid, null, :'w7_start'::date, 'active', 'w7_qa_fixture', 'W7 QA: 100% Tess')
on conflict (id) do nothing;

insert into financial_responsibility_shares
  (id, org_id, arrangement_id, responsible_party_type, responsible_party_id, method, percent_basis_points, priority) values
  ('fd000000-0000-4000-8000-0000007e1008'::uuid, :'org'::uuid, :'w7_arr_tuition'::uuid, 'person', :'w7_tess'::uuid, 'percentage', 10000, 100)
on conflict (id) do nothing;

\echo 'w7_tuition_fixture: converged (1 household, 1 child, 1 adult, 1 assignment, 1 agreement, 1 arrangement; tuition is accepted through enrollment.pricing.accept)'
\else
\echo 'w7_tuition_fixture: skipped: this tenant has no active Toddler program at North Campus'
\endif
\else
\echo 'w7_fixture: skipped: this tenant does not have all of North, South and West Campus as active sites'
\endif

-- All of it, or none of it.
commit;
