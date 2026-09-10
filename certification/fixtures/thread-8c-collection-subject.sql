-- THREAD 8C — a certification subject this lane owns outright.
--
-- WHY THIS EXISTS
--
-- The mounted ACH certification ran against a household shared with every other Financials live
-- suite. Two things followed, and both were fatal to the proof rather than to the product:
--
--   1. Posted childcare money is immutable, so every settled scenario permanently consumed a day of
--      that subject's billing history. After enough runs there was no collectible obligation left to
--      collect, and no way to make one — correctly, because the money really had been paid.
--
--   2. A predecessor suite's cleanup deleted the subject's enrollment agreement. It did not mean to:
--      it cleared "this child's agreement at this site" while working on whichever customer members
--      the tenant happened to have. Afterwards every charge the certification created billed the
--      household directly, and the provider collection refused it — the product being right about a
--      subject it had no enrollment to resolve against.
--
-- So Thread 8C gets its own household, child, enrollment and opportunity, under an id prefix nothing
-- else uses, stamped with provenance no other suite matches. `source_key = 'thread-8c-certification'`
-- is the ownership claim: a suite may delete an agreement it can prove it created, and this one
-- belongs to no other suite.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It does not touch the old subject. Its charges, receipts, applications and journal entries are
-- real posted financial history and stay exactly where they are. Contaminated for certification
-- purposes is not the same as wrong, and posted money is never deleted for convenience.

\set org   '00000000-0000-4000-8000-000000000001'
\set site  '00000000-0000-4000-8000-000000000011'
\set prog  '00000000-0000-4000-8000-0000000c0004'
-- The work unit the New Leads view evaluates. A subject the view cannot page is refused outright —
-- "that record isn't in this Work View" — and rightly so: substituting a different subject would let
-- a certification prove something about a family it was never looking at.
\set unit  '00000000-0000-4000-8000-000000000031'
\set hh    '8c000000-0000-4000-8000-00000000c001'
\set kid   '8c000000-0000-4000-8000-00000000c002'
\set opp   '8c000000-0000-4000-8000-00000000e001'
\set ocm   '8c000000-0000-4000-8000-00000000e002'
\set agr   '8c000000-0000-4000-8000-00000000a001'
\set person '8c000000-0000-4000-8000-00000000b001'
\set oppper '8c000000-0000-4000-8000-00000000b002'

-- ── Remove only what THIS fixture created, innermost first. Nothing here is posted money: the
--    subject is rebuilt fresh, and any charge it has ever carried is left untouched below.
delete from enrollment_pricing_terms where enrollment_agreement_id = :'agr'::uuid;
delete from child_enrollment_agreements where id = :'agr'::uuid;
delete from opportunity_persons where id = :'oppper'::uuid;
delete from opportunity_customer_members where id = :'ocm'::uuid;
delete from opportunities where id = :'opp'::uuid;

-- The household and child survive re-runs when they already carry posted money; recreate only when
-- absent, so this fixture is safe to run against a subject that has already been billed.
insert into customers (id, org_id, name, customer_number, customer_type, status_key, metadata)
values (:'hh'::uuid, :'org'::uuid, 'Thread 8C Certification Household', 980001,
        'residential', 'active', '{"seed": "thread-8c-certification"}'::jsonb)
on conflict (id) do update set customer_type = excluded.customer_type, status_key = excluded.status_key;

-- A CHILD, not merely a member. The Work View's child lens enumerates children, and a member with
-- no `relationship` and no active status is not one — which is why an earlier version of this
-- fixture produced a subject the view refused to page.
insert into customer_members
  (id, org_id, customer_id, display_name, relationship, first_name, last_name, dob, is_active,
   status_key, metadata)
values
  (:'kid'::uuid, :'org'::uuid, :'hh'::uuid, 'Cert Thread8C', 'child', 'Cert', 'Thread8C',
   current_date - 1500, true, 'active', '{"seed": "thread-8c-certification"}'::jsonb)
on conflict (id) do update set
  relationship = excluded.relationship, status_key = excluded.status_key,
  first_name = excluded.first_name, last_name = excluded.last_name,
  dob = excluded.dob, is_active = excluded.is_active;

-- A RESPONSIBLE ADULT. The subject is a family, and the surfaces that page it expect a named
-- parent or guardian on the inquiry — without one the Work View has a case with nobody in it.
insert into persons (id, org_id, first_name, last_name, full_name, person_number)
values (:'person'::uuid, :'org'::uuid, 'Thread8C', 'Payer', 'Thread8C Payer', 980001)
on conflict (id) do nothing;


-- The Work View pages a SUBJECT, so the certification needs an opportunity to navigate to. Shaped
-- like the enrolling inquiries the view already lists, because the certification must reach the card
-- the way an operator does rather than through a URL the product would never produce.
insert into opportunities
  (id, org_id, customer_id, location_id, name, title, source, opportunity_number, work_unit_id,
   status_key, stage_key, primary_person_id, metadata)
values
  (:'opp'::uuid, :'org'::uuid, :'hh'::uuid, :'site'::uuid,
   'Thread 8C Certification — bank collection', 'Thread 8C Certification — bank collection',
   'corporate', 980001, :'unit'::uuid,
   -- The Work View lens filters on the opportunity's own stage, and refuses to page a subject that
   -- is not a member. An inquiry with no stage is not in any lens, which is correct and was why an
   -- earlier version of this fixture produced "that record isn't in this Work View".
   'open', 'enrolling', :'person'::uuid,
   '{"seed": "thread-8c-certification", "program_type": "pre_k", "schedule_type": "part_time"}'::jsonb);

insert into opportunity_persons (id, org_id, opportunity_id, person_id, role_type, metadata)
values (:'oppper'::uuid, :'org'::uuid, :'opp'::uuid, :'person'::uuid, 'parent_guardian',
        '{"seed": "thread-8c-certification", "is_primary": true}'::jsonb);

insert into opportunity_customer_members
  (id, org_id, opportunity_id, customer_member_id, schedule_type, outcome_status_key, stage_key,
   location_id, program_category_id, start_date, metadata)
values
  (:'ocm'::uuid, :'org'::uuid, :'opp'::uuid, :'kid'::uuid, 'part_time', 'enrolling', 'enrolling',
   :'site'::uuid, :'prog'::uuid, current_date + 21,
   '{"seed": "thread-8c-certification"}'::jsonb);

-- THE ENROLLMENT THIS THREAD COLLECTS AGAINST.
--
-- A provider collection resolves its allocatable net against the enrollment agreement and refuses a
-- charge billed straight to a household — so without this, every scenario here fails on a refusal
-- that is the product working. Backdated well before any service date the certification will use.
insert into child_enrollment_agreements
  (id, org_id, customer_member_id, customer_id, site_location_id, opportunity_customer_member_id,
   status, start_date, source_key)
values
  (:'agr'::uuid, :'org'::uuid, :'kid'::uuid, :'hh'::uuid, :'site'::uuid, :'ocm'::uuid,
   'active', current_date - 1200, 'thread-8c-certification');

select 'thread-8c certification subject ready' as status,
       (select count(*) from child_enrollment_agreements
         where id = :'agr'::uuid and status = 'active') as agreement,
       (select count(*) from opportunity_customer_members where id = :'ocm'::uuid) as enrolment_link;
