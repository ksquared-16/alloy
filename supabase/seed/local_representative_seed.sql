-- =============================================================================
-- Alloy — local representative operator seed (SYNTHETIC, deterministic)
-- =============================================================================
-- Purpose: produce the operational scenario the Alloy operator runtime needs so
-- that `/adminV2/workspace` and the `new-leads` Work Unit render a populated
-- queue and an operational Focus Panel, on a local DB with all migrations
-- applied.
--
-- SYNTHETIC ONLY. No production data, no customer PII. Every household is
-- "Test Family NNNN"; emails use the reserved `.invalid` TLD; phones use the
-- fictional +1-555 range.
--
-- Deterministic + idempotent:
--   * fixed UUIDs (see "Fixed identifiers" below); bulk rows derive their UUID
--     from their index, so re-running produces byte-identical ids.
--   * every write is an upsert (ON CONFLICT DO UPDATE / DO NOTHING).
--   * safe to re-run: control-plane replay (Section 3) is re-entrant, and the
--     authoritative config (Sections 4-6) is re-asserted AFTER the replay so the
--     final state never depends on migration side effects.
--
-- RUN (from the repo root):
--   psql "postgresql://postgres:postgres@127.0.0.1:56322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/seed/local_representative_seed.sql
--
-- `\ir` include paths resolve relative to THIS FILE, so any cwd works.
--
-- =============================================================================
-- Fixed identifiers (tests may rely on these)
-- -----------------------------------------------------------------------------
--   org id                00000000-0000-4000-8000-000000000001
--   org slug              northwind-early-learning
--   QA auth user id       00000000-0000-4000-8000-000000000002
--   QA auth email         qa.operator@northwind.invalid
--   department id         00000000-0000-4000-8000-000000000020  (key `enrollment`)
--   process id            00000000-0000-4000-8000-000000000021  (key `enrollment`)
--   work unit `new_leads` 00000000-0000-4000-8000-000000000030  → route /new-leads
--   work unit pipeline    00000000-0000-4000-8000-000000000031  (`enrollment_pipeline`)
--   work unit `tours`     00000000-0000-4000-8000-000000000032
--   site (Riverside)      00000000-0000-4000-8000-000000000010
--   site (Lakeside)       00000000-0000-4000-8000-000000000011
--   canonical subject     00000000-0000-4000-8000-400000000001  (opportunity #1,
--                           status open / stage lead, in the New Leads queue)
--
-- Bulk id scheme: '00000000-0000-4000-8000-' || <tag> || lpad(to_hex(n), 11, '0')
--   tag 1 = customers, 2 = persons, 3 = children (customer_members),
--       4 = opportunities, 5 = opportunity_persons, 6 = OCM, 7 = operational_tasks
-- =============================================================================

\set ON_ERROR_STOP on
\set ORG_ID   '00000000-0000-4000-8000-000000000001'
\set USER_ID  '00000000-0000-4000-8000-000000000002'
\set DEPT_ID  '00000000-0000-4000-8000-000000000020'
\set WU_NEW_LEADS '00000000-0000-4000-8000-000000000030'
\set WU_PIPELINE  '00000000-0000-4000-8000-000000000031'
\set WU_TOURS     '00000000-0000-4000-8000-000000000032'
\set SITE_A '00000000-0000-4000-8000-000000000010'
\set SITE_B '00000000-0000-4000-8000-000000000011'

\echo '== Section 1: org + industry =='

-- The childcare `industries` row is created by 20260430211000; ensure it exists
-- so a fresh DB (or one seeded before that migration) still resolves.
INSERT INTO public.industries (key, label, description, is_active)
VALUES ('childcare', 'Childcare', 'Early childhood centers and family enrollment (MVP vocabulary).', true)
ON CONFLICT (key) DO UPDATE SET is_active = true, updated_at = now();

-- Org UUID is deliberately all-zeros-prefixed: `resolveAdminAccessCore` picks the
-- LEXICOGRAPHICALLY SMALLEST org_id among a user's admin/ops rows as the primary
-- org, so this org always wins for the QA user.
INSERT INTO public.orgs (id, name, slug, status, industry_id)
SELECT :'ORG_ID'::uuid, 'Northwind Early Learning', 'northwind-early-learning', 'active', i.id
FROM public.industries i
WHERE i.key = 'childcare'
ON CONFLICT (id) DO UPDATE SET
    name        = EXCLUDED.name,
    slug        = EXCLUDED.slug,
    status      = 'active',
    industry_id = EXCLUDED.industry_id;

\echo '== Section 2: QA auth user + user_roles =='

-- Minimal Supabase auth identity. `encrypted_password` is intentionally left
-- NULL — this seed does not fabricate credentials. Attach a password out of band:
--   supabase --workdir . auth admin update-user-by-id 00000000-0000-4000-8000-000000000002 --password '<choose>'
-- or via the Studio "Users" screen. Org resolution (user_roles) does not need it.
--
-- The token columns below are set to '' rather than left NULL on purpose. GoTrue
-- scans them into non-nullable Go strings, so a NULL makes EVERY auth query for
-- this user fail with "Database error querying schema" — including the admin call
-- that attaches the password, which would make the instructions above impossible
-- to follow. email_confirmed_at is set because an unconfirmed user cannot sign in
-- and there is no inbox to confirm from in a local synthetic environment.
INSERT INTO auth.users (
    id, instance_id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at
)
VALUES (
    :'USER_ID'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'qa.operator@northwind.invalid',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"QA Operator (synthetic)"}'::jsonb,
    '', '', '', '',
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at),
    confirmation_token = COALESCE(auth.users.confirmation_token, ''),
    recovery_token = COALESCE(auth.users.recovery_token, ''),
    email_change = COALESCE(auth.users.email_change, ''),
    email_change_token_new = COALESCE(auth.users.email_change_token_new, ''),
    updated_at = now();

-- GoTrue resolves a password grant through auth.identities, not auth.users alone;
-- without this row the user exists but cannot sign in.
INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
VALUES (
    :'USER_ID'::uuid,
    :'USER_ID'::uuid,
    :'USER_ID'::text,
    'email',
    jsonb_build_object('sub', :'USER_ID', 'email', 'qa.operator@northwind.invalid', 'email_verified', true),
    now(), now(), now()
)
ON CONFLICT (provider_id, provider) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

-- auth.users -> user_roles -> orgs is the org-resolution chain
-- (web/lib/admin/resolveAdminAccessCore.ts). PORTAL_ROLES = {admin, ops};
-- mutations additionally require role = 'admin'.
INSERT INTO public.user_roles (user_id, org_id, role)
VALUES (:'USER_ID'::uuid, :'ORG_ID'::uuid, 'admin')
ON CONFLICT (user_id, org_id, role) DO NOTHING;

\echo '== Section 3a: enrollment department shell (required BEFORE control-plane replay) =='

-- Many control-plane seed migrations target "orgs that have a department with
-- key='enrollment'" (e.g. 20260601100000, 20260601110000). The department row
-- must therefore exist BEFORE the replay in Section 3b. Metadata is set to its
-- authoritative value later (Section 4), after the replay.
INSERT INTO public.departments (id, org_id, key, name, description, sort_order, is_active, metadata, updated_at)
VALUES (
    :'DEPT_ID'::uuid, :'ORG_ID'::uuid, 'enrollment', 'Enrollment',
    'Lead to enrolled — inquiry, tour, decision, placement.', 0, true, '{}'::jsonb, now()
)
ON CONFLICT (org_id, key) DO UPDATE SET
    id = EXCLUDED.id, name = EXCLUDED.name, is_active = true, updated_at = now();

