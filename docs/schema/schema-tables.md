# Schema — tables and views

**Status:** Generated reference (staging export). **Do not edit by hand.**

**Regenerate:** `npm run export:supabase-schema` then `node scripts/generate-schema-docs.mjs`

**Generated:** 2026-07-12

## Summary

| Kind | Count |
|------|------:|
| Base tables (`public`) | 201 |
| Views (`public`) | 7 |
| Tables with RLS enabled | 201 |

## Base tables

| Table | RLS | Forced RLS | Policies |
|-------|-----|------------|----------|
| `access_methods` | true | false | 1 |
| `action_definitions` | true | false | 2 |
| `action_links` | true | false | 5 |
| `action_placements` | true | false | 2 |
| `activity_log` | true | false | 1 |
| `addon_frequencies` | true | false | 1 |
| `addon_types` | true | false | 1 |
| `agent_v0_apply_audit` | true | false | 2 |
| `agent_v0_proposals` | true | false | 2 |
| `agent_v1_record_layout_apply_audit` | true | false | 2 |
| `agent_v1_record_layout_proposals` | true | false | 2 |
| `agent_v2_field_visibility_apply_audit` | true | false | 2 |
| `agent_v2_field_visibility_proposals` | true | false | 2 |
| `announcement_deliveries` | true | false | 2 |
| `announcement_recipients` | true | false | 2 |
| `announcement_targets` | true | false | 2 |
| `announcements` | true | false | 2 |
| `app_users` | true | false | 2 |
| `assignment_statuses` | true | false | 1 |
| `assignments` | true | false | 1 |
| `business_process_layout_assignments` | true | false | 2 |
| `campaigns` | true | false | 1 |
| `charge_line_items` | true | false | 4 |
| `charges` | true | false | 5 |
| `child_attendance_events` | true | false | 3 |
| `child_enrollment_agreements` | true | false | 3 |
| `child_placements` | true | false | 3 |
| `childcare_capacity_rules` | true | false | 5 |
| `childcare_operating_windows` | true | false | 5 |
| `childcare_rate_plans` | true | false | 5 |
| `childcare_rate_rules` | true | false | 5 |
| `childcare_ratio_rule_tiers` | true | false | 5 |
| `childcare_ratio_rules` | true | false | 5 |
| `childcare_schedule_rules` | true | false | 5 |
| `cleaning_job_addons` | true | false | 1 |
| `cleaning_job_details` | true | false | 1 |
| `cleaning_service_types` | true | false | 1 |
| `communication_delivery_events` | true | false | 2 |
| `communication_message_reads` | true | false | 2 |
| `communication_message_recipients` | true | false | 2 |
| `communication_messages` | true | false | 2 |
| `communication_preference_events` | true | false | 2 |
| `communication_preferences` | true | false | 2 |
| `communication_provider_bindings` | true | false | 2 |
| `communication_scheduled_sends` | true | false | 4 |
| `communication_snippets` | true | false | 2 |
| `communication_template_versions` | true | false | 2 |
| `communication_templates` | true | false | 2 |
| `communication_threads` | true | false | 2 |
| `config_layout_assist_proposals` | true | false | 4 |
| `contact_tags` | true | false | 1 |
| `contacts` | true | false | 4 |
| `conversation_assignment_events` | true | false | 2 |
| `customer_member_contact_roles` | true | true | 3 |
| `customer_member_contacts` | true | true | 3 |
| `customer_member_relationship_types` | true | true | 6 |
| `customer_members` | true | true | 3 |
| `customer_payment_methods` | true | true | 0 |
| `customer_person_role_types` | true | false | 4 |
| `customer_persons` | true | false | 4 |
| `customer_subscriptions` | true | false | 5 |
| `customer_tags` | true | false | 1 |
| `customer_vertical_job_counters` | true | false | 0 |
| `customers` | true | false | 1 |
| `departments` | true | true | 5 |
| `discount_applications` | true | false | 2 |
| `discount_codes` | true | false | 1 |
| `discount_commitments` | true | false | 2 |
| `discount_program_benefits` | true | false | 2 |
| `discount_program_commitment_rules` | true | false | 2 |
| `discount_program_qualifiers` | true | false | 2 |
| `discount_programs` | true | false | 2 |
| `discount_redemptions` | true | false | 1 |
| `discounts` | true | false | 1 |
| `document_field_definitions` | true | false | 4 |
| `document_field_values` | true | false | 4 |
| `document_versions` | true | false | 4 |
| `documents` | true | false | 4 |
| `entity_labels` | true | true | 4 |
| `entity_layouts` | true | false | 4 |
| `external_mappings` | true | false | 1 |
| `field_definitions` | true | false | 4 |
| `field_section_definitions` | true | false | 4 |
| `field_values` | true | false | 4 |
| `form_definition_versions` | true | false | 5 |
| `form_definitions` | true | false | 5 |
| `form_packet_definitions` | true | false | 5 |
| `form_packet_items` | true | false | 5 |
| `form_packet_session_items` | true | false | 5 |
| `form_packet_sessions` | true | false | 5 |
| `form_public_links` | true | false | 5 |
| `form_submission_documents` | true | false | 5 |
| `form_submission_signatures` | true | false | 5 |
| `form_submissions` | true | false | 5 |
| `gl_account_mappings` | true | false | 5 |
| `gl_accounts` | true | false | 5 |
| `gl_journal_entries` | true | false | 5 |
| `gl_journal_lines` | true | false | 6 |
| `home_types` | true | false | 1 |
| `industries` | true | true | 1 |
| `industry_default_entity_labels` | true | true | 1 |
| `job_line_items` | true | false | 5 |
| `job_pricing_snapshots` | true | false | 5 |
| `job_statuses` | true | false | 1 |
| `job_tags` | true | false | 1 |
| `jobs` | true | false | 1 |
| `ledger_transactions` | true | false | 6 |
| `location_program_categories` | true | false | 5 |
| `location_tags` | true | false | 1 |
| `location_types` | true | true | 2 |
| `locations` | true | false | 1 |
| `messages` | true | false | 1 |
| `messages_outbox` | true | true | 4 |
| `metric_definitions` | true | false | 2 |
| `metric_placements` | true | false | 2 |
| `metric_platform_snapshots` | true | false | 2 |
| `metric_rollups` | true | false | 2 |
| `metric_snapshots` | true | false | 2 |
| `metric_visualizations` | true | false | 2 |
| `operational_tasks` | true | false | 4 |
| `opportunities` | true | false | 1 |
| `opportunity_customer_members` | true | false | 1 |
| `opportunity_persons` | true | false | 1 |
| `opportunity_tags` | true | false | 1 |
| `option_set_items` | true | false | 4 |
| `option_sets` | true | false | 4 |
| `org_settings` | true | false | 4 |
| `orgs` | true | false | 0 |
| `payment_allocations` | true | false | 4 |
| `payment_statuses` | true | false | 1 |
| `payments` | true | false | 5 |
| `permission_definitions` | true | true | 4 |
| `permission_keys` | true | false | 2 |
| `permissions` | true | true | 2 |
| `person_locations` | true | false | 4 |
| `person_relationship_type_settings` | true | false | 4 |
| `person_relationships` | true | false | 4 |
| `persons` | true | false | 4 |
| `pipeline_stages` | true | false | 1 |
| `pipelines` | true | false | 1 |
| `placement_candidates` | true | false | 3 |
| `placement_link_group_members` | true | false | 3 |
| `placement_link_groups` | true | false | 3 |
| `placement_overrides` | true | false | 3 |
| `pricing_addons` | true | false | 6 |
| `pricing_dimension_values` | true | false | 4 |
| `pricing_dimensions` | true | false | 4 |
| `pricing_first_clean_prices` | true | false | 6 |
| `pricing_frequencies` | true | false | 6 |
| `pricing_matrix` | true | false | 4 |
| `pricing_modes` | true | false | 4 |
| `pricing_recurring_prices` | true | false | 6 |
| `pricing_services` | true | false | 6 |
| `pricing_square_footage_tiers` | true | false | 6 |
| `processing_case_sources` | true | false | 4 |
| `processing_cases` | true | false | 4 |
| `quotes` | true | false | 1 |
| `record_actions` | true | false | 2 |
| `record_drawer_layouts` | true | false | 5 |
| `record_layouts` | true | false | 2 |
| `record_overview_layouts` | true | false | 5 |
| `recurrence_plans` | true | false | 1 |
| `role_definitions` | true | false | 3 |
| `role_permission_grants` | true | true | 3 |
| `schedule_assignments` | true | false | 3 |
| `schedule_patterns` | true | false | 5 |
| `schedule_statuses` | true | false | 1 |
| `schedule_tags` | true | false | 1 |
| `schedules` | true | false | 1 |
| `service_offerings` | true | false | 4 |
| `service_plan_templates` | true | false | 4 |
| `service_price_dimensions` | true | false | 4 |
| `service_pricing_rules` | true | false | 4 |
| `sla_events` | true | false | 2 |
| `sqft_bands` | true | false | 1 |
| `status_definitions` | true | true | 3 |
| `status_transition_rules` | true | false | 2 |
| `tags` | true | false | 1 |
| `task_assist_proposals` | true | false | 4 |
| `tour_availability_rules` | true | false | 5 |
| `tour_bookings` | true | false | 5 |
| `tour_public_booking_links` | true | false | 5 |
| `user_access_profiles` | true | false | 1 |
| `user_department_access` | true | false | 1 |
| `user_profiles` | true | false | 3 |
| `user_roles` | true | false | 2 |
| `user_site_access` | true | false | 1 |
| `vendor_statuses` | true | false | 1 |
| `vendor_tags` | true | false | 1 |
| `vendor_users` | true | false | 1 |
| `vendor_verticals` | true | false | 2 |
| `vendors` | true | false | 5 |
| `verticals` | true | false | 1 |
| `work_units` | true | true | 5 |
| `workflow_action_runs` | true | true | 4 |
| `workflow_actions` | true | false | 1 |
| `workflow_conditions` | true | false | 1 |
| `workflow_events` | true | true | 2 |
| `workflow_runs` | true | true | 2 |
| `workflows` | true | false | 1 |
| `workspace_kpi_placement` | true | false | 2 |

