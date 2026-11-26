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
--
-- Jane's STAFF assignment needs a delete of its own: it carries `customer_member_id IS NULL` by
-- construction, so the member-scoped delete below cannot see it. A self-cleaning fixture that
-- silently misses one class of row is not self-cleaning — it accumulates, and the accumulation is
-- invisible until a count assertion starts drifting. Person-prefixed rather than id-prefixed so it
-- also collects rows the BROWSER created during a previous run's mutation proofs.
delete from schedule_assignments where org_id = :'org'::uuid and subject_type = 'staff'
  and subject_person_id in (select id from persons where id::text like 'fbc0%');
delete from schedule_assignments where org_id = :'org'::uuid and customer_member_id in
  (select id from customer_members where customer_id::text like 'fbc0%');
-- Assignments the BROWSER created against SEEDED members using THIS fixture's assignment type.
-- The creation-affordance proofs pick a real child from the seeded tenant, so the rows carry a
-- seeded member id and an fbc type id — invisible to both member-scoped deletes above, and each one
-- blocks the type delete below with an FK violation that aborts the whole fixture. The class its
-- own warning describes: silently missed, accumulating, discovered only when the apply fails.
delete from schedule_assignments where org_id = :'org'::uuid
  and operational_assignment_type_id::text like 'fbc0%';
delete from operational_assignment_types where id::text like 'fbc0%';
delete from schedule_patterns where id::text like 'fbc0%';
delete from opportunity_customer_members where org_id = :'org'::uuid and customer_member_id in
  (select id from customer_members where customer_id::text like 'fbc0%');
delete from process_instances where org_id = :'org'::uuid and subject_id in
  (select id from customer_members where customer_id::text like 'fbc0%');
delete from customer_members where customer_id::text like 'fbc0%';
delete from customer_persons where customer_id::text like 'fbc0%';
delete from opportunities where id::text like 'fbc0%';
delete from work_units where id::text like 'fbc0%';
delete from customers where id::text like 'fbc0%';
delete from employments where id::text like 'fbc0%';
delete from persons where id::text like 'fbc0%';
delete from employment_positions where id::text like 'fbc0%';
delete from entity_layouts where id::text like 'fbc0%';
-- The participation this fixture adds to an EXISTING seeded case (see below).
delete from process_instances where id = 'fbc00000-0000-4000-8000-00000000c007'::uuid;

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

-- ══ THE OPERATIONAL CONTEXT — the fixture's OWN work unit ══════════════════════════════════════
--
-- ── WHY A DEDICATED UNIT, TRACED RATHER THAN GUESSED ──
--
-- The shared `enrollment_pipeline` unit holds 501 opportunities and
-- `PROCESS_POPULATION_CAP` is 500 — the provisioning population reads
-- `opportunities WHERE work_unit_id = <unit>` with NO `ORDER BY`, so which 500 come back is
-- undefined and a 501st fixture case may or may not be among them. Beyond that,
-- `PROVISIONING_ROW_PAGE_CAP` is 100: a requested subject must also land inside the lens's own
-- published page. A fixture that depends on either is asserting the tenant's SIZE, which is the
-- trap this certification has already hit twice.
--
-- The seeded tenant offers no alternative: Lennon's participation is the ONLY child
-- `process_instance` in the whole tenant (1500 children, zero seeded child participations), so
-- there is no pre-existing legitimately-selectable case to borrow.
--
-- So the fixture gets its own unit, exactly as `enrollment-context-convergence.sql` already does
-- for the same reason. This deforms no Work View semantics — the unit belongs to the SAME
-- department, so it inherits the same published process, the same stages and the same lenses. It
-- simply gives this case an operational home small enough to be deterministic.
insert into work_units (id, org_id, department_id, key, name, is_active)
select 'fbc00000-0000-4000-8000-00000000c000'::uuid, :'org'::uuid, department_id,
       'rps_convergence_unit', 'Convergence (cert)', true
from work_units where id = :'enrollment_unit'::uuid
on conflict (id) do nothing;

--
-- A PLAIN INSERT, deliberately. An earlier revision used `INSERT … SELECT` to copy pipeline columns
-- from a seeded case; no case in this tenant has any (0 of 3000 carry `pipeline_id`), so the SELECT
-- matched nothing, inserted nothing — silently, AFTER the delete above — and the fixture case simply
-- disappeared. A conditional insert in a self-cleaning fixture is a way to lose rows without an
-- error, which is why the verification block below now counts this row too.
insert into opportunities (id, org_id, customer_id, name, work_unit_id) values
  ('fbc00000-0000-4000-8000-00000000c003'::uuid, :'org'::uuid, 'fbc00000-0000-4000-8000-00000000d001'::uuid,
   'Kurzman enrollment', 'fbc00000-0000-4000-8000-00000000c000'::uuid)
