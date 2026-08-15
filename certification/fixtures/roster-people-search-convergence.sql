-- Roster People + Search + Contextual Card Convergence — certification fixtures.
--
-- Idempotent and SELF-CLEANING: rows previous runs created are removed first, so the file restores
-- the proving state rather than adding to whatever survived. The cert tenant is shared and other
-- sessions reset it without warning.
--
-- ── WHY THIS FIXTURE PUBLISHES A LAYOUT ──
--
-- The tenant has NO published `focus_panel_summary` row. Certifying "the two hosts resolve the same
-- effective configured card" against that state would compare the platform default with the
-- platform default — true, and completely vacuous, because a host that ignored publication entirely
-- would pass. So this publishes a real tenant composition whose Children nested surface differs
-- from the platform default in the ways the invariant names: which fields, what they are called,
-- and in what order. A silent fallback to the default then becomes VISIBLE rather than plausible.
--
-- It is a tenant doing what a tenant does through the Surface Builder. No product code assumes it.
\set org '00000000-0000-4000-8000-000000000001'
\set riverside '00000000-0000-4000-8000-000000000010'
\set enrollment_unit '00000000-0000-4000-8000-000000000031'

-- ── Remove what previous runs of THIS certification created, innermost first.
delete from schedule_assignments where org_id = :'org'::uuid and customer_member_id in
  (select id from customer_members where customer_id::text like 'fbc0%');
delete from schedule_patterns where id::text like 'fbc0%';
delete from process_instances where org_id = :'org'::uuid and subject_id in
  (select id from customer_members where customer_id::text like 'fbc0%');
delete from customer_members where customer_id::text like 'fbc0%';
delete from customer_persons where customer_id::text like 'fbc0%';
delete from opportunities where id::text like 'fbc0%';
delete from customers where id::text like 'fbc0%';
delete from employments where id::text like 'fbc0%';
delete from persons where id::text like 'fbc0%';
delete from employment_positions where id::text like 'fbc0%';
delete from entity_layouts where id::text like 'fbc0%';

-- ══ STAFF — Jane, exactly as `staff.add` makes one: Person + Employment, no household, no case ══
insert into employment_positions (id, org_id, key, label, is_active) values
  ('fbc00000-0000-4000-8000-00000000f001'::uuid, :'org'::uuid, 'lead_teacher', 'Lead Teacher', true)
on conflict (id) do nothing;

insert into persons (id, org_id, first_name, last_name, full_name, email, external_source) values
  ('fbc00000-0000-4000-8000-00000000a001'::uuid, :'org'::uuid, 'Jane', 'Okafor', 'Jane Okafor', 'jane.okafor@northwind.invalid', 'certification')
on conflict (id) do nothing;

insert into employments (id, org_id, person_id, employment_status, employment_type, position_id, primary_location_id, start_date, source_key) values
  ('fbc00000-0000-4000-8000-00000000e001'::uuid, :'org'::uuid, 'fbc00000-0000-4000-8000-00000000a001'::uuid,
   'active', 'full_time', 'fbc00000-0000-4000-8000-00000000f001'::uuid, :'riverside'::uuid, '2026-01-05', 'certification')
on conflict (id) do nothing;

-- ══ HOUSEHOLD — the Kurzman family, its parent, and two children ═══════════════════════════════
insert into customers (id, org_id, name) values
  ('fbc00000-0000-4000-8000-00000000d001'::uuid, :'org'::uuid, 'Kurzman Family')
on conflict (id) do nothing;

-- The parent is a PERSON on the household edge (`customer_persons`) — the canonical household
-- relationship, and the one a durable Household composition would read.
insert into persons (id, org_id, first_name, last_name, full_name, email, phone, external_source) values
  ('fbc00000-0000-4000-8000-00000000b001'::uuid, :'org'::uuid, 'Kelly', 'Kurzman', 'Kelly Kurzman', 'kelly.kurzman@northwind.invalid', '+15555550142', 'certification')
on conflict (id) do nothing;

