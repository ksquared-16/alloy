-- Enrollment Context Convergence — certification fixtures.
--
-- Idempotent, and self-cleaning: rows previous runs created are removed first, so the file
-- restores the PROVING STATE rather than merely adding to whatever survived. A cert fixture that
-- is idempotent only against a freshly reset tenant silently changes what a re-run proves.
--
-- The cert tenant is SHARED and other sessions reset it without warning; re-running this restores
-- every case without touching seeded data.
\set org '00000000-0000-4000-8000-000000000001'
\set riverside '00000000-0000-4000-8000-000000000010'
\set lakeside  '00000000-0000-4000-8000-000000000011'

-- ── Remove what previous runs of THIS certification created, innermost first.
delete from schedule_assignments where org_id = :'org'::uuid and customer_member_id in
  (select id from customer_members where customer_id::text like 'ecc0%');
delete from child_placements where org_id = :'org'::uuid and customer_member_id in
  (select id from customer_members where customer_id::text like 'ecc0%');
delete from child_enrollment_agreements where org_id = :'org'::uuid and customer_member_id in
  (select id from customer_members where customer_id::text like 'ecc0%');
delete from process_instances where org_id = :'org'::uuid and subject_id in
  (select id from customer_members where customer_id::text like 'ecc0%');
delete from customer_members where customer_id::text like 'ecc0%';
delete from opportunities where id::text like 'ecc0%';
delete from work_units where id::text like 'ecc0%';
delete from customers where id::text like 'ecc0%';

-- ── PLACEMENT VOCABULARY. The tenant seeds no programs or schedule patterns at all, so Direct
-- Enroll would be blocked everywhere and Scenario C could never pass. Riverside gets both;
-- LAKESIDE DELIBERATELY GETS NO SCHEDULE PATTERN — that absence is the negative control in
-- Scenario D, and adding one there would destroy the proof.
insert into location_program_categories (id, org_id, location_id, key, label, is_active) values
  ('ecc00000-0000-4000-8000-00000000c001'::uuid, :'org'::uuid, :'riverside'::uuid, 'infant', 'Infant', true),
  ('ecc00000-0000-4000-8000-00000000c002'::uuid, :'org'::uuid, :'lakeside'::uuid,  'infant', 'Infant', true)
on conflict (id) do nothing;

insert into schedule_patterns (id, org_id, site_location_id, key, label, schedule_type_key, weekdays, is_active) values
  ('ecc00000-0000-4000-8000-0000000f5001'::uuid, :'org'::uuid, :'riverside'::uuid, 'full_day', 'Full day (Mon–Fri)', 'full_day', '{1,2,3,4,5}', true)
on conflict (id) do nothing;

-- ══ SCENARIO A — a household with a genuinely LIVE episode ══════════════════════════════════════
-- Child A's journey is RUNNING (`enrolling`) inside an opportunity whose work unit is ACTIVE.
insert into customers (id, org_id, name) values
  ('ecc00000-0000-4000-8000-00000000a001'::uuid, :'org'::uuid, 'Ecclive Family')
on conflict (id) do nothing;

insert into work_units (id, org_id, department_id, key, name, is_active)
select 'ecc00000-0000-4000-8000-00000000a000'::uuid, :'org'::uuid, department_id, 'ecc_live_unit', 'ECC Live (cert)', true
from work_units where key = 'enrollment_pipeline' limit 1
on conflict (id) do nothing;

insert into opportunities (id, org_id, customer_id, name, work_unit_id) values
  ('ecc00000-0000-4000-8000-00000000a002'::uuid, :'org'::uuid, 'ecc00000-0000-4000-8000-00000000a001'::uuid, 'Ecclive enrollment (live)', 'ecc00000-0000-4000-8000-00000000a000'::uuid)
on conflict (id) do nothing;

insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active, person_id) values
  ('ecc00000-0000-4000-8000-00000000a003'::uuid, :'org'::uuid, 'ecc00000-0000-4000-8000-00000000a001'::uuid, 'Ada Ecclive', 'Ada', 'Ecclive', '2021-04-04', 'child', true, null)
on conflict (id) do nothing;

insert into process_instances (id, org_id, process_key, subject_type, subject_id, context_type, context_id, state, stage_key) values
  ('ecc00000-0000-4000-8000-00000000a004'::uuid, :'org'::uuid, 'enrollment', 'child', 'ecc00000-0000-4000-8000-00000000a003'::uuid, 'opportunity', 'ecc00000-0000-4000-8000-00000000a002'::uuid, 'enrolling', 'registration')
on conflict (id) do nothing;

-- ══ SCENARIO B — a household whose only episode is CLOSED ═══════════════════════════════════════
-- Both signals point the same way: the work unit is inactive AND the journey concluded. Attaching a
-- 2026 sibling here would reopen finished history.
insert into customers (id, org_id, name) values
  ('ecc00000-0000-4000-8000-00000000b001'::uuid, :'org'::uuid, 'Eccclosed Family')
on conflict (id) do nothing;

insert into work_units (id, org_id, department_id, key, name, is_active)
select 'ecc00000-0000-4000-8000-00000000b000'::uuid, :'org'::uuid, department_id, 'ecc_closed_unit', 'ECC Closed (cert)', false
from work_units where key = 'enrollment_pipeline' limit 1
on conflict (id) do nothing;