on conflict (id) do nothing;

-- Lennon's PARTICIPATION, at `waitlist` — a configured stage of the tenant's enrollment process.
-- The participation is the row a child-grain lens selects; the case is what the panel composes.
insert into process_instances (id, org_id, process_key, subject_type, subject_id, context_type, context_id, state, stage_key) values
  ('fbc00000-0000-4000-8000-00000000c004'::uuid, :'org'::uuid, 'enrollment', 'child',
   'fbc00000-0000-4000-8000-00000000c001'::uuid, 'opportunity', 'fbc00000-0000-4000-8000-00000000c003'::uuid,
   'in_process', 'waitlist')
on conflict (id) do nothing;

-- ══ THE CASE↔CHILD LINK — the condition the native Children card actually reads ════════════════
--
-- Traced, not guessed. The native Focus Panel composed for this case with NO Children card, and the
-- reason is that `opportunity_customer_members` is what puts a child ON a case. A
-- `process_instances` row records the PARTICIPATION in a process; the OCM row is the case's own
-- membership edge, and it is what `_inquiry_children` (and therefore the Children card) is built
-- from. A real waitlisted child in a real case has both; this fixture had only the first.
--
-- This is canonical business truth for a child participating in a case — not a field invented to
-- satisfy a lens.
insert into opportunity_customer_members (id, org_id, opportunity_id, customer_member_id, stage_key) values
  ('fbc00000-0000-4000-8000-00000000c006'::uuid, :'org'::uuid, 'fbc00000-0000-4000-8000-00000000c003'::uuid,
   'fbc00000-0000-4000-8000-00000000c001'::uuid, 'waitlist')
on conflict (id) do nothing;

-- ══ ASSIGNMENT CATEGORIES — tenant configuration, because the tenant has NONE ══════════════════
--
-- ── THIS IS A FINDING, NOT A CONVENIENCE ──
--
-- `operational_assignment_types` is EMPTY in the seeded cert tenant: zero rows, for either subject.
-- Certifying "the picker shows the configured assignment types" against that state would have
-- proven only that an empty list renders as an empty state — which the card does correctly, and
-- which a card that ignored the types owner entirely would also pass. So the categories are
-- configured here, exactly as a tenant configures them through Studio, and the assertion becomes
-- falsifiable: the picker must show THESE labels, which exist nowhere in code.
--
-- ── `subject_types` IS THE AUTHORITY ON WHO MAY HOLD A CATEGORY ──
--
-- Not a filter the card invents. The column is checked by the DB trigger
-- (`Assignment type must belong to the organization and support the subject type`) and read by
-- `loadOrgAssignmentTypes({ subjectType })`, so it is enforced at both ends. The three rows below
-- are deliberately asymmetric so that asymmetry is OBSERVABLE:
--
--   Before Care     child only   — must NOT appear when the subject is Jane
--   Classroom Cover staff only   — must NOT appear when the subject is Lennon
--   Enrichment      both         — the control that proves the filter is a filter, not a blanket
--
-- A card that ignored `subject_types` would show all three to both subjects and pass any assertion
-- that merely counted "some categories are listed".
insert into operational_assignment_types
  (id, org_id, key, label, subject_types, sort_order, is_active, default_behavior) values
  ('fbc00000-0000-4000-8000-000000009001'::uuid, :'org'::uuid, 'rps_before_care', 'Before Care (cert)',
   ARRAY['child']::text[], 10, true, '{}'::jsonb),
  ('fbc00000-0000-4000-8000-000000009002'::uuid, :'org'::uuid, 'rps_classroom_cover', 'Classroom Cover (cert)',
   ARRAY['staff']::text[], 20, true, '{}'::jsonb),
  ('fbc00000-0000-4000-8000-000000009003'::uuid, :'org'::uuid, 'rps_enrichment', 'Enrichment (cert)',
   ARRAY['child','staff']::text[], 30, true, '{}'::jsonb)
