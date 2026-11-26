-- UX-4 — expected vs actual operating truth, on one day, at one site.
--
-- The cert tenant holds NONE of the inputs this needs: zero program categories, zero ratio rules,
-- zero committed child assignments at any site, zero attendance events and zero presence events.
-- Certifying "the Day Roster shows expected beside actual" against that would have proven only that
-- two zeros render, which a surface reading nothing at all would also pass.
--
-- ── IT AUTHORS ONLY CANONICAL FACTS ──
--
-- Ratio rule + tiers, program category, enrollment agreement, committed placement, schedule
-- assignment, `child_attendance_events`, `staff_presence_events`. No fixture-only projection, no
-- shortcut column, nothing that writes a verdict directly. Every number the browser asserts is
-- DERIVED by the same ratio engine and the same fold the product uses — which is the only way this
-- can prove the product rather than prove the fixture.
--
-- ── ITS OWN SITE, ROOMS AND DAY ──
--
-- A dedicated site with dedicated rooms, so reapplication cannot corrupt the Riverside/Lakeside
-- state the other certifications depend on. The service date is the org's TODAY, resolved at apply
-- time rather than hardcoded: attendance is a today-only surface and a fixed date would rot.
--
-- ── THE FACT TABLES ARE APPEND-ONLY, AND THE DATABASE ENFORCES IT ──
--
-- `prevent_child_attendance_events_mutation` raises on DELETE: "record a correction or reversal
-- event instead". So this fixture never deletes a fact. An earlier draft did, on the assumption that
-- append-only was a product convention rather than a storage rule, and the second apply failed
-- loudly — which is the trigger doing exactly its job.
--
-- Idempotence comes from DETERMINISTIC IDENTITY instead: each event's id is derived from its own
-- service date, so re-applying on the same day inserts nothing (`on conflict do nothing`) and the
-- present count cannot drift, while a new day gets its own event rather than inheriting yesterday's.
\set org '00000000-0000-4000-8000-000000000001'

-- ── THE ORG'S SERVICE DATE, resolved the way the runtime resolves it ──
--
-- `resolveOperationalEnrollmentTodayYmd` formats "now" in the ORG'S timezone, never the server's.
-- Computing that here rather than using `current_date` keeps the fixture and the API on the same day
-- when the two differ — which is precisely the hour either side of midnight when an off-by-one would
-- make every actual count read as zero and look like a product defect.
select to_char(now() at time zone 'UTC', 'YYYY-MM-DD') as ux4_today \gset

-- ── NOTHING IS DELETED, AND THAT IS THE DESIGN ──
--
-- Deleting an enrollment agreement CASCADES into `child_attendance_events`, which the append-only
-- trigger refuses — so the fixture cannot reclaim its own rows even indirectly. Every row below
-- therefore carries a DETERMINISTIC id and `on conflict do nothing`, which makes re-application a
-- no-op rather than a duplication. That is a stronger idempotence than delete-and-recreate anyway:
-- it cannot half-succeed, and it cannot race another session mid-run.

-- ══ SITE + ROOMS ══════════════════════════════════════════════════════════════════════════════
--
-- Three rooms, one per state the certification must observe. Separate rooms because the states are
-- mutually exclusive PROPERTIES OF A ROOM: a room cannot be both idle and short, and asserting them
-- on one room over time would make the proof depend on ordering.
insert into locations (id, org_id, label, location_type, is_active) values
  ('fbc40000-0000-4000-8000-000000000001'::uuid, :'org'::uuid, 'UX4 Campus', 'site', true)
on conflict (id) do nothing;

insert into locations (id, org_id, label, location_type, parent_location_id, is_active) values
  -- A: planned sufficient / actual short.   B + C live here too (expected-not-arrived, present).
  ('fbc40000-0000-4000-8000-00000000000a'::uuid, :'org'::uuid, 'UX4 Operating Room', 'unit', 'fbc40000-0000-4000-8000-000000000001'::uuid, true),
  -- D: idle — no expected population, no actual population.
  ('fbc40000-0000-4000-8000-00000000000d'::uuid, :'org'::uuid, 'UX4 Idle Room', 'unit', 'fbc40000-0000-4000-8000-000000000001'::uuid, true),
  -- E: populated, but no ratio rule resolves for it.
  ('fbc40000-0000-4000-8000-00000000000e'::uuid, :'org'::uuid, 'UX4 Unknown Room', 'unit', 'fbc40000-0000-4000-8000-000000000001'::uuid, true)
on conflict (id) do nothing;