-- Work-unit SHELLS. These exist before the replay purely so that replayed
-- migrations which place work-unit-scoped rows can see them on the FIRST run —
-- e.g. 20260623120100_workspace_oip_kpi_placement.sql inserts
-- `workspace_kpi_placement` rows at surface='work_unit' for each work unit of an
-- enrollment department. Without the shells, run 1 would produce 9 KPI
-- placements and run 2 would produce 18: the seed would not be convergent.
-- queue_definition/metadata here are placeholders; Section 6 re-asserts the
-- authoritative documents after the replay.
INSERT INTO public.work_units (id, org_id, department_id, key, name, sort_order, is_active, queue_definition, metadata)
VALUES
    ('00000000-0000-4000-8000-000000000030'::uuid, :'ORG_ID'::uuid, :'DEPT_ID'::uuid, 'new_leads',           'New Leads',           0, true, '{}'::jsonb, '{}'::jsonb),
    ('00000000-0000-4000-8000-000000000031'::uuid, :'ORG_ID'::uuid, :'DEPT_ID'::uuid, 'enrollment_pipeline', 'Enrollment Pipeline', 1, true, '{}'::jsonb, '{}'::jsonb),
    ('00000000-0000-4000-8000-000000000032'::uuid, :'ORG_ID'::uuid, :'DEPT_ID'::uuid, 'tours',               'Tours',               2, true, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (department_id, key) DO NOTHING;

\echo '== Section 3b: control-plane replay =='
-- ---------------------------------------------------------------------------
-- WHY A REPLAY, NOT A HAND-COPY.
-- The org-scoped control plane (statuses, option sets, field/section
-- definitions, org action catalog, KPI placements, role vocabularies) is not
-- provisioned on org creation. It is spread across ~66 one-shot BACKFILL
-- migrations that select their targets from a snapshot of `public.orgs` /
-- `departments` AT APPLY TIME:
--     FROM public.orgs o                                   (all orgs)
--     WHERE o.industry_id IN (... key = 'childcare')       (industry-scoped)
--     WHERE lower(coalesce(d.key,'')) = 'enrollment'       (enrollment-dept)
-- This DB had orgs=0 when they applied, so every one of them was a no-op and a
-- newly created org lands with an EMPTY control plane.
--
-- Each of these migrations is already idempotent (ON CONFLICT / NOT EXISTS), so
-- re-running them now — with the org + enrollment department in place — seeds
-- exactly the rows they would have seeded, with zero hand-copy drift. They must
-- run in ONE psql session: 20260430211000 creates the TEMP table
-- `_childcare_mvp_seed_target_orgs` that later files (e.g. 20260531140000) read.
--
-- Ordered by migration timestamp. `\ir` resolves relative to this file.
-- ---------------------------------------------------------------------------
\ir ../migrations/20260402103100_field_registry_batch1_field_definition_seeds.sql
\ir ../migrations/20260403101000_customer_person_role_type_primary_contact_seed.sql
\ir ../migrations/20260403120000_quote_intake_option_sets_specialty_opportunity.sql
\ir ../migrations/20260408170000_record_overview_layouts_cleaning_org_jobs.sql
\ir ../migrations/20260408180000_cleaning_org_operations_unassigned_work_unit_seed.sql
\ir ../migrations/20260409090000_cleaning_org_departments_and_work_units_seed.sql
\ir ../migrations/20260421143000_cleaning_type_unified_option_set.sql
\ir ../migrations/20260424190000_childcare_opportunity_inquiry_drawer_workflow_layout.sql
\ir ../migrations/20260426120000_field_definitions_batch1_baseline_backfill_orgs.sql
\ir ../migrations/20260430103000_ensure_childcare_primary_contact_customer_person_role_type.sql
-- 20260430211000 and 3 earlier files each CREATE+populate the TEMP table
-- `_childcare_mvp_seed_target_orgs` with a plain INSERT (no ON CONFLICT). In a single
-- session they collide on its PK, so drop it before each creator. It must SURVIVE after
-- 20260430211000: 20260531140000 reads it.
DROP TABLE IF EXISTS _childcare_mvp_seed_target_orgs;
\ir ../migrations/20260430120000_childcare_program_type_consolidate_age_group.sql
DROP TABLE IF EXISTS _childcare_mvp_seed_target_orgs;  -- see note above
\ir ../migrations/20260430140000_record_drawer_layouts_org_scoped.sql
DROP TABLE IF EXISTS _childcare_mvp_seed_target_orgs;  -- see note above
\ir ../migrations/20260430143000_opportunity_customer_members_outcome_status_key.sql
\ir ../migrations/20260430203000_childcare_opportunity_drawer_workflow_v3_layout.sql
DROP TABLE IF EXISTS _childcare_mvp_seed_target_orgs;  -- see note above
\ir ../migrations/20260430211000_childcare_mvp_control_plane_seed.sql
\ir ../migrations/20260430216000_childcare_org_delete_cleaning_location_field_definitions.sql
\ir ../migrations/20260430224000_enrollment_mvp_action_set.sql
\ir ../migrations/20260430226000_enrollment_queue_quick_action_update_status_add_note.sql
\ir ../migrations/20260430230000_fix_update_status_add_note_queue_placement.sql
\ir ../migrations/20260430231000_status_transition_rules_v1.sql
\ir ../migrations/20260430232000_enrollment_contact_attempted_action.sql
\ir ../migrations/20260430232500_enrollment_pipeline_statuses_and_queue_buckets_v1.sql
\ir ../migrations/20260430234000_enrollment_pipeline_queue_definition_grouped_buckets.sql
\ir ../migrations/20260430240000_opportunity_persons_family_contacts.sql
\ir ../migrations/20260430241000_right_rail_workspace_v1.sql
\ir ../migrations/20260430253000_enrollment_right_rail_dept_scope.sql
\ir ../migrations/20260501193000_workspace_kpi_placement.sql
\ir ../migrations/20260502100000_kpi_v1_context_placement_seeds.sql
\ir ../migrations/20260505120100_settings_users_roles_permission.sql
\ir ../migrations/20260505153000_backfill_default_role_definitions.sql
\ir ../migrations/20260505164000_permission_grid_keys.sql
\ir ../migrations/20260513103000_childcare_opportunity_drawer_append_tour_scheduling.sql
\ir ../migrations/20260520120000_inquiry_child_desired_start_and_field_defs.sql
\ir ../migrations/20260526153000_action_buttons_phase2_message_ask_bos.sql
\ir ../migrations/20260527130000_queue_row_preview_open_only.sql
\ir ../migrations/20260529120000_inquiry_child_field_label_convergence.sql
\ir ../migrations/20260529160000_location_metadata_field_definitions_convergence.sql
\ir ../migrations/20260529210000_person_communication_opt_out_field.sql
\ir ../migrations/20260529220000_person_gender_field_definition.sql
\ir ../migrations/20260530120000_person_child_lifecycle_statuses_and_dates.sql
\ir ../migrations/20260531140000_person_drawer_layout_runtime_v1.sql
\ir ../migrations/20260601100000_child_lifecycle_status_definitions_v2.sql
\ir ../migrations/20260601110000_opportunity_case_status_definitions_v2.sql
\ir ../migrations/20260601130000_enrollment_pipeline_queue_definition_v2.sql
\ir ../migrations/20260601140000_deactivate_legacy_enrollment_work_units_v2.sql
\ir ../migrations/20260602100000_enrollment_pipeline_queue_definition_v2_14a.sql
\ir ../migrations/20260602120000_person_status_applicability_metadata.sql
\ir ../migrations/20260602130000_person_address_field_definitions.sql
\ir ../migrations/20260602170000_phase1a_entry_lifecycle_actions.sql
\ir ../migrations/20260602180000_phase1b_qualification_status_and_universal_actions.sql
\ir ../migrations/20260607120000_inquiry_child_native_parity_fc15.sql
\ir ../migrations/20260608120000_childcare_layout_field_catalog_seed.sql
\ir ../migrations/20260609120000_customer_member_field_definitions_fc_cm1.sql
\ir ../migrations/20260610140000_enrollment_status_matrix_seed_metadata.sql
\ir ../migrations/20260611120000_childcare_field_catalog_e1_repair.sql
\ir ../migrations/20260612120000_enrollment_process_status_vocabulary_repair.sql
\ir ../migrations/20260617120000_opportunity_location_id_field_definition_repair.sql
\ir ../migrations/20260618120000_option_sets_config_reference_seeds.sql
\ir ../migrations/20260622140000_tour_no_show_stage_scheduled_mapping.sql
\ir ../migrations/20260622205000_tour_bp_granular_stage_alignment.sql
\ir ../migrations/20260623120100_workspace_oip_kpi_placement.sql
\ir ../migrations/20260624120100_analytics_v2_metric_platform_seeds.sql
\ir ../migrations/20260624120200_analytics_v2_surface_placements.sql
\ir ../migrations/20260707120100_header_metric_definitions_activation.sql
\ir ../migrations/20260711153100_person_child_relationship_type_option_set.sql
\ir ../migrations/20260722000000_operational_expectations_authority_model_p1_wave_c.sql

\echo '== Section 4: department process configuration (authoritative, post-replay) =='

-- `departments.metadata.lifecycle_builder_v1` is the durable business-process /
-- stage / work-view configuration (web/lib/lifecycle/lifecycleBuilderConfig.ts).
-- No migration has ever written a work view — they are written only by the app
-- (web/lib/lifecycle/persistWorkViewsV1.ts) — so this document is authored here.
--
-- It was GENERATED by the repo's own template code and validated through the
-- repo's own parser (`parseLifecycleBuilderV1`), with the template's random
-- stage UUIDs replaced by deterministic ones:
--   buildEnrollmentTemplateStageRecords() + ENROLLMENT_DEFAULT_TRACKS
--   (web/lib/businessProcessTemplates/enrollmentProcessTemplate.ts)
-- i.e. it is exactly what "Apply Enrollment template" produces in Settings.
--
-- Process `enrollment` (id 00000000-0000-4000-8000-000000000021) carries:
--   * tracks_v1        — family_track / child_track + the decision split rule
--   * stages[8]        — lead, tour, decision, closed (family track)
--                        waitlist, enrolling, enrolled, closed_withdrawn (child track)
--                        each with queue_membership_v1 + stage_operating_plan_v1
--   * work_views_v1[4] — New Leads, Tours, Follow Up, All Work
--
-- Work-view URL slugs derive from the LABEL, not the id
-- (workViewRouteKeyFromLabel): "New Leads" -> new_leads -> /new-leads.
--
-- ROW GRAIN IS DECLARED, NOT DERIVED.
--   Every work view here declares row_grain_v1 = "family". Without a declaration
--   the runtime derives grain from the stages a lens filters on, and a lens with
--   no stage predicate is treated as "all stages" -- which in this process spans
--   family (lead, tour, decision, closed) AND child (waitlist, enrolling,
--   enrolled, closed_withdrawn). Law G-1 then refuses the surface as
--   grain-ambiguous, and every Work View renders
--   "This Work View can't be shown until its configuration is fixed."
--   All four lenses are family-grain by intent: they present the family case,
--   not a per-child enrollment track. Declaring it is the doctrine-correct fix
--   (resolveLensRowGrain: "a declared lens is unambiguous BY DECLARATION"),
--   and a declaration that contradicted a lens's own stage predicate would
--   still be refused.
UPDATE public.departments
SET metadata = $json${"lifecycle_builder_v1":{"version":1,"active_process_id":"00000000-0000-4000-8000-000000000021","processes":[{"id":"00000000-0000-4000-8000-000000000021","key":"enrollment","name":"Enrollment","description":"Lead to enrolled — inquiry, tour, decision, placement.","primary_entity":"opportunity","sort_order":0,"is_active":true,"tracks_v1":{"version":1,"tracks":[{"key":"family_track","label":"Family Track","subject":"family_case","sort_order":0},{"key":"child_track","label":"Child Track","subject":"child_enrollment_track","sort_order":1}],"split_rules":[{"version":1,"from_track_key":"family_track","from_stage_key":"decision","into_track_key":"child_track","per_subject_outcomes":[{"outcome_key":"waitlist","label":"Waitlist","target_stage_key":"waitlist"},{"outcome_key":"enrolling","label":"Enrolling","target_stage_key":"enrolling"},{"outcome_key":"closed_withdrawn","label":"Closed / Withdrawn","target_stage_key":"closed_withdrawn"},{"outcome_key":"no_action","label":"No action — keep with family","target_stage_key":null}]}]},"work_views_v1":[{"id":"new_leads","label":"New Leads","mission":"Respond to every new family inquiry before it goes cold.","compat_queue_key":"new_leads","display_order":1,"visible_in_runtime":true,"sort_v1":{"field_key":"updated_at","direction":"desc"},"sorts_v1":[{"field_key":"updated_at","direction":"desc"}],"row_grain_v1":"family"},{"id":"tours","label":"Tours","mission":"Confirm the visit and record the outcome.","compat_queue_key":"tours","display_order":2,"visible_in_runtime":true,"sort_v1":{"field_key":"updated_at","direction":"asc"},"sorts_v1":[{"field_key":"updated_at","direction":"asc"}],"row_grain_v1":"family"},{"id":"follow_up","label":"Follow Up","mission":"Keep the conversation moving toward a decision.","compat_queue_key":"communications_followup","display_order":3,"visible_in_runtime":true,"sort_v1":{"field_key":"updated_at","direction":"desc"},"sorts_v1":[{"field_key":"updated_at","direction":"desc"}],"row_grain_v1":"family"},{"id":"all_work","label":"All Work","mission":"Every open case in this process.","display_order":4,"visible_in_runtime":true,"sort_v1":{"field_key":"updated_at","direction":"desc"},"sorts_v1":[{"field_key":"updated_at","direction":"desc"}],"row_grain_v1":"family"}],"stages":[{"id":"00000000-0000-4000-8000-000000000230","key":"lead","label":"New Lead","track_key":"family_track","sort_order":0,"is_active":true,"grain":"family","queue_membership_v1":{"version":1,"lifecycle_key":"enrollment","stage_key":"lead","subject_type":"case","count_unit":"cases","included_disposition_keys":[]},"stage_operating_plan_v1":{"version":1,"journey_segment":"family","purpose":"Reach the family and determine next steps.","outgoing_transitions":[{"transition_ref":"lead_to_tour","source_stage_key":"lead","target_stage_key":"tour","label":"Continue to Tour","available":true,"status_key":"open"},{"transition_ref":"lead_to_closed","source_stage_key":"lead","target_stage_key":"closed","label":"Close as Lost","available":true,"status_key":"closed","closes_record":true}],"work_templates":[{"template_key":"contact_family","label":"Contact Family","description":"Reach the family, understand their needs, and determine the next step.","required":true,"primary":true,"due_policy":{"kind":"offset_days","days":1},"owner_strategy":"record_owner","work_definition_key":"contact_family","execution_mode":"direct_action","primary_action":{"action_ref":"quick_message","override_label":"Contact Family"},"helpful_actions":[{"action_ref":"schedule_tour"},{"action_ref":"send_form"}],"outcome_refs":[{"outcome_ref":"reached_family"},{"outcome_ref":"left_message"},{"outcome_ref":"needs_follow_up"},{"outcome_ref":"interested"},{"outcome_ref":"not_interested"}]}],"outcomes":[{"outcome_key":"reached_family","label":"Reached Family","successful":true},{"outcome_key":"left_message","label":"Left Message"},{"outcome_key":"needs_follow_up","label":"Needs Follow-up"},{"outcome_key":"interested","label":"Interested","successful":true},{"outcome_key":"not_interested","label":"Not Interested","completes_work":true}],"outcome_rules":[{"rule_key":"reached_family_to_tour","when_outcome_key":"reached_family","targets":[{"kind":"move_to_stage","transition_ref":"lead_to_tour"}]},{"rule_key":"interested_to_tour","when_outcome_key":"interested","targets":[{"kind":"move_to_stage","transition_ref":"lead_to_tour"}]},{"rule_key":"not_interested_close","when_outcome_key":"not_interested","targets":[{"kind":"move_to_stage","transition_ref":"lead_to_closed"}]},{"rule_key":"left_message_remain","when_outcome_key":"left_message","targets":[{"kind":"no_movement"}]},{"rule_key":"needs_follow_up_remain","when_outcome_key":"needs_follow_up","targets":[{"kind":"no_movement"}]}],"attention_rules":[{"rule_key":"first_contact_overdue","kind":"work_overdue","label":"First contact overdue","severity":"medium","threshold":1,"threshold_duration":{"offset_value":1,"offset_unit":"days"},"template_key":"contact_family","targets":[{"kind":"create_needs_attention","attention_reason":"First contact overdue after 1 day","wait_bucket":"waiting_on_staff"}]},{"rule_key":"stage_age_7d","kind":"stage_age_exceeded","label":"Stage age > 7 days","severity":"medium","threshold":7,"threshold_duration":{"offset_value":7,"offset_unit":"days"},"targets":[{"kind":"create_needs_attention","attention_reason":"Lead stage aging beyond 7 days","wait_bucket":"waiting_on_staff"}]},{"rule_key":"missing_required_fields","kind":"missing_requirements","label":"Missing required fields","severity":"medium","targets":[{"kind":"create_needs_attention","attention_reason":"Missing required Lead stage fields","wait_bucket":"waiting_on_staff"}]}],"lifecycle_key":"enrollment","stage_key":"lead"}},{"id":"00000000-0000-4000-8000-000000000231","key":"tour","label":"Tour","track_key":"family_track","sort_order":1,"is_active":true,"grain":"family","queue_membership_v1":{"version":1,"lifecycle_key":"enrollment","stage_key":"tour","subject_type":"case","count_unit":"cases","included_disposition_keys":[]},"stage_operating_plan_v1":{"version":1,"journey_segment":"family","purpose":"Conduct the tour and record what happened.","outgoing_transitions":[{"transition_ref":"tour_to_decision","source_stage_key":"tour","target_stage_key":"decision","label":"Continue to Decision","available":true,"status_key":"open"},{"transition_ref":"tour_to_waitlist","source_stage_key":"tour","target_stage_key":"waitlist","label":"Move to Waitlist","available":true},{"transition_ref":"tour_to_closed","source_stage_key":"tour","target_stage_key":"closed","label":"Close as Lost","available":true,"status_key":"closed","closes_record":true}],"work_templates":[{"template_key":"conduct_tour","label":"Conduct Tour","description":"Guide the family through the tour, then record the outcome.","required":true,"primary":true,"due_policy":{"kind":"same_day"},"owner_strategy":"record_owner","work_definition_key":"record_tour_outcome","execution_mode":"outcome_led","helpful_actions":[{"action_ref":"schedule_tour"},{"action_ref":"send_confirmation"},{"action_ref":"send_reminder"},{"action_ref":"reschedule"},{"action_ref":"quick_message"}],"outcome_refs":[{"outcome_ref":"tour_scheduled"},{"outcome_ref":"tour_completed"},{"outcome_ref":"no_show"},{"outcome_ref":"needs_follow_up"},{"outcome_ref":"family_declined"},{"outcome_ref":"no_availability"}]}],"outcomes":[{"outcome_key":"tour_scheduled","label":"Tour Scheduled"},{"outcome_key":"tour_completed","label":"Tour Completed","successful":true,"completes_work":true},{"outcome_key":"no_show","label":"No Show","completes_work":true},{"outcome_key":"needs_follow_up","label":"Needs Follow-up"},{"outcome_key":"family_declined","label":"Family Declined","completes_work":true},{"outcome_key":"no_availability","label":"No Availability"}],"outcome_rules":[{"rule_key":"tour_completed_to_decision","when_outcome_key":"tour_completed","targets":[{"kind":"move_to_stage","transition_ref":"tour_to_decision"}]},{"rule_key":"no_show_follow_up","when_outcome_key":"no_show","targets":[{"kind":"no_movement"},{"kind":"create_next_work","template_key":"conduct_tour","follow_up_due_policy":{"anchor":"outcome_recorded_at","offset_value":2,"offset_unit":"hours","direction":"after","missing_anchor_behavior":"use_outcome_recorded_at"}}]},{"rule_key":"needs_follow_up_attention","when_outcome_key":"needs_follow_up","targets":[{"kind":"no_movement"},{"kind":"create_needs_attention","attention_reason":"Tour needs follow-up","wait_bucket":"waiting_on_staff","follow_up_due_policy":{"anchor":"outcome_recorded_at","offset_value":3,"offset_unit":"days","direction":"after"}}]},{"rule_key":"family_declined_close","when_outcome_key":"family_declined","targets":[{"kind":"move_to_stage","transition_ref":"tour_to_closed"}]},{"rule_key":"no_availability_waitlist","when_outcome_key":"no_availability","targets":[{"kind":"move_to_stage","transition_ref":"tour_to_waitlist"}]},{"rule_key":"tour_scheduled_remain","when_outcome_key":"tour_scheduled","targets":[{"kind":"no_movement"}]}],"attention_rules":[],"lifecycle_key":"enrollment","stage_key":"tour"}},{"id":"00000000-0000-4000-8000-000000000232","key":"decision","label":"Placement / Decision","track_key":"family_track","sort_order":2,"is_active":true,"grain":"family","queue_membership_v1":{"version":1,"lifecycle_key":"enrollment","stage_key":"decision","subject_type":"case","count_unit":"cases","included_disposition_keys":[]},"stage_operating_plan_v1":{"version":1,"journey_segment":"family","purpose":"Support the family enrollment decision.","outgoing_transitions":[{"transition_ref":"decision_to_enrolling","source_stage_key":"decision","target_stage_key":"enrolling","label":"Continue to Enrolling","available":true},{"transition_ref":"decision_to_waitlist","source_stage_key":"decision","target_stage_key":"waitlist","label":"Move to Waitlist","available":true},{"transition_ref":"decision_to_closed","source_stage_key":"decision","target_stage_key":"closed","label":"Close as Lost","available":true,"status_key":"closed","closes_record":true}],"work_templates":[{"template_key":"support_enrollment_decision","label":"Support Enrollment Decision","description":"Help the family choose a path, then record the decision outcome.","required":true,"primary":true,"due_policy":{"kind":"offset_days","days":2},"owner_strategy":"record_owner","work_definition_key":"contact_family","execution_mode":"outcome_led","helpful_actions":[{"action_ref":"quick_message"},{"action_ref":"send_form"}],"outcome_refs":[{"outcome_ref":"family_enrolling"},{"outcome_ref":"needs_time"},{"outcome_ref":"wants_waitlist"},{"outcome_ref":"declined"}]}],"outcomes":[{"outcome_key":"family_enrolling","label":"Family Enrolling","successful":true,"completes_work":true},{"outcome_key":"needs_time","label":"Needs Time"},{"outcome_key":"wants_waitlist","label":"Wants Waitlist","successful":true,"completes_work":true},{"outcome_key":"declined","label":"Declined","completes_work":true}],"outcome_rules":[{"rule_key":"family_enrolling_move","when_outcome_key":"family_enrolling","targets":[{"kind":"move_to_stage","transition_ref":"decision_to_enrolling"}]},{"rule_key":"needs_time_remain","when_outcome_key":"needs_time","targets":[{"kind":"no_movement"}]},{"rule_key":"waitlist_move","when_outcome_key":"wants_waitlist","targets":[{"kind":"move_to_stage","transition_ref":"decision_to_waitlist"}]},{"rule_key":"declined_close","when_outcome_key":"declined","targets":[{"kind":"move_to_stage","transition_ref":"decision_to_closed"}]}],"attention_rules":[],"lifecycle_key":"enrollment","stage_key":"decision"}},{"id":"00000000-0000-4000-8000-000000000233","key":"closed","label":"Closed","track_key":"family_track","sort_order":3,"is_active":true,"grain":"family","queue_membership_v1":{"version":1,"lifecycle_key":"enrollment","stage_key":"closed","subject_type":"case","count_unit":"cases","included_disposition_keys":[]},"stage_operating_plan_v1":{"version":1,"journey_segment":"family","purpose":"Family enrollment case is closed.","work_templates":[],"outcomes":[{"outcome_key":"acknowledged","label":"Acknowledged","successful":true}],"outcome_rules":[{"rule_key":"noop","when_outcome_key":"acknowledged","targets":[{"kind":"no_movement"}]}],"attention_rules":[],"lifecycle_key":"enrollment","stage_key":"closed"}},{"id":"00000000-0000-4000-8000-000000000234","key":"waitlist","label":"Waitlist","track_key":"child_track","sort_order":4,"is_active":true,"grain":"child","queue_membership_v1":{"version":1,"lifecycle_key":"enrollment","stage_key":"waitlist","subject_type":"candidate","count_unit":"candidates","included_disposition_keys":[],"location_scope_source":"placement_site"},"stage_operating_plan_v1":{"version":1,"journey_segment":"child","purpose":"Manage waitlist candidates and spot offers.","outgoing_transitions":[{"transition_ref":"waitlist_to_enrolling","source_stage_key":"waitlist","target_stage_key":"enrolling","label":"Offer a spot","available":true}],"work_templates":[{"template_key":"review_waitlist_position","label":"Review waitlist position","required":false,"due_policy":{"kind":"offset_days","days":3},"owner_strategy":"record_owner"},{"template_key":"offer_spot","label":"Offer spot","required":false,"due_policy":{"kind":"offset_days","days":1},"owner_strategy":"record_owner"}],"outcomes":[{"outcome_key":"spot_offered","label":"Spot offered","successful":true},{"outcome_key":"candidate_paused","label":"Candidate paused"},{"outcome_key":"no_response","label":"No response to offer"}],"outcome_rules":[{"rule_key":"offer_to_enrolling","when_outcome_key":"spot_offered","targets":[{"kind":"update_child_enrollment_status","disposition_key":"waitlisted"},{"kind":"move_to_stage","transition_ref":"waitlist_to_enrolling"},{"kind":"mark_stage_work_complete"}]},{"rule_key":"pause_candidate","when_outcome_key":"candidate_paused","targets":[{"kind":"update_candidate_status","candidate_status":"paused"}]},{"rule_key":"no_response_attention","when_outcome_key":"no_response","targets":[{"kind":"create_needs_attention","attention_reason":"No response to waitlist offer","wait_bucket":"waiting_on_staff"}]}],"attention_rules":[],"lifecycle_key":"enrollment","stage_key":"waitlist"}},{"id":"00000000-0000-4000-8000-000000000235","key":"enrolling","label":"Enrolling","track_key":"child_track","sort_order":5,"is_active":true,"grain":"child","queue_membership_v1":{"version":1,"lifecycle_key":"enrollment","stage_key":"enrolling","subject_type":"child","count_unit":"enrollment_tracks","included_disposition_keys":[],"location_scope_source":"ocm_site"},"stage_operating_plan_v1":{"version":1,"journey_segment":"family","purpose":"Complete enrollment paperwork after the family decides to enroll.","outgoing_transitions":[],"work_templates":[{"template_key":"send_enrollment_packet","label":"Send Enrollment Packet","description":"Send the enrollment packet / forms after the family enters Enrolling.","required":true,"primary":true,"due_policy":{"kind":"offset_days","days":1},"owner_strategy":"record_owner","work_definition_key":"contact_family","execution_mode":"direct_action","primary_action":{"action_ref":"send_form","override_label":"Send Enrollment Packet"}}],"outcomes":[{"outcome_key":"packet_sent","label":"Packet sent","successful":true,"completes_work":true},{"outcome_key":"packet_pending","label":"Packet still pending"}],"outcome_rules":[{"rule_key":"packet_sent_complete","when_outcome_key":"packet_sent","targets":[{"kind":"mark_stage_work_complete"}]},{"rule_key":"packet_attention","when_outcome_key":"packet_pending","targets":[{"kind":"create_needs_attention","attention_reason":"Enrollment packet incomplete","wait_bucket":"waiting_on_staff"}]}],"attention_rules":[],"lifecycle_key":"enrollment","stage_key":"enrolling"}},{"id":"00000000-0000-4000-8000-000000000236","key":"enrolled","label":"Enrolled","track_key":"child_track","sort_order":6,"is_active":true,"grain":"child","queue_membership_v1":{"version":1,"lifecycle_key":"enrollment","stage_key":"enrolled","subject_type":"child","count_unit":"enrollment_tracks","included_disposition_keys":[],"location_scope_source":"ocm_site"},"stage_operating_plan_v1":{"version":1,"journey_segment":"child","purpose":"Post-enrollment follow-up.","work_templates":[],"outcomes":[{"outcome_key":"acknowledged","label":"Acknowledged","successful":true}],"outcome_rules":[{"rule_key":"noop","when_outcome_key":"acknowledged","targets":[{"kind":"no_movement"}]}],"attention_rules":[],"lifecycle_key":"enrollment","stage_key":"enrolled"}},{"id":"00000000-0000-4000-8000-000000000237","key":"closed_withdrawn","label":"Closed / Withdrawn","track_key":"child_track","sort_order":7,"is_active":true,"grain":"child","queue_membership_v1":{"version":1,"lifecycle_key":"enrollment","stage_key":"closed_withdrawn","subject_type":"child","count_unit":"enrollment_tracks","included_disposition_keys":[],"location_scope_source":"ocm_site"},"stage_operating_plan_v1":{"version":1,"journey_segment":"child","purpose":"Child enrollment track was withdrawn or closed.","work_templates":[],"outcomes":[{"outcome_key":"acknowledged","label":"Acknowledged","successful":true}],"outcome_rules":[{"rule_key":"noop","when_outcome_key":"acknowledged","targets":[{"kind":"no_movement"}]}],"attention_rules":[],"lifecycle_key":"enrollment","stage_key":"closed_withdrawn"}}]}]}}$json$::jsonb,
    updated_at = now()
WHERE id = :'DEPT_ID'::uuid AND org_id = :'ORG_ID'::uuid;

\echo '== Section 5: locations (sites + rooms) =='

-- locations.location_type is CHECK-constrained to address|site|unit.
-- Childcare has no `rooms` table: a room IS a `unit` location parented to a site.
INSERT INTO public.locations (id, org_id, label, location_type, parent_location_id, is_primary, is_active,
                              address1, city, state, postal_code, country, location_number, status_key, metadata)
VALUES
    (:'SITE_A'::uuid, :'ORG_ID'::uuid, 'Northwind — Riverside Campus', 'site', NULL, true,  true,
     '100 Example Way', 'Springfield', 'OR', '97477', 'US', 1, 'active', '{"seed":"local_representative_seed"}'::jsonb),
    (:'SITE_B'::uuid, :'ORG_ID'::uuid, 'Northwind — Lakeside Campus',  'site', NULL, false, true,
     '200 Sample Street', 'Springfield', 'OR', '97478', 'US', 2, 'active', '{"seed":"local_representative_seed"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label, location_type = EXCLUDED.location_type, is_active = true,
    parent_location_id = EXCLUDED.parent_location_id, updated_at = now();

INSERT INTO public.locations (id, org_id, label, location_type, parent_location_id, is_primary, is_active,
                              location_number, status_key, metadata)
VALUES
    ('00000000-0000-4000-8000-000000000012'::uuid, :'ORG_ID'::uuid, 'Infant Room A',    'unit', :'SITE_A'::uuid, false, true, 3, 'active', '{"seed":"local_representative_seed","classroom_age_group":"infant"}'::jsonb),
    ('00000000-0000-4000-8000-000000000013'::uuid, :'ORG_ID'::uuid, 'Toddler Room A',   'unit', :'SITE_A'::uuid, false, true, 4, 'active', '{"seed":"local_representative_seed","classroom_age_group":"toddler"}'::jsonb),
    ('00000000-0000-4000-8000-000000000014'::uuid, :'ORG_ID'::uuid, 'Preschool Room A', 'unit', :'SITE_A'::uuid, false, true, 5, 'active', '{"seed":"local_representative_seed","classroom_age_group":"preschool"}'::jsonb),
    ('00000000-0000-4000-8000-000000000015'::uuid, :'ORG_ID'::uuid, 'Infant Room B',    'unit', :'SITE_B'::uuid, false, true, 6, 'active', '{"seed":"local_representative_seed","classroom_age_group":"infant"}'::jsonb),
    ('00000000-0000-4000-8000-000000000016'::uuid, :'ORG_ID'::uuid, 'Toddler Room B',   'unit', :'SITE_B'::uuid, false, true, 7, 'active', '{"seed":"local_representative_seed","classroom_age_group":"toddler"}'::jsonb),
    ('00000000-0000-4000-8000-000000000017'::uuid, :'ORG_ID'::uuid, 'Pre-K Room B',     'unit', :'SITE_B'::uuid, false, true, 8, 'active', '{"seed":"local_representative_seed","classroom_age_group":"pre_k"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label, location_type = EXCLUDED.location_type,
    parent_location_id = EXCLUDED.parent_location_id, is_active = true, updated_at = now();

\echo '== Section 6: work units (authoritative, post-replay) =='

-- Slug resolution (web/lib/admin/resolveWorkUnitByRouteSlug.ts) precedence:
--   1. work_unit_key  2. configured work_view  3. queue_lane_key
-- `/adminV2/workspace/work-unit/new-leads` -> workUnitRouteSlugToKey -> `new_leads`
-- -> DIRECT match on work_units.key. Precedence #1, so this resolves
-- deterministically to the work unit below (kind = "work_unit_key").
--
-- queue_definition docs below were generated from
-- RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2
-- (web/lib/config/enrollmentPipelineQueueDefinitionV2.ts) and each was validated
-- through the repo's own `loadQueueDefinitionBundle()` loader.
--
-- Executable queue predicate (QueueService.ts) is, at SQL level:
--     .eq("org_id", …).eq("work_unit_id", …) + status filter -> status_key IN (…)
-- OPPORTUNITY_FIELD_ALLOWLIST = {status_key, created_at, updated_at} — so
-- work_unit_id + status_key are what actually select a queue's rows.

INSERT INTO public.work_units (id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, updated_at)
VALUES (
    :'WU_NEW_LEADS'::uuid, :'ORG_ID'::uuid, :'DEPT_ID'::uuid, 'new_leads', 'New Leads',
    'First-touch intake for new family inquiries.', 0, true,
    $json${"version":2,"entity_type":"opportunity","ui":{"layout":"domain_with_attention","primary_total_label":"New Leads","primary_total_queue":"pipeline_total","suppress_other_pill":true,"suppress_lifecycle_panel":true,"suppress_active_queue_description":true,"sections":[{"key":"new_leads","label":"New Leads","queue_keys":["new_leads"]},{"key":"needs_attention","label":"Needs Attention","tone":"critical","queue_keys":["needs_attention"]}],"row_preview":{"variant":"crm_compact","fields":["title","status","primary_contact","phone","email","child_name","program","start_date","tour_date"],"actions":["open"]}},"queues":[{"key":"pipeline_total","label":"Pipeline total","description":"Total count for pipeline scope (internal KPI lane).","domain":"pipeline","grain":"case","filters":[],"filters_compat_v1":[],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"new_leads","label":"New Leads","icon":"user-plus","description":"New families — first touch not yet completed.","domain":"new_leads","grain":"case","aliases":["new_inquiry"],"filters":[{"type":"case_status","operator":"in","values":["new_inquiry","open","new"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["new_inquiry","open","new"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"needs_attention","label":"Needs attention","description":"Operational intervention overlay — not a separate lifecycle pipeline.","domain":"needs_attention","grain":"case","overlay":true,"filters":[{"type":"exception","operator":"exists"}],"filters_compat_v1":[{"type":"exception","operator":"exists"}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"critical","display":"list"}]}$json$::jsonb,
    $json${"lifecycle_builder_owned_v1":{"builder_owned":true},"lifecycle_stage_key":"lead","lifecycle_stage_label":"New Lead","lifecycle_process_id":"00000000-0000-4000-8000-000000000021"}$json$::jsonb,
    now()
)
ON CONFLICT (department_id, key) DO UPDATE SET
    id = EXCLUDED.id, org_id = EXCLUDED.org_id, name = EXCLUDED.name,
    description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, is_active = true,
    queue_definition = EXCLUDED.queue_definition, metadata = EXCLUDED.metadata, updated_at = now();

INSERT INTO public.work_units (id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, updated_at)
VALUES (
    :'WU_PIPELINE'::uuid, :'ORG_ID'::uuid, :'DEPT_ID'::uuid, 'enrollment_pipeline', 'Enrollment Pipeline',
    'Full enrollment pipeline across every lane.', 1, true,
    $json${"version":2,"entity_type":"opportunity","ui":{"layout":"domain_with_attention","primary_total_label":"Work Units","primary_total_queue":"pipeline_total","suppress_other_pill":true,"suppress_lifecycle_panel":true,"suppress_active_queue_description":true,"sections":[{"key":"new_leads","label":"New Leads","queue_keys":["new_leads"]},{"key":"tours","label":"Tours","queue_keys":["tours"]},{"key":"communications_followup","label":"Follow Up","queue_keys":["communications_followup"]},{"key":"waitlist","label":"Waitlist","queue_keys":["waitlist"]},{"key":"enrolling","label":"Enrolling","queue_keys":["enrollment_offers"]},{"key":"enrolled","label":"Enrolled","queue_keys":["enrollment_completed"]},{"key":"needs_attention","label":"Needs Attention","tone":"critical","queue_keys":["needs_attention"]}],"row_preview":{"variant":"crm_compact","fields":["title","status","primary_contact","phone","email","child_name","program","start_date","tour_date"],"actions":["open"]}},"queues":[{"key":"pipeline_total","label":"Pipeline total","description":"Total count for pipeline scope (internal KPI lane).","domain":"pipeline","grain":"case","filters":[],"filters_compat_v1":[],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"new_leads","label":"New Leads","icon":"user-plus","description":"New families — first touch not yet completed.","domain":"new_leads","grain":"case","aliases":["new_inquiry"],"filters":[{"type":"case_status","operator":"in","values":["new_inquiry","open","new"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["new_inquiry","open","new"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"communications_followup","label":"Follow Up","icon":"phone","description":"Qualification and follow-up — gathering fit before tour or waitlist.","domain":"communications_followup","grain":"case","aliases":["contacted","contact_attempted","qualification"],"filters":[{"type":"case_status","operator":"in","values":["contact_attempted","contacted","qualification"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["contact_attempted","contacted","qualification"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"tours","label":"Tours","icon":"calendar","description":"A tour is on the calendar.","domain":"tours","grain":"case","aliases":["tour_scheduled"],"filters":[{"type":"case_status","operator":"in","values":["tour_scheduled"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["tour_scheduled"]}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"standard","display":"list"},{"key":"tours_follow_up","label":"Tours","icon":"clipboard-check","description":"Post-tour decision window — completed tour, follow-up attempts, or tour no-show.","domain":"tours","grain":"case","aliases":["tour_completed_follow_up"],"filters":[{"type":"case_status","operator":"in","values":["tour_completed","follow_up_attempted","tour_no_show"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["tour_completed","follow_up_attempted","tour_no_show"]}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"standard","display":"list"},{"key":"forms_documents","label":"Forms / Documents","domain":"forms_documents","grain":"case","filters":[],"filters_compat_v1":[],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"waitlist","label":"Waitlist","icon":"clock-3","domain":"waitlist","grain":"candidate","count_unit":"children","aliases":["waitlisted"],"filters":[{"type":"candidate_status","operator":"in","values":["active","paused"]},{"type":"child_lifecycle_status","operator":"in","values":["waitlisted","offer_pending"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["waitlisted"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"enrollment_offers","label":"Enrolling","icon":"file-text","description":"Paperwork or decision in motion toward a start date.","domain":"enrollment_offers","grain":"child","count_unit":"children","aliases":["ready_to_enroll","enrolling"],"filters":[{"type":"child_lifecycle_status","operator":"in","values":["offer_pending","enrolling"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["enrolling","ready_to_enroll"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"enrollment_completed","label":"Enrolled","icon":"check-circle-2","description":"Confirmed enrollment (child completion view).","domain":"enrollment_offers","grain":"child","count_unit":"children","aliases":["enrolled"],"filters":[{"type":"child_lifecycle_status","operator":"in","values":["enrolled"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["enrolled"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"case_closed","label":"Lost","icon":"x-circle","description":"Closed — not enrolling.","domain":"archive","grain":"case","aliases":["lost"],"filters":[{"type":"case_status","operator":"in","values":["closed","lost"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["lost"]}],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"needs_attention","label":"Needs attention","description":"Operational intervention overlay — not a separate lifecycle pipeline.","domain":"needs_attention","grain":"case","overlay":true,"filters":[{"type":"exception","operator":"exists"}],"filters_compat_v1":[{"type":"exception","operator":"exists"}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"critical","display":"list"}]}$json$::jsonb,
    '{"seed":"local_representative_seed"}'::jsonb,
    now()
)
ON CONFLICT (department_id, key) DO UPDATE SET
    id = EXCLUDED.id, org_id = EXCLUDED.org_id, name = EXCLUDED.name,
    description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, is_active = true,
    queue_definition = EXCLUDED.queue_definition, metadata = EXCLUDED.metadata, updated_at = now();

INSERT INTO public.work_units (id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, updated_at)
VALUES (
    :'WU_TOURS'::uuid, :'ORG_ID'::uuid, :'DEPT_ID'::uuid, 'tours', 'Tours',
    'Scheduled visits and post-tour decisions.', 2, true,
    $json${"version":2,"entity_type":"opportunity","ui":{"layout":"domain_with_attention","primary_total_label":"Tours","primary_total_queue":"pipeline_total","suppress_other_pill":true,"suppress_lifecycle_panel":true,"suppress_active_queue_description":true,"sections":[{"key":"tours","label":"Tours","queue_keys":["tours","tours_follow_up"]},{"key":"needs_attention","label":"Needs Attention","tone":"critical","queue_keys":["needs_attention"]}],"row_preview":{"variant":"crm_compact","fields":["title","status","primary_contact","phone","email","child_name","program","start_date","tour_date"],"actions":["open"]}},"queues":[{"key":"pipeline_total","label":"Pipeline total","description":"Total count for pipeline scope (internal KPI lane).","domain":"pipeline","grain":"case","filters":[],"filters_compat_v1":[],"sort":[{"field":"updated_at","direction":"desc"}],"limit":50,"priority":"standard","display":"list"},{"key":"tours","label":"Tours","icon":"calendar","description":"A tour is on the calendar.","domain":"tours","grain":"case","aliases":["tour_scheduled"],"filters":[{"type":"case_status","operator":"in","values":["tour_scheduled"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["tour_scheduled"]}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"standard","display":"list"},{"key":"tours_follow_up","label":"Tours","icon":"clipboard-check","description":"Post-tour decision window — completed tour, follow-up attempts, or tour no-show.","domain":"tours","grain":"case","aliases":["tour_completed_follow_up"],"filters":[{"type":"case_status","operator":"in","values":["tour_completed","follow_up_attempted","tour_no_show"]}],"filters_compat_v1":[{"type":"status","operator":"in","values":["tour_completed","follow_up_attempted","tour_no_show"]}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"standard","display":"list"},{"key":"needs_attention","label":"Needs attention","description":"Operational intervention overlay — not a separate lifecycle pipeline.","domain":"needs_attention","grain":"case","overlay":true,"filters":[{"type":"exception","operator":"exists"}],"filters_compat_v1":[{"type":"exception","operator":"exists"}],"sort":[{"field":"updated_at","direction":"asc"}],"limit":50,"priority":"critical","display":"list"}]}$json$::jsonb,
    $json${"lifecycle_builder_owned_v1":{"builder_owned":true},"lifecycle_stage_key":"tour","lifecycle_stage_label":"Tour","lifecycle_process_id":"00000000-0000-4000-8000-000000000021"}$json$::jsonb,
    now()
)
ON CONFLICT (department_id, key) DO UPDATE SET
    id = EXCLUDED.id, org_id = EXCLUDED.org_id, name = EXCLUDED.name,
    description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, is_active = true,
    queue_definition = EXCLUDED.queue_definition, metadata = EXCLUDED.metadata, updated_at = now();

\echo '== Section 7: households, people, children =='
-- Volumes: 1,200 households / 1,800 guardians / 1,500 children.
-- Household ownership is consistent: person p -> customer (p<=1200 ? p : p-1200);
-- child m -> customer (m<=1200 ? m : m-1200). Households 1..600 have a second
-- guardian; households 1..300 have a second child.

-- Households (customers). Industry label for `customers` is "Family"/"Families".
INSERT INTO public.customers (id, org_id, name, customer_type, status_key, customer_number, external_source, external_id, metadata)
SELECT
    ('00000000-0000-4000-8000-1' || lpad(to_hex(n), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    'Test Family ' || lpad(n::text, 4, '0'),
    'residential',
    'active',
    n,
    'local_representative_seed',
    'seed_customer_' || lpad(n::text, 4, '0'),
    jsonb_build_object('seed', 'local_representative_seed')
FROM generate_series(1, 1200) AS n
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, status_key = EXCLUDED.status_key, updated_at = now();

-- Guardians (persons). `full_name` is written by trg_set_person_full_name.
INSERT INTO public.persons (id, org_id, first_name, last_name, email, phone, date_of_birth, status_key, person_number, external_source, external_id, metadata)
SELECT
    ('00000000-0000-4000-8000-2' || lpad(to_hex(p), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    (ARRAY['Avery','Blair','Casey','Dakota','Emerson','Finley','Gray','Harper','Indigo','Jordan','Kai','Logan'])[((p - 1) % 12) + 1],
    'Testfamily-' || lpad((CASE WHEN p <= 1200 THEN p ELSE p - 1200 END)::text, 4, '0'),
    'qa+guardian' || p || '@example.invalid',
    '+1555' || lpad(p::text, 7, '0'),
    (DATE '1985-01-01' + ((p * 37) % 5000))::date,
    'active',
    p,
    'local_representative_seed',
    'seed_person_' || lpad(p::text, 4, '0'),
    jsonb_build_object('seed', 'local_representative_seed')
FROM generate_series(1, 1800) AS p
ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
    email = EXCLUDED.email, phone = EXCLUDED.phone, updated_at = now();

-- Household <-> person membership. role_type resolves against
-- customer_person_role_types (seeded by the replayed control plane).
INSERT INTO public.customer_persons (id, org_id, customer_id, person_id, role_type, is_primary, status, start_date, metadata)
SELECT
    ('00000000-0000-4000-8000-5' || lpad(to_hex(p), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    ('00000000-0000-4000-8000-1' || lpad(to_hex(CASE WHEN p <= 1200 THEN p ELSE p - 1200 END), 11, '0'))::uuid,
    ('00000000-0000-4000-8000-2' || lpad(to_hex(p), 11, '0'))::uuid,
    CASE WHEN p <= 1200 THEN 'parent' ELSE 'guardian' END,
    (p <= 1200),
    'active',
    DATE '2026-01-01',
    jsonb_build_object('seed', 'local_representative_seed')
FROM generate_series(1, 1800) AS p
ON CONFLICT (org_id, customer_id, person_id, role_type) DO NOTHING;

-- Children. In this schema a child IS a `customer_members` row (the childcare
-- industry label for `customer_members` is "Child"/"Children"); there is no
-- separate children table. `person_id` is left NULL — children here are member
-- records, not persons.
INSERT INTO public.customer_members (id, org_id, customer_id, display_name, relationship, first_name, last_name, dob, is_active, status_key, external_source, external_id, metadata)
SELECT
    ('00000000-0000-4000-8000-3' || lpad(to_hex(m), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    ('00000000-0000-4000-8000-1' || lpad(to_hex(CASE WHEN m <= 1200 THEN m ELSE m - 1200 END), 11, '0'))::uuid,
    (ARRAY['Robin','Sky','Tatum','Quinn','Reese','Sage','Rowan','Marlow'])[((m - 1) % 8) + 1]
        || ' Testfamily-' || lpad((CASE WHEN m <= 1200 THEN m ELSE m - 1200 END)::text, 4, '0'),
    'child',
    (ARRAY['Robin','Sky','Tatum','Quinn','Reese','Sage','Rowan','Marlow'])[((m - 1) % 8) + 1],
    'Testfamily-' || lpad((CASE WHEN m <= 1200 THEN m ELSE m - 1200 END)::text, 4, '0'),
    (DATE '2022-01-01' + ((m * 13) % 1400))::date,
    true,
    'active',
    'local_representative_seed',
    'seed_child_' || lpad(m::text, 4, '0'),
    jsonb_build_object('seed', 'local_representative_seed')
FROM generate_series(1, 1500) AS m
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name, dob = EXCLUDED.dob, is_active = true, updated_at = now();

-- Guardian <-> child relationship (person_child_relationships).
INSERT INTO public.person_child_relationships (id, org_id, customer_id, customer_member_id, person_id, relationship_type, priority, status, metadata)
SELECT
    ('00000000-0000-4000-8000-8' || lpad(to_hex(m), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    ('00000000-0000-4000-8000-1' || lpad(to_hex(CASE WHEN m <= 1200 THEN m ELSE m - 1200 END), 11, '0'))::uuid,
    ('00000000-0000-4000-8000-3' || lpad(to_hex(m), 11, '0'))::uuid,
    ('00000000-0000-4000-8000-2' || lpad(to_hex(CASE WHEN m <= 1200 THEN m ELSE m - 1200 END), 11, '0'))::uuid,
    'parent',
    1,
    'active',
    jsonb_build_object('seed', 'local_representative_seed')
FROM generate_series(1, 1500) AS m
ON CONFLICT (id) DO NOTHING;

\echo '== Section 8: opportunities (queue subjects) =='
-- 3,000 rows. Post-S4 status collapse
-- (20260711000100_enrollment_status_collapse_and_stage_key.sql):
--   opportunities.status_key ∈ {open, closed}   (durable truth)
--   opportunities.stage_key  ∈ {lead, tour, decision, closed, …}  (process state)
--
-- Distribution (n = 1..3000):
--   n ∈ [1,150]      -> WU new_leads,          open   / stage lead      <- the New Leads queue
--   n ∈ [151,2400]   -> WU new_leads,          closed / stage closed    <- aged-out intake history
--   n ∈ [2401,2900]  -> WU enrollment_pipeline, open  / stage tour|decision|waitlist|enrolling|enrolled
--   n ∈ [2901,3000]  -> WU tours,              open   / stage tour
--
-- Why this shape exposes query plans rather than hiding them: the New Leads work
-- unit holds 2,400 rows but its `new_leads` lane admits only the 150 open ones,
-- so (org_id, work_unit_id) selects a large set that the status_key predicate
-- must then narrow — the real production shape, where an intake unit accumulates
-- closed history. A uniformly small unit would let any plan look fast.
INSERT INTO public.opportunities (
    id, org_id, customer_id, primary_person_id, location_id, work_unit_id,
    name, title, status_key, stage_key, close_reason_key, source,
    opportunity_number, external_source, external_id, created_at, updated_at, metadata
)
SELECT
    ('00000000-0000-4000-8000-4' || lpad(to_hex(n), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    ('00000000-0000-4000-8000-1' || lpad(to_hex(((n - 1) % 1200) + 1), 11, '0'))::uuid,
    ('00000000-0000-4000-8000-2' || lpad(to_hex(((n - 1) % 1200) + 1), 11, '0'))::uuid,
    CASE WHEN n % 2 = 0
         THEN '00000000-0000-4000-8000-000000000010'::uuid
         ELSE '00000000-0000-4000-8000-000000000011'::uuid END,
    CASE
        WHEN n <= 2400 THEN '00000000-0000-4000-8000-000000000030'::uuid
        WHEN n <= 2900 THEN '00000000-0000-4000-8000-000000000031'::uuid
        ELSE '00000000-0000-4000-8000-000000000032'::uuid
    END,
    'Inquiry ' || lpad(n::text, 4, '0') || ' — Test Family ' || lpad((((n - 1) % 1200) + 1)::text, 4, '0'),
    'Inquiry ' || lpad(n::text, 4, '0') || ' — Test Family ' || lpad((((n - 1) % 1200) + 1)::text, 4, '0'),
    CASE WHEN n BETWEEN 151 AND 2400 THEN 'closed' ELSE 'open' END,
    CASE
        WHEN n <= 150  THEN 'lead'
        WHEN n <= 2400 THEN 'closed'
        WHEN n <= 2900 THEN (ARRAY['tour','decision','waitlist','enrolling','enrolled'])[((n - 2401) % 5) + 1]
        ELSE 'tour'
    END,
    CASE WHEN n BETWEEN 151 AND 2400
         THEN (ARRAY['lost','not_a_fit','aged_out','withdrawn'])[((n - 151) % 4) + 1]
         ELSE NULL END,
    (ARRAY['website','phone','walk_in','referral','corporate','other'])[((n - 1) % 6) + 1],
    n,
    'local_representative_seed',
    'seed_opportunity_' || lpad(n::text, 4, '0'),
    (TIMESTAMPTZ '2026-01-05 09:00:00+00' + ((n % 180) || ' days')::interval),
    (TIMESTAMPTZ '2026-07-01 09:00:00+00' + ((n % 15) || ' days')::interval + ((n % 60) || ' minutes')::interval),
    jsonb_build_object(
        'seed', 'local_representative_seed',
        'program_type',  (ARRAY['infant','toddler','preschool','pre_k','school_age'])[((n - 1) % 5) + 1],
        'schedule_type', (ARRAY['full_time','part_time','drop_in'])[((n - 1) % 3) + 1],
        'inquiry_source',(ARRAY['website','phone','walk_in','referral','corporate','other'])[((n - 1) % 6) + 1],
        'desired_start_date', to_char(DATE '2026-09-01' + ((n % 90)), 'YYYY-MM-DD'),
        'tour_date', CASE
            WHEN (n > 2400) OR (n <= 150 AND n % 5 = 0)
            THEN to_char(DATE '2026-07-20' + ((n % 21)), 'YYYY-MM-DD')
            ELSE NULL END
    )
FROM generate_series(1, 3000) AS n
ON CONFLICT (id) DO UPDATE SET
    work_unit_id = EXCLUDED.work_unit_id, status_key = EXCLUDED.status_key,
    stage_key = EXCLUDED.stage_key, close_reason_key = EXCLUDED.close_reason_key,
    name = EXCLUDED.name, title = EXCLUDED.title, location_id = EXCLUDED.location_id,
    metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at;

\echo '== Section 9: opportunity <-> person / child relationships (queue row enrichment) =='
-- Queue row enrichment (web/lib/queues/queueRowEnrichmentPlan.ts) batches
-- persons / customers / customer_members / locations / ocm_desired_start /
-- open_tasks for the visible rows. These two tables supply the person + child
-- sides of that projection.

INSERT INTO public.opportunity_persons (id, org_id, opportunity_id, person_id, role_type, metadata)
SELECT
    ('00000000-0000-4000-8000-6' || lpad(to_hex(n), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    ('00000000-0000-4000-8000-4' || lpad(to_hex(n), 11, '0'))::uuid,
    ('00000000-0000-4000-8000-2' || lpad(to_hex(((n - 1) % 1200) + 1), 11, '0'))::uuid,
    'parent_guardian',
    jsonb_build_object('seed', 'local_representative_seed', 'is_primary', true)
FROM generate_series(1, 3000) AS n
ON CONFLICT (opportunity_id, person_id) DO NOTHING;

-- opportunity_customer_members (OCM) — the child participation / enrollment track.
-- outcome_status_key ∈ {null, waitlisted, enrolling, enrolled, withdrawn, not_enrolling};
-- stage_key is null while the child rides the family track pre-decision.
INSERT INTO public.opportunity_customer_members (
    id, org_id, opportunity_id, customer_member_id, schedule_type, fit_status,
    outcome_status_key, stage_key, close_reason_key, start_date, location_id, metadata
)
SELECT
    ('00000000-0000-4000-8000-7' || lpad(to_hex(n), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    ('00000000-0000-4000-8000-4' || lpad(to_hex(n), 11, '0'))::uuid,
    ('00000000-0000-4000-8000-3' || lpad(to_hex(((n - 1) % 1200) + 1), 11, '0'))::uuid,
    (ARRAY['full_time','part_time','drop_in'])[((n - 1) % 3) + 1],
    NULL,
    CASE
        WHEN n <= 150  THEN NULL
        WHEN n <= 2400 THEN 'not_enrolling'
        WHEN n <= 2900 THEN (ARRAY[NULL,NULL,'waitlisted','enrolling','enrolled'])[((n - 2401) % 5) + 1]
        ELSE NULL
    END,
    CASE
        WHEN n > 2400 AND n <= 2900 AND ((n - 2401) % 5) + 1 >= 3
        THEN (ARRAY['waitlist','enrolling','enrolled'])[((n - 2401) % 5) - 1]
        ELSE NULL
    END,
    CASE WHEN n BETWEEN 151 AND 2400 THEN 'not_a_fit' ELSE NULL END,
    (DATE '2026-09-01' + ((n % 90)))::date,
    CASE WHEN n % 2 = 0
         THEN '00000000-0000-4000-8000-000000000010'::uuid
         ELSE '00000000-0000-4000-8000-000000000011'::uuid END,
    jsonb_build_object('seed', 'local_representative_seed')
FROM generate_series(1, 3000) AS n
ON CONFLICT (org_id, opportunity_id, customer_member_id) DO UPDATE SET
    outcome_status_key = EXCLUDED.outcome_status_key, stage_key = EXCLUDED.stage_key,
    start_date = EXCLUDED.start_date, updated_at = now();

\echo '== Section 10: operational_tasks (Focus Panel "Current Work") =='
-- The Focus Panel Current Work region resolves stage work from the builder
-- stage's `stage_operating_plan_v1` (present on every stage — Section 4) plus
-- the opportunity's open `operational_tasks`
-- (web/lib/lifecycle/projectStageWorkRuntime.ts, read via
--  resolveOpportunityStageWorkSlice). CHECK constraint restricts entity_type to
-- 'opportunities'. Each of the 150 New-Leads subjects gets one open task, so the
-- Current Work card always has current business state + a primary action.
INSERT INTO public.operational_tasks (
    id, org_id, entity_type, entity_id, assigned_to_user_id, created_by,
    title, description, due_at, status, source, metadata
)
SELECT
    ('00000000-0000-4000-8000-9' || lpad(to_hex(n), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    'opportunities',
    ('00000000-0000-4000-8000-4' || lpad(to_hex(n), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    'Call Test Family ' || lpad((((n - 1) % 1200) + 1)::text, 4, '0') || ' about their inquiry',
    'First-touch outreach for the new family inquiry.',
    (TIMESTAMPTZ '2026-07-17 17:00:00+00' + ((n % 5) || ' days')::interval),
    'open',
    'manual',
    jsonb_build_object(
        'seed', 'local_representative_seed',
        'stage_key', 'lead',
        'work_template_key', 'first_contact'
    )
FROM generate_series(1, 150) AS n
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title, due_at = EXCLUDED.due_at, status = EXCLUDED.status,
    metadata = EXCLUDED.metadata, updated_at = now();

-- A few tour-stage tasks so the pipeline/tours units also carry current work.
INSERT INTO public.operational_tasks (
    id, org_id, entity_type, entity_id, assigned_to_user_id, created_by,
    title, description, due_at, status, source, metadata
)
SELECT
    ('00000000-0000-4000-8000-a' || lpad(to_hex(n), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid,
    'opportunities',
    ('00000000-0000-4000-8000-4' || lpad(to_hex(2900 + n), 11, '0'))::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    'Confirm tour for Test Family ' || lpad((((2900 + n - 1) % 1200) + 1)::text, 4, '0'),
    'Confirm the scheduled visit and prepare the room walk-through.',
    (TIMESTAMPTZ '2026-07-18 16:00:00+00' + ((n % 7) || ' days')::interval),
    'open',
    'manual',
    jsonb_build_object(
        'seed', 'local_representative_seed',
        'stage_key', 'tour',
        'work_template_key', 'confirm_tour'
    )
FROM generate_series(1, 100) AS n
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title, due_at = EXCLUDED.due_at, status = EXCLUDED.status,
    metadata = EXCLUDED.metadata, updated_at = now();

\echo '== Section 11: planner statistics =='
-- Without ANALYZE the planner has no stats for the freshly inserted rows and
-- will mis-plan (defeating the point of a representative-volume seed).
ANALYZE public.opportunities;
ANALYZE public.opportunity_customer_members;
ANALYZE public.opportunity_persons;
ANALYZE public.customers;
ANALYZE public.persons;
ANALYZE public.customer_members;
ANALYZE public.customer_persons;
ANALYZE public.operational_tasks;

\echo '== Seed complete =='