on conflict (id) do update set
  label = excluded.label,
  subject_types = excluded.subject_types,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

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
--
-- It carries a ROOM and a CATEGORY so the CHILD half of the assignment acceptance is as substantive
-- as the staff half. Without them the card renders "Untitled type" and no room — truthful for a row
-- with neither, but it leaves the child scenario asserting less than the staff one, and an
-- asymmetric acceptance is how a convergence claim quietly becomes a claim about one subject.
--
-- The category is the CHILD-ONLY one, which also makes it the control for the picker assertions:
-- it must appear for Lennon and must not appear for Jane.
insert into schedule_assignments (id, org_id, subject_type, customer_member_id, site_location_id, room_location_id, schedule_pattern_id, operational_assignment_type_id, start_date, status, assignment_kind, commitment_kind, is_primary, source_key, metadata) values
  ('fbc00000-0000-4000-8000-00000000f003'::uuid, :'org'::uuid, 'child', 'fbc00000-0000-4000-8000-00000000c001'::uuid,
   :'riverside'::uuid, '00000000-0000-4000-8000-000000000014'::uuid,
   'fbc00000-0000-4000-8000-00000000f002'::uuid, 'fbc00000-0000-4000-8000-000000009001'::uuid,
   '2026-01-05', 'planned', 'base', 'proposed', false, 'certification',
   jsonb_build_object('planning', true))
on conflict (id) do update set
  room_location_id = excluded.room_location_id,
  operational_assignment_type_id = excluded.operational_assignment_type_id;

-- ══ JANE'S STAFF ASSIGNMENT — real staff grain, and nothing borrowed from a child ══════════════
--
-- ── WHAT MAKES THIS "REAL STAFF GRAIN" ──
--
--   subject_type       'staff'
--   subject_person_id  Jane's `persons.id`
--   customer_member_id NULL — explicitly, because the whole point is that she is not a member
--
-- No `customer_members` row is created for Jane, and none may be. A staff member given a member row
-- would make every child-shaped read in the product accidentally correct about her, and the
-- certification would then be proving that the disguise holds rather than that the generalization
-- is real.
--
-- ── COMMITTED, BECAUSE THE SERVICE SAYS SO ──
--
-- Not a choice this fixture makes: `resolveSubjectSite` returns `commitmentKind: "committed"` for
-- every staff subject unconditionally, so a proposed staff row is a state the write path cannot
-- produce. Seeding one would create a row the product can read and never write — the kind of
-- fixture-only state that makes a passing certification meaningless.
--
-- ── ELIGIBILITY IS EMPLOYMENT, AND THE DATE IS PART OF IT ──
--
-- The consistency trigger requires canonical employment covering the assignment's start date
-- (`person_is_employed_on`), NOT `persons.is_employee` — that column is a waitlist household
-- priority flag and is NULL for everyone here. Jane's employment starts 2026-01-05, so the
-- assignment starts on or after it. An earlier start date would be rejected by the database, which
-- is the correct behaviour and a poor way to discover it.
--
-- It carries a ROOM (Infant Room A) because the load-bearing refresh proof changes the room and
-- asserts the Roster re-read shows the new one. A room-less assignment has no observable fact to
-- change.
insert into schedule_assignments
  (id, org_id, subject_type, subject_person_id, customer_member_id, site_location_id, room_location_id,
   schedule_pattern_id, operational_assignment_type_id, start_date, status, assignment_kind,
   commitment_kind, is_primary, source_key, metadata) values
  ('fbc00000-0000-4000-8000-000000009010'::uuid, :'org'::uuid, 'staff',
   'fbc00000-0000-4000-8000-00000000a001'::uuid, null,
   :'riverside'::uuid, '00000000-0000-4000-8000-000000000012'::uuid,
   'fbc00000-0000-4000-8000-00000000f002'::uuid, 'fbc00000-0000-4000-8000-000000009002'::uuid,
   '2026-02-02', 'active', 'base', 'committed', false, 'certification', '{}'::jsonb)
on conflict (id) do update set
  room_location_id = excluded.room_location_id,
  operational_assignment_type_id = excluded.operational_assignment_type_id,
  start_date = excluded.start_date,
  status = excluded.status,
  end_date = null;

-- And FAIL if it did not take.
--
-- ── WHY AN ASSERT AND NOT ANOTHER DELETE ──
--
-- The person-prefixed delete at the top of this file ALREADY reclaims Jane's operator-created rows;
-- the fixture is genuinely self-cleaning. What it cannot do is clean a run it was never applied
-- before. O-3 performs a real `change_room`, and the runtime answers one by closing the current
-- assignment and inserting a new one — so running the spec twice WITHOUT re-applying this fixture
-- leaves Jane starting on the very date the second run is about to move her to. It then tries to end
-- that assignment the day before its own start and is refused by
-- `schedule_assignments_end_after_start`, which reads exactly like a product regression.
--
-- The verification block at the end of this file already counted Jane's staff rows and already said
-- "must be 1". It printed 3 for two runs and nothing stopped, because a SELECT that reports a number
-- is not a check — someone has to read it. Asserted here, a stale tenant ends the fixture instead of
-- decorating it, and the failure names the cause rather than surfacing as a browser mystery.
do $$
declare
    n int;