## Views

| View | Definition (truncated) |
|------|------------------------|
| ` '[]'::jsonb) AS benefits` |  |
| ` '[]'::jsonb) AS qualifiers` |  |
| ` x.id` |  |
| ` x.id` |  'qualifier_type' |
| ` x.id` |  'benefit_type' |
| `discount_programs_admin_v` |  SELECT dp.id, |
| `workflow_run_events` |  SELECT r.id AS run_id, |

## Domain groupings (conceptual)

These groupings are documentation-only — not separate schemas.

- **Identity & access:** `persons`, `customer_persons`, `contacts`, `customers`, `user_roles`, `user_profiles`, `role_definitions`, `role_permission_grants`, `user_access_profiles`, `user_department_access`, `user_site_access`
- **Business processes & workspace:** `work_units`, `departments`, `locations`, `orgs`, `org_settings`
- **CRM & enrollment:** `opportunities`, `opportunity_customer_members`, `tour_bookings`
- **Events & workflows:** `workflow_events`, `workflows`, `workflow_runs`, `action_definitions`, `action_links`, `action_placements`
- **Communications:** `communication_threads`, `communication_messages`, `communication_provider_bindings`, `communication_message_reads`, `communication_scheduled_sends`, `messages`, `messages_outbox`
- **Forms & documents:** `form_definitions`, `form_submissions`
- **Scheduling & jobs:** `jobs`, `schedules`

## Related docs

- Column detail: `schema-columns.md`
- Constraints: `schema-constraints.md`
- Indexes: `schema-indexes.md`
- RLS: `schema-policies-and-security.md`
- Entity model (conceptual): `../platform/core/entity-model.md`