-- ══ PROGRAM + RATIO ═══════════════════════════════════════════════════════════════════════════
--
-- The program category scopes the ratio rule. Only the OPERATING room's placements carry it, which
-- is what leaves the Unknown room genuinely unresolvable rather than artificially blanked: it has a
-- real population and no rule reaches it.
insert into location_program_categories (id, org_id, location_id, key, label) values
  ('fbc40000-0000-4000-8000-0000000000c1'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'ux4_toddler', 'UX4 Toddler')
on conflict (id) do nothing;

-- ONE TIER, chosen so the arithmetic is unambiguous: up to 4 children require 1 staff. Both the
-- expected population (2) and the present population (1) land in the same tier, so planned and
-- actual demand are BOTH 1 — and the only thing that differs between the two verdicts is supply.
-- That is what makes state A a clean negative control rather than a demand artefact.
--  scope carries the program category ONLY — the shape constraint refuses a rule that
-- names both a site and a program, because two scopes would be two answers about precedence.
insert into childcare_ratio_rules (id, org_id, scope_type, program_category_id, effective_start, source_key) values
  ('fbc40000-0000-4000-8000-00000000ab01'::uuid, :'org'::uuid, 'program',
   'fbc40000-0000-4000-8000-0000000000c1'::uuid, '2020-01-01', 'certification')
on conflict (id) do nothing;

