-- Records Workspace V1 + Durable Record Attention — certification fixtures.
--
-- Idempotent. The cert tenant is SHARED, so another session's `reset` can remove these at any time;
-- re-running this file restores them without touching seeded data.
\set org '00000000-0000-4000-8000-000000000001'

-- ── Configured positions. Records' position cohorts are built from THESE rows, which is what makes
-- "Lead Teachers" a tenant fact rather than a platform string.
insert into employment_positions (id, org_id, key, label, is_active) values
  ('aaaa0000-0000-4000-8000-0000000c0001'::uuid, :'org'::uuid, 'lead_teacher', 'Lead Teacher', true),
  ('aaaa0000-0000-4000-8000-0000000c0002'::uuid, :'org'::uuid, 'assistant_teacher', 'Assistant Teacher', true)
on conflict (id) do nothing;

-- ── Staff, exactly as `staff.add` creates them: persons + employments, no household, no case.
insert into persons (id, org_id, first_name, last_name, full_name, external_source) values
  ('aaaa0000-0000-4000-8000-000000000f01'::uuid, :'org'::uuid, 'Dana',  'Okafor', 'Dana Okafor', 'staff_add'),
  ('aaaa0000-0000-4000-8000-000000000f02'::uuid, :'org'::uuid, 'Sam',   'Rivera', 'Sam Rivera',  'staff_add'),
  ('aaaa0000-0000-4000-8000-000000000f03'::uuid, :'org'::uuid, 'Priya', 'Nair',   'Priya Nair',  'staff_add'),
  ('aaaa0000-0000-4000-8000-000000000f04'::uuid, :'org'::uuid, 'Chris', 'Bell',   'Chris Bell',  'staff_add')
on conflict (id) do nothing;

insert into employments (id, org_id, person_id, employment_status, employment_type, position_id, start_date, end_date, source_key, metadata) values
  -- active Lead Teacher
  ('aaaa0000-0000-4000-8000-000000000e01'::uuid, :'org'::uuid, 'aaaa0000-0000-4000-8000-000000000f01'::uuid, 'active', 'full_time', 'aaaa0000-0000-4000-8000-0000000c0001'::uuid, '2026-01-05', null, 'staff_add', '{}'::jsonb),
  -- another active role
  ('aaaa0000-0000-4000-8000-000000000e02'::uuid, :'org'::uuid, 'aaaa0000-0000-4000-8000-000000000f02'::uuid, 'active', 'part_time', 'aaaa0000-0000-4000-8000-0000000c0002'::uuid, '2026-02-02', null, 'staff_add', '{}'::jsonb),
  -- STARTING SOON: open employment, future start
  ('aaaa0000-0000-4000-8000-000000000e03'::uuid, :'org'::uuid, 'aaaa0000-0000-4000-8000-000000000f03'::uuid, 'active', 'full_time', 'aaaa0000-0000-4000-8000-0000000c0001'::uuid, '2026-09-01', null, 'staff_add', '{}'::jsonb),
  -- INACTIVE: ended
  ('aaaa0000-0000-4000-8000-000000000e04'::uuid, :'org'::uuid, 'aaaa0000-0000-4000-8000-000000000f04'::uuid, 'ended',  'full_time', 'aaaa0000-0000-4000-8000-0000000c0002'::uuid, '2025-03-01', '2026-06-30', 'staff_add', '{}'::jsonb)
on conflict (id) do nothing;

-- ── Children. `person_id` stays NULL throughout, which is the seeded default in this tenant and the
-- case a person-keyed surface would lose entirely.
insert into customers (id, org_id, name) values
  ('bbbb0000-0000-4000-8000-00000000b001'::uuid, :'org'::uuid, 'Durable Household B'),
  ('cccc0000-0000-4000-8000-00000000c001'::uuid, :'org'::uuid, 'Durable Household C'),
  ('eeee0000-0000-4000-8000-00000000e001'::uuid, :'org'::uuid, 'Durable Household E')
on conflict (id) do nothing;

insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active, person_id) values
  -- no enrollment process at all
  ('bbbb0000-0000-4000-8000-00000000b002'::uuid, :'org'::uuid, 'bbbb0000-0000-4000-8000-00000000b001'::uuid, 'Noah Bell',  'Noah',  'Bell',  '2020-11-30', 'child', true,  null),
  -- closed/completed enrollment (its work unit is inactive)
  ('cccc0000-0000-4000-8000-00000000c002'::uuid, :'org'::uuid, 'cccc0000-0000-4000-8000-00000000c001'::uuid, 'Ada Okafor', 'Ada',   'Okafor','2022-03-09', 'child', true,  null),
  -- active enrollment participation
  ('eeee0000-0000-4000-8000-00000000e002'::uuid, :'org'::uuid, 'eeee0000-0000-4000-8000-00000000e001'::uuid, 'Ivy Nair',   'Ivy',   'Nair',  '2021-05-20', 'child', true,  null),
  -- enrolled (completed participation)
  ('eeee0000-0000-4000-8000-00000000e004'::uuid, :'org'::uuid, 'eeee0000-0000-4000-8000-00000000e001'::uuid, 'Leo Nair',   'Leo',   'Nair',  '2019-09-09', 'child', true,  null),
  -- inactive membership
  ('eeee0000-0000-4000-8000-00000000e005'::uuid, :'org'::uuid, 'eeee0000-0000-4000-8000-00000000e001'::uuid, 'Mia Nair',   'Mia',   'Nair',  '2018-04-04', 'child', false, null)
on conflict (id) do nothing;

-- Closed-enrollment case: the opportunity exists, its work unit is INACTIVE.
insert into work_units (id, org_id, department_id, key, name, is_active)
select 'cccc0000-0000-4000-8000-00000000c000'::uuid, :'org'::uuid, department_id, 'closed_enrollment_cert', 'Closed Enrollment (cert)', false
from work_units where key = 'enrollment_pipeline' limit 1
on conflict (id) do nothing;

insert into opportunities (id, org_id, customer_id, name, work_unit_id)
values ('cccc0000-0000-4000-8000-00000000c003'::uuid, :'org'::uuid, 'cccc0000-0000-4000-8000-00000000c001'::uuid, 'Okafor enrollment (completed)', 'cccc0000-0000-4000-8000-00000000c000'::uuid)
on conflict (id) do nothing;

-- Participation, keyed by the MEMBER — the same subject id Records opens.
insert into process_instances (id, org_id, process_key, subject_type, subject_id, state, stage_key) values
  ('eeee0000-0000-4000-8000-00000000e003'::uuid, :'org'::uuid, 'enrollment', 'child', 'eeee0000-0000-4000-8000-00000000e002'::uuid, 'active',    'registration'),
  ('eeee0000-0000-4000-8000-00000000e006'::uuid, :'org'::uuid, 'enrollment', 'child', 'eeee0000-0000-4000-8000-00000000e004'::uuid, 'completed', 'enrolled')
on conflict (id) do nothing;

select 'positions' k, count(*)::text v from employment_positions where org_id = :'org'::uuid
union all select 'employments', count(*)::text from employments where org_id = :'org'::uuid
union all select 'fixture children', count(*)::text from customer_members where id::text like 'bbbb%' or id::text like 'cccc%' or id::text like 'eeee%'
union all select 'participation', count(*)::text from process_instances where subject_type = 'child';

-- ── BEYOND-PAGE children. Named to sort LAST so they are provably outside page 1 of the All
-- ordering (the tenant seeds ~1500 children whose names start R/S). Under client-side cohort
-- filtering these were invisible in Enrolled / In Process; the proof is load-bearing only because
-- they sort late, so do NOT rename them to land earlier.
insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active, person_id) values
  ('ffff0000-0000-4000-8000-00000000f001'::uuid, :'org'::uuid, 'eeee0000-0000-4000-8000-00000000e001'::uuid, 'Zoe Zeta-Beyondpage',  'Zoe',  'Zeta-Beyondpage', '2021-02-02', 'child', true, null),
  ('ffff0000-0000-4000-8000-00000000f002'::uuid, :'org'::uuid, 'eeee0000-0000-4000-8000-00000000e001'::uuid, 'Zane Zeta-Beyondpage', 'Zane', 'Zeta-Beyondpage', '2020-06-06', 'child', true, null)
on conflict (id) do nothing;

insert into process_instances (id, org_id, process_key, subject_type, subject_id, state, stage_key) values
  ('ffff0000-0000-4000-8000-00000000f003'::uuid, :'org'::uuid, 'enrollment', 'child', 'ffff0000-0000-4000-8000-00000000f001'::uuid, 'completed', 'enrolled'),
  ('ffff0000-0000-4000-8000-00000000f004'::uuid, :'org'::uuid, 'enrollment', 'child', 'ffff0000-0000-4000-8000-00000000f002'::uuid, 'active',    'registration')
on conflict (id) do nothing;