insert into opportunities (id, org_id, customer_id, name, work_unit_id) values
  ('ecc00000-0000-4000-8000-00000000b002'::uuid, :'org'::uuid, 'ecc00000-0000-4000-8000-00000000b001'::uuid, 'Eccclosed enrollment (2025, completed)', 'ecc00000-0000-4000-8000-00000000b000'::uuid)
on conflict (id) do nothing;

insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active, person_id) values
  ('ecc00000-0000-4000-8000-00000000b003'::uuid, :'org'::uuid, 'ecc00000-0000-4000-8000-00000000b001'::uuid, 'Bo Eccclosed', 'Bo', 'Eccclosed', '2019-01-01', 'child', true, null)
on conflict (id) do nothing;

insert into process_instances (id, org_id, process_key, subject_type, subject_id, context_type, context_id, state, stage_key) values
  ('ecc00000-0000-4000-8000-00000000b004'::uuid, :'org'::uuid, 'enrollment', 'child', 'ecc00000-0000-4000-8000-00000000b003'::uuid, 'opportunity', 'ecc00000-0000-4000-8000-00000000b002'::uuid, 'enrolled', 'enrolled')
on conflict (id) do nothing;

-- ══ SCENARIO C / D — a settled household, no episode at all ═════════════════════════════════════
insert into customers (id, org_id, name) values
  ('ecc00000-0000-4000-8000-00000000d001'::uuid, :'org'::uuid, 'Eccdirect Family')
on conflict (id) do nothing;

-- ══ THE RESOLVER PROOF — a household holding BOTH a closed and a live episode ══════════════════
-- Start Enrollment must pick the LIVE one. The closed episode is deliberately created LATER (a
-- higher id sorts after), so a resolver taking "the newest row" would pick the wrong one and fail.
insert into customers (id, org_id, name) values
  ('ecc00000-0000-4000-8000-00000000e001'::uuid, :'org'::uuid, 'Eccboth Family')
on conflict (id) do nothing;

insert into work_units (id, org_id, department_id, key, name, is_active)
select 'ecc00000-0000-4000-8000-00000000e000'::uuid, :'org'::uuid, department_id, 'ecc_both_live_unit', 'ECC Both Live (cert)', true
from work_units where key = 'enrollment_pipeline' limit 1
on conflict (id) do nothing;

insert into opportunities (id, org_id, customer_id, name, work_unit_id) values
  -- the LIVE episode (lower id)
  ('ecc00000-0000-4000-8000-00000000e002'::uuid, :'org'::uuid, 'ecc00000-0000-4000-8000-00000000e001'::uuid, 'Eccboth enrollment (live)', 'ecc00000-0000-4000-8000-00000000e000'::uuid),
  -- the CLOSED episode (higher id — "newest by row order")
  ('ecc00000-0000-4000-8000-00000000e009'::uuid, :'org'::uuid, 'ecc00000-0000-4000-8000-00000000e001'::uuid, 'Eccboth enrollment (2025, completed)', 'ecc00000-0000-4000-8000-00000000b000'::uuid)
on conflict (id) do nothing;

insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active, person_id) values
  ('ecc00000-0000-4000-8000-00000000e003'::uuid, :'org'::uuid, 'ecc00000-0000-4000-8000-00000000e001'::uuid, 'Cy Eccboth', 'Cy', 'Eccboth', '2020-02-02', 'child', true, null)
on conflict (id) do nothing;

insert into process_instances (id, org_id, process_key, subject_type, subject_id, context_type, context_id, state, stage_key) values
  ('ecc00000-0000-4000-8000-00000000e004'::uuid, :'org'::uuid, 'enrollment', 'child', 'ecc00000-0000-4000-8000-00000000e003'::uuid, 'opportunity', 'ecc00000-0000-4000-8000-00000000e002'::uuid, 'enrolling', 'registration')
on conflict (id) do nothing;

-- ── Bracket. Compare BEFORE and AFTER every browser run: the tenant is shared, and another
-- session's reset reads as a product failure when it is an environment failure.
select 'ecc opportunities' k, count(*)::text v from opportunities where id::text like 'ecc0%'
union all select 'ecc children', count(*)::text from customer_members where customer_id::text like 'ecc0%'
union all select 'ecc process_instances', count(*)::text from process_instances where subject_id in (select id from customer_members where customer_id::text like 'ecc0%')
union all select 'ecc agreements', count(*)::text from child_enrollment_agreements where customer_member_id in (select id from customer_members where customer_id::text like 'ecc0%')
union all select 'ecc placements', count(*)::text from child_placements where customer_member_id in (select id from customer_members where customer_id::text like 'ecc0%')
union all select 'ecc schedule assignments', count(*)::text from schedule_assignments where customer_member_id in (select id from customer_members where customer_id::text like 'ecc0%')
union all select 'riverside schedule patterns', count(*)::text from schedule_patterns where site_location_id = :'riverside'::uuid and is_active
union all select 'lakeside schedule patterns (must be 0)', count(*)::text from schedule_patterns where site_location_id = :'lakeside'::uuid and is_active;