insert into childcare_ratio_rule_tiers (id, org_id, ratio_rule_id, max_children, required_staff, sort_order) values
  ('fbc40000-0000-4000-8000-00000000ab02'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-00000000ab01'::uuid, 4, 1, 10)
on conflict (id) do nothing;

-- ══ HOUSEHOLD + CHILDREN ══════════════════════════════════════════════════════════════════════
insert into customers (id, org_id, name) values
  ('fbc40000-0000-4000-8000-0000000000d1'::uuid, :'org'::uuid, 'UX4 Family')
on conflict (id) do nothing;

insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active) values
  -- C — arrives. Counts in Expected AND Here now.
  ('fbc40000-0000-4000-8000-00000000ac01'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-0000000000d1'::uuid, 'Ada UX4', 'Ada', 'UX4', '2023-03-01', 'child', true),
  -- B — expected, never arrives. Counts in Expected and NOT in Here now.
  ('fbc40000-0000-4000-8000-00000000ac02'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-0000000000d1'::uuid, 'Bo UX4', 'Bo', 'UX4', '2023-05-01', 'child', true),
  -- E — populates the Unknown room, so "unknown" is about missing CONFIGURATION, not emptiness.
  ('fbc40000-0000-4000-8000-00000000ac03'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-0000000000d1'::uuid, 'Cy UX4', 'Cy', 'UX4', '2023-07-01', 'child', true)
on conflict (id) do nothing;

-- ══ AGREEMENTS + PLACEMENTS ═══════════════════════════════════════════════════════════════════
--
-- An agreement is required for a COMMITTED assignment and for any attendance fact (the event table
-- references it NOT NULL). The placement is what gives a room its program scope, which is how the
-- ratio rule reaches the operating room and does not reach the unknown one.
insert into child_enrollment_agreements (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key) values
  ('fbc40000-0000-4000-8000-0000000000e1'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-00000000ac01'::uuid, 'fbc40000-0000-4000-8000-0000000000d1'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'active', '2026-01-01', 'certification'),
  ('fbc40000-0000-4000-8000-0000000000e2'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-00000000ac02'::uuid, 'fbc40000-0000-4000-8000-0000000000d1'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'active', '2026-01-01', 'certification'),
  ('fbc40000-0000-4000-8000-0000000000e3'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-00000000ac03'::uuid, 'fbc40000-0000-4000-8000-0000000000d1'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'active', '2026-01-01', 'certification')
on conflict (id) do nothing;

insert into child_placements (id, org_id, enrollment_agreement_id, customer_member_id, site_location_id, program_category_id, room_location_id, start_date, status, source_key) values
  ('fbc40000-0000-4000-8000-00000000ad01'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-0000000000e1'::uuid, 'fbc40000-0000-4000-8000-00000000ac01'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'fbc40000-0000-4000-8000-0000000000c1'::uuid, 'fbc40000-0000-4000-8000-00000000000a'::uuid, '2026-01-01', 'active', 'certification'),
  ('fbc40000-0000-4000-8000-00000000ad02'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-0000000000e2'::uuid, 'fbc40000-0000-4000-8000-00000000ac02'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'fbc40000-0000-4000-8000-0000000000c1'::uuid, 'fbc40000-0000-4000-8000-00000000000a'::uuid, '2026-01-01', 'active', 'certification'),
  -- NO program category — this is what makes the Unknown room unresolvable.
  ('fbc40000-0000-4000-8000-00000000ad03'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-0000000000e3'::uuid, 'fbc40000-0000-4000-8000-00000000ac03'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, null, 'fbc40000-0000-4000-8000-00000000000e'::uuid, '2026-01-01', 'active', 'certification')
on conflict (id) do nothing;

-- ══ SCHEDULE — who is EXPECTED today ══════════════════════════════════════════════════════════
--
-- Weekdays cover all seven days so the fixture proves the same thing whichever day it is applied on.
-- A pattern limited to Mon–Fri would make the certification pass or fail by calendar.
insert into schedule_patterns (id, org_id, site_location_id, key, label, schedule_type_key, weekdays, is_active) values
  ('fbc40000-0000-4000-8000-0000000000f1'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'ux4_all_days', 'Every day', 'full_day', '{0,1,2,3,4,5,6}', true)
on conflict (id) do nothing;

-- ── NO `program_category_id` ON THE ASSIGNMENT, AND THAT IS NOT A SHORTCUT ──
--
-- The PLACEMENT is what scopes a room's configuration — `buildRoomConfigResolvers` derives the
-- site/program/age-group context from committed placements, so the ratio rule reaches the operating
-- room through `child_placements.program_category_id` above. The column here would be redundant.
--
-- It is also currently unusable: `validate_schedule_assignments_consistency()` validates it by
-- selecting `location_program_categories.site_location_id`, a column that does not exist (the real
-- one is `location_id`), so ANY assignment naming a program category fails with a raw Postgres error.
-- Recorded here rather than worked around silently — it is a live platform defect, not a fixture
-- inconvenience, and this fixture avoids it rather than fixing it because UX-4 is not that slice.
insert into schedule_assignments (id, org_id, subject_type, enrollment_agreement_id, customer_member_id, site_location_id, room_location_id, schedule_pattern_id, start_date, status, assignment_kind, commitment_kind, is_primary, source_key) values
  ('fbc40000-0000-4000-8000-0000000000a1'::uuid, :'org'::uuid, 'child', 'fbc40000-0000-4000-8000-0000000000e1'::uuid, 'fbc40000-0000-4000-8000-00000000ac01'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'fbc40000-0000-4000-8000-00000000000a'::uuid, 'fbc40000-0000-4000-8000-0000000000f1'::uuid, '2026-01-01', 'active', 'base', 'committed', true, 'certification'),
  ('fbc40000-0000-4000-8000-0000000000a2'::uuid, :'org'::uuid, 'child', 'fbc40000-0000-4000-8000-0000000000e2'::uuid, 'fbc40000-0000-4000-8000-00000000ac02'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'fbc40000-0000-4000-8000-00000000000a'::uuid, 'fbc40000-0000-4000-8000-0000000000f1'::uuid, '2026-01-01', 'active', 'base', 'committed', true, 'certification'),
  ('fbc40000-0000-4000-8000-0000000000a3'::uuid, :'org'::uuid, 'child', 'fbc40000-0000-4000-8000-0000000000e3'::uuid, 'fbc40000-0000-4000-8000-00000000ac03'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'fbc40000-0000-4000-8000-00000000000e'::uuid, 'fbc40000-0000-4000-8000-0000000000f1'::uuid, '2026-01-01', 'active', 'base', 'committed', true, 'certification')
on conflict (id) do nothing;

-- ══ STAFF — SCHEDULED but NOT PRESENT ═════════════════════════════════════════════════════════
--
-- This is the whole of state A. One staff member is scheduled into the operating room, so PLANNED
-- supply is 1 against planned demand 1 → sufficient. No presence fact is ever written for them, so
-- ACTUAL supply is 0 against actual demand 1 → short. Same room, same instant, opposite verdicts.
--
-- A row with `is_employee` NULL would be rejected by the assignment trigger's employment check, so
-- the employment below is real and current.
insert into persons (id, org_id, first_name, last_name, full_name, external_source) values
  ('fbc40000-0000-4000-8000-00000000ae01'::uuid, :'org'::uuid, 'Sam', 'UX4', 'Sam UX4', 'certification')
on conflict (id) do nothing;

insert into employments (id, org_id, person_id, employment_status, employment_type, primary_location_id, start_date, source_key) values
  ('fbc40000-0000-4000-8000-00000000ae02'::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-00000000ae01'::uuid, 'active', 'full_time', 'fbc40000-0000-4000-8000-000000000001'::uuid, '2026-01-01', 'certification')
on conflict (id) do nothing;

insert into schedule_assignments (id, org_id, subject_type, subject_person_id, customer_member_id, site_location_id, room_location_id, schedule_pattern_id, start_date, status, assignment_kind, commitment_kind, is_primary, source_key) values
  ('fbc40000-0000-4000-8000-0000000000a4'::uuid, :'org'::uuid, 'staff', 'fbc40000-0000-4000-8000-00000000ae01'::uuid, null, 'fbc40000-0000-4000-8000-000000000001'::uuid, 'fbc40000-0000-4000-8000-00000000000a'::uuid, 'fbc40000-0000-4000-8000-0000000000f1'::uuid, '2026-01-01', 'active', 'base', 'committed', false, 'certification')
on conflict (id) do nothing;

-- ══ ACTUAL — one child arrives, nobody else ═══════════════════════════════════════════════════
--
-- Ada is checked in (C). Bo is expected and has NO event at all (B) — deliberately no `absence`
-- fact either, because "not arrived yet" and "marked absent" are different states and the one the
-- Day Roster must not miscount is the silent one. Sam has no presence fact, which is what makes the
-- room actually short.
-- ── THE ID MUST CARRY THE DAY, OR THE FACT NEVER ARRIVES AGAIN ──
--
-- This row used to carry a FIXED id under `on conflict (id) do nothing`. That is idempotent within a
-- single day and silently wrong on the next one: the id already existed from yesterday, so the
-- insert did nothing, today got no check-in, and every actual count read zero. The gate then failed
-- with "Children here now: expected 1, received 0" — which reads exactly like the Day Roster losing
-- its actual data, and is really a fixture that quietly stopped writing at midnight UTC.
--
-- Deriving the id FROM the service date gives each day its own row, keeps the fixture re-appliable
-- any number of times within a day, and deletes nothing — which the append-only trigger forbids in
-- any case. The data is date-dependent, so its identity has to be.
insert into child_attendance_events (id, org_id, enrollment_agreement_id, customer_member_id, site_location_id, event_kind, entry_type, event_at, service_date, room_location_id, actor_type, source_type, source_key) values
  (md5('ux4-ada-check-in-' || :'ux4_today')::uuid, :'org'::uuid, 'fbc40000-0000-4000-8000-0000000000e1'::uuid, 'fbc40000-0000-4000-8000-00000000ac01'::uuid, 'fbc40000-0000-4000-8000-000000000001'::uuid,
   'check_in', 'original', (:'ux4_today'::date + time '08:30') at time zone 'UTC', :'ux4_today'::date, 'fbc40000-0000-4000-8000-00000000000a'::uuid, 'staff', 'operator_action', 'certification')
on conflict (id) do nothing;

-- And FAIL if today's fact is not there.
--
-- The verification block below already counted this and already said "must be 1". It printed 0 and
-- the run carried on, so the miss surfaced as a browser assertion about the PRODUCT instead of as a
-- fixture that had not written. Same lesson as `roster-people-search-convergence.sql`: a SELECT that
-- reports a number is not a check.
do $$
declare
    n int;
begin
    select count(*) into n
    from child_attendance_events
    where site_location_id = 'fbc40000-0000-4000-8000-000000000001'::uuid
      and service_date = to_char(now() at time zone 'UTC', 'YYYY-MM-DD')::date;
    if n <> 1 then
        raise exception
            'fixture did not write today''s check-in: % events for the UX4 campus today, expected 1', n;
    end if;
end $$;

-- ── Verification: what a run should see before the browser starts.
select 'service date' as fixture, :'ux4_today' as n
union all select 'rooms', count(*)::text from locations where id::text like 'fbc4%' and location_type = 'unit'
union all select 'ratio tiers (must be 1)', count(*)::text from childcare_ratio_rule_tiers where id::text like 'fbc4%'
union all select 'children placed', count(*)::text from child_placements where id::text like 'fbc4%'
union all select 'child assignments', count(*)::text from schedule_assignments where id::text like 'fbc4%' and subject_type = 'child'
union all select 'staff assignments (must be 1)', count(*)::text from schedule_assignments where id::text like 'fbc4%' and subject_type = 'staff'
-- Scoped to TODAY: yesterday's facts legitimately remain, because facts are not deleted.
union all select 'child attendance events today (must be 1)', count(*)::text from child_attendance_events where org_id = :'org'::uuid and site_location_id = 'fbc40000-0000-4000-8000-000000000001'::uuid and service_date = :'ux4_today'::date
-- THE NEGATIVE CONTROL: zero staff presence is what makes actual short while planned is sufficient.
union all select 'staff presence events today (must be 0)', count(*)::text from staff_presence_events where org_id = :'org'::uuid and site_location_id = 'fbc40000-0000-4000-8000-000000000001'::uuid and service_date = :'ux4_today'::date;