insert into customer_persons (id, org_id, customer_id, person_id, role_type, is_primary) values
  ('fbc00000-0000-4000-8000-00000000e002'::uuid, :'org'::uuid, 'fbc00000-0000-4000-8000-00000000d001'::uuid,
   'fbc00000-0000-4000-8000-00000000b001'::uuid, 'parent_guardian', true)
on conflict (id) do nothing;

-- Lennon: `person_id` NULL, which is the ordinary case in this tenant (all 1500 seeded children
-- have it null).
--
-- `gender` / `allergies` are deliberately NOT seeded: they are not columns on `customer_members`
-- at all but config `field_values`, and the edit scenario proves the write path by WRITING a field
-- rather than by reading one that was placed there by hand.
insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active, person_id) values
  ('fbc00000-0000-4000-8000-00000000c001'::uuid, :'org'::uuid, 'fbc00000-0000-4000-8000-00000000d001'::uuid,
   'Lennon Kurzman', 'Lennon', 'Kurzman', '2022-04-11', 'child', true, null)
on conflict (id) do nothing;

-- A sibling, so the household is genuinely a household rather than one child with a family name.
insert into customer_members (id, org_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active, person_id) values
  ('fbc00000-0000-4000-8000-00000000c002'::uuid, :'org'::uuid, 'fbc00000-0000-4000-8000-00000000d001'::uuid,
   'Wrigley Kurzman', 'Wrigley', 'Kurzman', '2024-02-02', 'child', true, null)
on conflict (id) do nothing;

-- ══ THE OPERATIONAL CONTEXT — one case, in the ACTIVE enrollment unit ══════════════════════════
--
-- A PLAIN INSERT, deliberately. An earlier revision used `INSERT … SELECT` to copy pipeline columns
-- from a seeded case; no case in this tenant has any (0 of 3000 carry `pipeline_id`), so the SELECT
-- matched nothing, inserted nothing — silently, AFTER the delete above — and the fixture case simply
-- disappeared. A conditional insert in a self-cleaning fixture is a way to lose rows without an
-- error, which is why the verification block below now counts this row too.
insert into opportunities (id, org_id, customer_id, name, work_unit_id) values
  ('fbc00000-0000-4000-8000-00000000c003'::uuid, :'org'::uuid, 'fbc00000-0000-4000-8000-00000000d001'::uuid,
   'Kurzman enrollment', :'enrollment_unit'::uuid)
on conflict (id) do nothing;

-- Lennon's PARTICIPATION, at `waitlist` — a configured stage of the tenant's enrollment process.
-- The participation is the row a child-grain lens selects; the case is what the panel composes.
insert into process_instances (id, org_id, process_key, subject_type, subject_id, context_type, context_id, state, stage_key) values
  ('fbc00000-0000-4000-8000-00000000c004'::uuid, :'org'::uuid, 'enrollment', 'child',
   'fbc00000-0000-4000-8000-00000000c001'::uuid, 'opportunity', 'fbc00000-0000-4000-8000-00000000c003'::uuid,
   'in_process', 'waitlist')
on conflict (id) do nothing;

-- ══ A SECOND CONTEXT — so the selector is a genuine CHOICE ═════════════════════════════════════
--
-- The context strip renders only when there is something to choose between: one context is not a
-- decision, and a strip with a single chip in it teaches the operator to ignore the strip. Lennon
-- therefore needs a real second context, and an ASSIGNMENT is the one the intended experience shows
-- beside Enrollment.
--
-- It also certifies the honest half of the contextual model: an assignment has no business process,
-- so it resolves NO configured card and the host must say so rather than approximating one.
insert into schedule_patterns (id, org_id, site_location_id, key, label, schedule_type_key, weekdays, is_active) values
  ('fbc00000-0000-4000-8000-00000000f002'::uuid, :'org'::uuid, :'riverside'::uuid, 'rps_full_day', 'Mon / Wed / Fri', 'full_day', '{1,3,5}', true)
on conflict (id) do nothing;