begin
    select count(*) into n
    from schedule_assignments
    where subject_type = 'staff'
      and subject_person_id = 'fbc00000-0000-4000-8000-00000000a001'::uuid;
    if n <> 1 then
        raise exception
            'fixture not restorative: Jane holds % staff assignments, expected exactly 1 (prior-run rows survived)', n;
    end if;
end $$;

-- ══ THE EQUALITY SUBJECT — an EXISTING seeded case, not a new one ══════════════════════════════
--
-- ── WHY THE KURZMAN CASE CANNOT CARRY THE NATIVE HALF ──
--
-- Traced through the runtime: rows are read from `resolveProvisioningPopulationWorkUnitId`, which
-- returns the ACTIVE LENS'S canonical count host (`settlement.queueTotalTarget.hostWorkUnitId`),
-- NOT the work unit whose surface is open. Giving the fixture its own unit therefore moved the case
-- OUT of the population the lens actually reads — the shell said `Convergence (cert)` while rows
-- came from the department's canonical unit. That is correct Work View semantics, not a defect.
--
-- Putting it back into `enrollment_pipeline` runs into the other wall: that unit holds 501 cases
-- against a `PROCESS_POPULATION_CAP` of 500, read with no `ORDER BY`, so membership of a 501st row
-- is undefined rather than merely unlikely.
--
-- So the native half uses a case the tenant ALREADY holds inside that population — seeded, at
-- `waitlist`, with a child already linked through `opportunity_customer_members`. The only fact it
-- lacks is the child's PARTICIPATION in the enrollment process, which is exactly the canonical fact
-- this fixture already creates for Lennon: a child on a waitlisted enrollment case participates in
-- enrollment. Nothing else about the seeded case is touched.
insert into process_instances (id, org_id, process_key, subject_type, subject_id, context_type, context_id, state, stage_key) values
  ('fbc00000-0000-4000-8000-00000000c007'::uuid, :'org'::uuid, 'enrollment', 'child',
   '00000000-0000-4000-8000-300000000003'::uuid, 'opportunity', '00000000-0000-4000-8000-400000000963'::uuid,
   'in_process', 'waitlist')
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
              -- ── EDITABILITY IS CONFIGURED, AND WAS THE MISSING HALF OF THE EDIT JOURNEY ──
              --
              -- `childrenFocusRowsFromNestedConfig` derives a row's editability as
              -- `displayed && isChildFocusFieldSaveSupported(ref) && fieldIsSaveable(visibility)`,
              -- and `fieldIsSaveable` is true ONLY for the literal policy `editable`. Without
              -- `fieldPolicies` every field resolves read-only, so the contextual card rendered each
              -- configured row as a `<span>` and the operator had nothing to click. The browser is
              -- what surfaced it — all nine rows reported `editable="false"`, including the two this
              -- fixture publishes by name — and it is worth naming because the edit path itself was
              -- already built and unit-proven. Nothing was broken; nothing was configured.
              --
              -- BOTH fields are declared and only ONE of them becomes editable, which is a platform
              -- fact rather than a fixture mistake — it is left in because it is the finding:
              --
              --   `child.date_of_birth` → editable. Its mutation binding maps to the value key `dob`,
              --      the single key `isEnrollmentOcmMutationValueKey` EXCLUDES, so it is owned by the
              --      child record and a case-free host may write it.
              --   `child.first_name`    → still read-only, with the identical policy.
              --
              -- The two gates disagree, and the row builder's is the narrower one. A row is editable
              -- only when `isChildFocusFieldSaveSupported` says so, and that resolves to
              -- `isIdentityFieldSaveSupported`, which requires a MUTATION BINDING. The contextual
              -- card's own write gate (`writeTargetForField`) falls back to
              -- `isIdentityFieldInlineSaveSupported`, which is broader and does include name parts.
              -- So `saveContextualChildField` would happily write `child.first_name` — the configured
              -- card can never offer it, because the row is never marked editable in the first place.
              -- A capability that exists and is unreachable, which this repository has recorded before
              -- in another form ("a RegisteredAction is unreachable until it is also in
              -- `capabilityRegistry.ts`").
              --
              -- `child.allergies` is deliberately left out of the policy: it is selected and displayed,
              -- so it is the in-fixture control that a policy widens only the fields it NAMES.
              'fieldPolicies', jsonb_build_object(
                'child.date_of_birth', 'editable',
                'child.first_name', 'editable'
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
/*
 * UPSERT, not `do nothing` — and the difference is the whole reason this fixture can be edited.
 *
 * Every other row here is preceded by a DELETE of the `fbc0%` prefix, so a re-run rebuilds it. This
 * layout row is NOT in those deletes (it is the tenant's published composition, not fixture data
 * hanging off a household), so with `do nothing` the FIRST run's document was permanent: adding
 * `fieldPolicies` above changed the file and changed nothing in the tenant, silently, and the edit
 * journey would have gone on failing against a document that no longer matched its own fixture.
 *
 * A fixture that cannot converge the tenant onto what it declares is not idempotent — it is merely
 * insert-once, which is indistinguishable from idempotent until the day you change it.
 */
on conflict (id) do update set
  doc = excluded.doc,
  name = excluded.name,
  status = excluded.status,
  published_at = excluded.published_at;

-- ── Verification: what a run should see before the browser starts.
select 'jane (staff person)' as fixture, count(*)::text as n from persons where id = 'fbc00000-0000-4000-8000-00000000a001'::uuid
union all select 'jane employment', count(*)::text from employments where id = 'fbc00000-0000-4000-8000-00000000e001'::uuid
union all select 'kurzman household', count(*)::text from customers where id = 'fbc00000-0000-4000-8000-00000000d001'::uuid
union all select 'kurzman parent edge', count(*)::text from customer_persons where customer_id = 'fbc00000-0000-4000-8000-00000000d001'::uuid
union all select 'kurzman children', count(*)::text from customer_members where customer_id = 'fbc00000-0000-4000-8000-00000000d001'::uuid
union all select 'convergence work unit', count(*)::text from work_units where id = 'fbc00000-0000-4000-8000-00000000c000'::uuid
union all select 'kurzman case', count(*)::text from opportunities where id = 'fbc00000-0000-4000-8000-00000000c003'::uuid
union all select 'cases in that unit (must be 1)', count(*)::text from opportunities where work_unit_id = 'fbc00000-0000-4000-8000-00000000c000'::uuid
union all select 'lennon waitlist participation', count(*)::text from process_instances where id = 'fbc00000-0000-4000-8000-00000000c004'::uuid
union all select 'lennon ON the case (OCM)', count(*)::text from opportunity_customer_members where id = 'fbc00000-0000-4000-8000-00000000c006'::uuid
union all select 'published focus panel summary', count(*)::text from entity_layouts where id = 'fbc00000-0000-4000-8000-00000000c005'::uuid
union all select 'lennon assignment (2nd context)', count(*)::text from schedule_assignments where id = 'fbc00000-0000-4000-8000-00000000f003'::uuid
union all select 'assignment categories (must be 3)', count(*)::text from operational_assignment_types where id::text like 'fbc0%'
union all select '  … admitting staff (must be 2)', count(*)::text from operational_assignment_types where id::text like 'fbc0%' and 'staff' = any(subject_types)
union all select 'jane staff assignment', count(*)::text from schedule_assignments where id = 'fbc00000-0000-4000-8000-000000009010'::uuid
-- The invariant that makes it STAFF grain rather than a child in disguise. If a future edit ever
-- gives Jane a member row, this reads 0 and the fixture says so before the browser does.
union all select '  … member_id NULL + person set (must be 1)', count(*)::text from schedule_assignments
  where id = 'fbc00000-0000-4000-8000-000000009010'::uuid and customer_member_id is null
    and subject_person_id = 'fbc00000-0000-4000-8000-00000000a001'::uuid and subject_type = 'staff'
union all select 'jane has NO member row (must be 0)', count(*)::text from customer_members
  where org_id = :'org'::uuid and person_id = 'fbc00000-0000-4000-8000-00000000a001'::uuid
-- Staff rows the browser created in a previous run and the deletes did not reclaim. Anything above
-- 1 means the fixture is accumulating rather than restoring.
union all select 'total jane staff rows (must be 1)', count(*)::text from schedule_assignments
  where org_id = :'org'::uuid and subject_type = 'staff'
    and subject_person_id = 'fbc00000-0000-4000-8000-00000000a001'::uuid
union all select 'tatum participation (equality subject)', count(*)::text from process_instances where id = 'fbc00000-0000-4000-8000-00000000c007'::uuid
union all select 'tatum case in canonical unit', count(*)::text from opportunities where id = '00000000-0000-4000-8000-400000000963'::uuid and work_unit_id = :'enrollment_unit'::uuid;