--
-- PROPOSED, not committed, and the consistency trigger is what makes that the right answer: a
-- COMMITTED child assignment must reference a `child_enrollment_agreements` row, and a waitlisted
-- child has no agreement yet. Planning (`proposed`) requires only the child and the site — which is
-- precisely what a waitlisted child's intended schedule is. `planned` counts as live, so the
-- context resolves.
insert into schedule_assignments (id, org_id, subject_type, customer_member_id, site_location_id, schedule_pattern_id, start_date, status, assignment_kind, commitment_kind, is_primary, source_key, metadata) values
  ('fbc00000-0000-4000-8000-00000000f003'::uuid, :'org'::uuid, 'child', 'fbc00000-0000-4000-8000-00000000c001'::uuid,
   :'riverside'::uuid, 'fbc00000-0000-4000-8000-00000000f002'::uuid, '2026-01-05', 'planned', 'base', 'proposed', false, 'certification',
   jsonb_build_object('planning', true))
on conflict (id) do nothing;

-- ══ THE TENANT PUBLICATION — what makes the equality proof non-vacuous ═════════════════════════
--
-- `sections: []` is deliberate: the grid falls back to its default composition, so the NATIVE Focus
-- Panel still looks and composes exactly as it always has. The thing under test is the CHILD nested
-- surface, and nothing else about the panel is being changed to prove it.
--
-- The Children config differs from the platform default in all three ways the invariant names:
--   • field SELECTION      — three fields, not the default set
--   • field ORDER          — date of birth BEFORE first name, which no catalogue would produce
--   • field LABELS         — "Birthday" and "Given name", which exist nowhere in code
-- If a host silently used the platform default, none of those three would appear.
insert into entity_layouts (id, org_id, entity_type, surface, layout_key, name, version, status, doc, metadata, published_at) values (
  'fbc00000-0000-4000-8000-00000000c005'::uuid,
  :'org'::uuid,
  'opportunities',
  'drawer',
  'focus_panel_summary',
  'Enrollment Focus Panel Summary (certification)',
  1,
  'published',
  jsonb_build_object(
    'formatVersion', 1,
    'surface', 'drawer',
    'entityType', 'opportunities',
    'sections', '[]'::jsonb,
    'metadata', jsonb_build_object(
      'focusPanelMode', 'summary',
      'layoutKey', 'focus_panel_summary',
      'nestedSurfaces', jsonb_build_object(
        'children_surface', jsonb_build_object(
          'surfaceId', 'children_surface',
          'groups', jsonb_build_array(
            jsonb_build_object(
              'key', 'identity',
              'enabled', true,
              'selectedFieldKeys', jsonb_build_array('child.date_of_birth', 'child.first_name', 'child.allergies'),
              'fieldLabels', jsonb_build_object(
                'child.date_of_birth', 'Birthday',
                'child.first_name', 'Given name'
              ),
              'displayOptions', '{}'::jsonb
            )
          )
        )
      )
    )
  ),
  '{}'::jsonb,
  now()
)
on conflict (id) do nothing;

-- ── Verification: what a run should see before the browser starts.
select 'jane (staff person)' as fixture, count(*)::text as n from persons where id = 'fbc00000-0000-4000-8000-00000000a001'::uuid
union all select 'jane employment', count(*)::text from employments where id = 'fbc00000-0000-4000-8000-00000000e001'::uuid
union all select 'kurzman household', count(*)::text from customers where id = 'fbc00000-0000-4000-8000-00000000d001'::uuid
union all select 'kurzman parent edge', count(*)::text from customer_persons where customer_id = 'fbc00000-0000-4000-8000-00000000d001'::uuid
union all select 'kurzman children', count(*)::text from customer_members where customer_id = 'fbc00000-0000-4000-8000-00000000d001'::uuid
union all select 'kurzman case', count(*)::text from opportunities where id = 'fbc00000-0000-4000-8000-00000000c003'::uuid
union all select 'lennon waitlist participation', count(*)::text from process_instances where id = 'fbc00000-0000-4000-8000-00000000c004'::uuid
union all select 'published focus panel summary', count(*)::text from entity_layouts where id = 'fbc00000-0000-4000-8000-00000000c005'::uuid
union all select 'lennon assignment (2nd context)', count(*)::text from schedule_assignments where id = 'fbc00000-0000-4000-8000-00000000f003'::uuid;
