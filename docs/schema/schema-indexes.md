# Schema — indexes

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** 2026-06-28 · **Index count:** 867

| Table | Index | Unique | Definition |
|-------|-------|--------|------------|
| `access_methods` | `access_methods_key_key` | true | CREATE UNIQUE INDEX access_methods_key_key ON access_methods USING btree (key) |
| `access_methods` | `access_methods_pkey` | true | CREATE UNIQUE INDEX access_methods_pkey ON access_methods USING btree (id) |
| `action_definitions` | `action_definitions_pkey` | true | CREATE UNIQUE INDEX action_definitions_pkey ON action_definitions USING btree (id) |
| `action_definitions` | `idx_action_definitions_entity_active` | false | CREATE INDEX idx_action_definitions_entity_active ON action_definitions USING btree (entity_type) WHERE is_active = true |
| `action_definitions` | `idx_action_definitions_key_active_global` | false | CREATE INDEX idx_action_definitions_key_active_global ON action_definitions USING btree (key, is_active) WHERE is_active |
| `action_definitions` | `idx_action_definitions_org_active` | false | CREATE INDEX idx_action_definitions_org_active ON action_definitions USING btree (org_id) WHERE is_active = true AND org |
| `action_definitions` | `idx_action_definitions_org_key_active` | false | CREATE INDEX idx_action_definitions_org_key_active ON action_definitions USING btree (org_id, key, is_active) WHERE is_a |
| `action_definitions` | `ux_action_definitions_global_key` | true | CREATE UNIQUE INDEX ux_action_definitions_global_key ON action_definitions USING btree (key) WHERE org_id IS NULL |
| `action_definitions` | `ux_action_definitions_org_key` | true | CREATE UNIQUE INDEX ux_action_definitions_org_key ON action_definitions USING btree (org_id, key) WHERE org_id IS NOT NU |
| `action_links` | `action_links_entity_idx` | false | CREATE INDEX action_links_entity_idx ON action_links USING btree (entity_type, entity_id) |
| `action_links` | `action_links_pkey` | true | CREATE UNIQUE INDEX action_links_pkey ON action_links USING btree (id) |
| `action_links` | `action_links_short_code_key` | true | CREATE UNIQUE INDEX action_links_short_code_key ON action_links USING btree (short_code) WHERE short_code IS NOT NULL |
| `action_links` | `action_links_short_code_uidx` | true | CREATE UNIQUE INDEX action_links_short_code_uidx ON action_links USING btree (short_code) WHERE short_code IS NOT NULL |
| `action_links` | `action_links_token_key` | true | CREATE UNIQUE INDEX action_links_token_key ON action_links USING btree (token) |
| `action_placements` | `action_placements_pkey` | true | CREATE UNIQUE INDEX action_placements_pkey ON action_placements USING btree (id) |
| `action_placements` | `idx_action_placements_def` | false | CREATE INDEX idx_action_placements_def ON action_placements USING btree (action_definition_id) |
| `action_placements` | `idx_action_placements_org` | false | CREATE INDEX idx_action_placements_org ON action_placements USING btree (org_id) WHERE org_id IS NOT NULL |
| `action_placements` | `idx_action_placements_record_section_scope` | false | CREATE INDEX idx_action_placements_record_section_scope ON action_placements USING btree (surface, entity_type, section_ |
| `action_placements` | `idx_action_placements_surface_active` | false | CREATE INDEX idx_action_placements_surface_active ON action_placements USING btree (surface, is_active) WHERE is_active  |
| `action_placements` | `idx_action_placements_surface_org_active` | false | CREATE INDEX idx_action_placements_surface_org_active ON action_placements USING btree (surface, org_id, is_active) WHER |
| `action_placements` | `idx_action_placements_work_unit` | false | CREATE INDEX idx_action_placements_work_unit ON action_placements USING btree (work_unit_id) WHERE work_unit_id IS NOT N |
| `action_placements` | `idx_action_placements_work_unit_surface_active` | false | CREATE INDEX idx_action_placements_work_unit_surface_active ON action_placements USING btree (work_unit_id, surface, is_ |
| `activity_log` | `activity_log_pkey` | true | CREATE UNIQUE INDEX activity_log_pkey ON activity_log USING btree (id) |
| `activity_log` | `idx_activity_entity` | false | CREATE INDEX idx_activity_entity ON activity_log USING btree (entity_type, entity_id) |
| `addon_frequencies` | `addon_frequencies_key_key` | true | CREATE UNIQUE INDEX addon_frequencies_key_key ON addon_frequencies USING btree (key) |
| `addon_frequencies` | `addon_frequencies_pkey` | true | CREATE UNIQUE INDEX addon_frequencies_pkey ON addon_frequencies USING btree (id) |
| `addon_types` | `addon_types_key_key` | true | CREATE UNIQUE INDEX addon_types_key_key ON addon_types USING btree (key) |
| `addon_types` | `addon_types_pkey` | true | CREATE UNIQUE INDEX addon_types_pkey ON addon_types USING btree (id) |
| `addon_types` | `idx_addon_types_vertical_id` | false | CREATE INDEX idx_addon_types_vertical_id ON addon_types USING btree (vertical_id) |
| `agent_v0_apply_audit` | `agent_v0_apply_audit_pkey` | true | CREATE UNIQUE INDEX agent_v0_apply_audit_pkey ON agent_v0_apply_audit USING btree (id) |
| `agent_v0_apply_audit` | `idx_agent_v0_apply_audit_org_id` | false | CREATE INDEX idx_agent_v0_apply_audit_org_id ON agent_v0_apply_audit USING btree (org_id) |
| `agent_v0_apply_audit` | `idx_agent_v0_apply_audit_proposal` | false | CREATE INDEX idx_agent_v0_apply_audit_proposal ON agent_v0_apply_audit USING btree (proposal_id) |
| `agent_v0_apply_audit` | `ux_agent_v0_apply_audit_result_id` | true | CREATE UNIQUE INDEX ux_agent_v0_apply_audit_result_id ON agent_v0_apply_audit USING btree (result_id) |
| `agent_v0_proposals` | `agent_v0_proposals_pkey` | true | CREATE UNIQUE INDEX agent_v0_proposals_pkey ON agent_v0_proposals USING btree (id) |
| `agent_v0_proposals` | `idx_agent_v0_proposals_correlation` | false | CREATE INDEX idx_agent_v0_proposals_correlation ON agent_v0_proposals USING btree (correlation_id) |
| `agent_v0_proposals` | `idx_agent_v0_proposals_org_id` | false | CREATE INDEX idx_agent_v0_proposals_org_id ON agent_v0_proposals USING btree (org_id) |
| `agent_v0_proposals` | `ux_agent_v0_proposals_proposal_id` | true | CREATE UNIQUE INDEX ux_agent_v0_proposals_proposal_id ON agent_v0_proposals USING btree (proposal_id) |
| `agent_v1_record_layout_apply_audit` | `agent_v1_record_layout_apply_audit_pkey` | true | CREATE UNIQUE INDEX agent_v1_record_layout_apply_audit_pkey ON agent_v1_record_layout_apply_audit USING btree (id) |
| `agent_v1_record_layout_apply_audit` | `idx_agent_v1_rl_apply_org_id` | false | CREATE INDEX idx_agent_v1_rl_apply_org_id ON agent_v1_record_layout_apply_audit USING btree (org_id) |
| `agent_v1_record_layout_apply_audit` | `idx_agent_v1_rl_apply_proposal` | false | CREATE INDEX idx_agent_v1_rl_apply_proposal ON agent_v1_record_layout_apply_audit USING btree (proposal_id) |
| `agent_v1_record_layout_apply_audit` | `ux_agent_v1_rl_apply_result_id` | true | CREATE UNIQUE INDEX ux_agent_v1_rl_apply_result_id ON agent_v1_record_layout_apply_audit USING btree (result_id) |
| `agent_v1_record_layout_proposals` | `agent_v1_record_layout_proposals_pkey` | true | CREATE UNIQUE INDEX agent_v1_record_layout_proposals_pkey ON agent_v1_record_layout_proposals USING btree (id) |
| `agent_v1_record_layout_proposals` | `idx_agent_v1_rl_proposals_correlation` | false | CREATE INDEX idx_agent_v1_rl_proposals_correlation ON agent_v1_record_layout_proposals USING btree (correlation_id) |
| `agent_v1_record_layout_proposals` | `idx_agent_v1_rl_proposals_org_id` | false | CREATE INDEX idx_agent_v1_rl_proposals_org_id ON agent_v1_record_layout_proposals USING btree (org_id) |
| `agent_v1_record_layout_proposals` | `ux_agent_v1_rl_proposals_proposal_id` | true | CREATE UNIQUE INDEX ux_agent_v1_rl_proposals_proposal_id ON agent_v1_record_layout_proposals USING btree (proposal_id) |
| `agent_v2_field_visibility_apply_audit` | `agent_v2_field_visibility_apply_audit_pkey` | true | CREATE UNIQUE INDEX agent_v2_field_visibility_apply_audit_pkey ON agent_v2_field_visibility_apply_audit USING btree (id) |
| `agent_v2_field_visibility_apply_audit` | `idx_agent_v2_fv_apply_org_id` | false | CREATE INDEX idx_agent_v2_fv_apply_org_id ON agent_v2_field_visibility_apply_audit USING btree (org_id) |
| `agent_v2_field_visibility_apply_audit` | `idx_agent_v2_fv_apply_proposal` | false | CREATE INDEX idx_agent_v2_fv_apply_proposal ON agent_v2_field_visibility_apply_audit USING btree (proposal_id) |
| `agent_v2_field_visibility_apply_audit` | `ux_agent_v2_fv_apply_result_id` | true | CREATE UNIQUE INDEX ux_agent_v2_fv_apply_result_id ON agent_v2_field_visibility_apply_audit USING btree (result_id) |
| `agent_v2_field_visibility_proposals` | `agent_v2_field_visibility_proposals_pkey` | true | CREATE UNIQUE INDEX agent_v2_field_visibility_proposals_pkey ON agent_v2_field_visibility_proposals USING btree (id) |
| `agent_v2_field_visibility_proposals` | `idx_agent_v2_fv_proposals_correlation` | false | CREATE INDEX idx_agent_v2_fv_proposals_correlation ON agent_v2_field_visibility_proposals USING btree (correlation_id) |
| `agent_v2_field_visibility_proposals` | `idx_agent_v2_fv_proposals_org_id` | false | CREATE INDEX idx_agent_v2_fv_proposals_org_id ON agent_v2_field_visibility_proposals USING btree (org_id) |
| `agent_v2_field_visibility_proposals` | `ux_agent_v2_fv_proposals_proposal_id` | true | CREATE UNIQUE INDEX ux_agent_v2_fv_proposals_proposal_id ON agent_v2_field_visibility_proposals USING btree (proposal_id |
| `announcement_deliveries` | `announcement_deliveries_pkey` | true | CREATE UNIQUE INDEX announcement_deliveries_pkey ON announcement_deliveries USING btree (id) |
| `announcement_deliveries` | `idx_announcement_deliveries_announcement` | false | CREATE INDEX idx_announcement_deliveries_announcement ON announcement_deliveries USING btree (announcement_id) |
| `announcement_deliveries` | `idx_announcement_deliveries_org_person` | false | CREATE INDEX idx_announcement_deliveries_org_person ON announcement_deliveries USING btree (org_id, person_id, created_a |
| `announcement_recipients` | `announcement_recipients_pkey` | true | CREATE UNIQUE INDEX announcement_recipients_pkey ON announcement_recipients USING btree (id) |
| `announcement_recipients` | `announcement_recipients_uq` | true | CREATE UNIQUE INDEX announcement_recipients_uq ON announcement_recipients USING btree (announcement_id, person_id, chann |
| `announcement_recipients` | `idx_announcement_recipients_org_announcement_status` | false | CREATE INDEX idx_announcement_recipients_org_announcement_status ON announcement_recipients USING btree (org_id, announc |
| `announcement_targets` | `announcement_targets_pkey` | true | CREATE UNIQUE INDEX announcement_targets_pkey ON announcement_targets USING btree (id) |
| `announcement_targets` | `idx_announcement_targets_announcement` | false | CREATE INDEX idx_announcement_targets_announcement ON announcement_targets USING btree (announcement_id) |
| `announcement_targets` | `idx_announcement_targets_org_announcement` | false | CREATE INDEX idx_announcement_targets_org_announcement ON announcement_targets USING btree (org_id, announcement_id) |
| `announcements` | `announcements_pkey` | true | CREATE UNIQUE INDEX announcements_pkey ON announcements USING btree (id) |
| `announcements` | `idx_announcements_org_status` | false | CREATE INDEX idx_announcements_org_status ON announcements USING btree (org_id, status) |
| `announcements` | `idx_announcements_org_status_scheduled` | false | CREATE INDEX idx_announcements_org_status_scheduled ON announcements USING btree (org_id, status, scheduled_at DESC NULL |
| `announcements` | `idx_announcements_org_status_send_at` | false | CREATE INDEX idx_announcements_org_status_send_at ON announcements USING btree (org_id, status, send_at) |
| `app_users` | `app_users_auth_user_id_key` | true | CREATE UNIQUE INDEX app_users_auth_user_id_key ON app_users USING btree (auth_user_id) |
| `app_users` | `app_users_pkey` | true | CREATE UNIQUE INDEX app_users_pkey ON app_users USING btree (id) |
| `app_users` | `idx_app_users_org_id` | false | CREATE INDEX idx_app_users_org_id ON app_users USING btree (org_id) |
| `assignment_statuses` | `assignment_statuses_key_key` | true | CREATE UNIQUE INDEX assignment_statuses_key_key ON assignment_statuses USING btree (key) |
| `assignment_statuses` | `assignment_statuses_pkey` | true | CREATE UNIQUE INDEX assignment_statuses_pkey ON assignment_statuses USING btree (id) |
| `assignments` | `assignments_pkey` | true | CREATE UNIQUE INDEX assignments_pkey ON assignments USING btree (id) |
| `assignments` | `idx_assignments_job` | false | CREATE INDEX idx_assignments_job ON assignments USING btree (job_id) |
| `assignments` | `idx_assignments_org_id` | false | CREATE INDEX idx_assignments_org_id ON assignments USING btree (org_id) |
| `assignments` | `idx_assignments_schedule` | false | CREATE INDEX idx_assignments_schedule ON assignments USING btree (schedule_id) |
| `assignments` | `idx_assignments_status` | false | CREATE INDEX idx_assignments_status ON assignments USING btree (assignment_status_id) |
| `assignments` | `idx_assignments_status_key` | false | CREATE INDEX idx_assignments_status_key ON assignments USING btree (org_id, status_key) |
| `assignments` | `idx_assignments_vendor` | false | CREATE INDEX idx_assignments_vendor ON assignments USING btree (vendor_id) |
| `business_process_layout_assignments` | `business_process_layout_assignments_pkey` | true | CREATE UNIQUE INDEX business_process_layout_assignments_pkey ON business_process_layout_assignments USING btree (id) |
| `business_process_layout_assignments` | `idx_bp_layout_assignments_org_process_stage` | false | CREATE INDEX idx_bp_layout_assignments_org_process_stage ON business_process_layout_assignments USING btree (org_id, bus |
| `business_process_layout_assignments` | `idx_bp_layout_assignments_org_process_surface` | false | CREATE INDEX idx_bp_layout_assignments_org_process_surface ON business_process_layout_assignments USING btree (org_id, b |
| `campaigns` | `campaigns_pkey` | true | CREATE UNIQUE INDEX campaigns_pkey ON campaigns USING btree (id) |
| `charge_line_items` | `charge_line_items_pkey` | true | CREATE UNIQUE INDEX charge_line_items_pkey ON charge_line_items USING btree (id) |
| `charge_line_items` | `idx_charge_line_items_org_charge` | false | CREATE INDEX idx_charge_line_items_org_charge ON charge_line_items USING btree (org_id, charge_id) |
| `charge_line_items` | `idx_charge_line_items_org_job_line_item_id_partial` | false | CREATE INDEX idx_charge_line_items_org_job_line_item_id_partial ON charge_line_items USING btree (org_id, job_line_item_ |
| `charges` | `charges_pkey` | true | CREATE UNIQUE INDEX charges_pkey ON charges USING btree (id) |
| `charges` | `idx_charges_org_billable_source_partial` | false | CREATE INDEX idx_charges_org_billable_source_partial ON charges USING btree (org_id, billable_source_type, billable_sour |
| `charges` | `idx_charges_org_charge_category_partial` | false | CREATE INDEX idx_charges_org_charge_category_partial ON charges USING btree (org_id, charge_category) WHERE charge_categ |
| `charges` | `idx_charges_org_charge_type` | false | CREATE INDEX idx_charges_org_charge_type ON charges USING btree (org_id, charge_type) |
| `charges` | `idx_charges_org_due_date` | false | CREATE INDEX idx_charges_org_due_date ON charges USING btree (org_id, due_date) |
| `charges` | `idx_charges_org_job` | false | CREATE INDEX idx_charges_org_job ON charges USING btree (org_id, job_id) |
| `charges` | `idx_charges_org_job_status` | false | CREATE INDEX idx_charges_org_job_status ON charges USING btree (org_id, job_id, status) |
| `charges` | `idx_charges_org_schedule_id_partial` | false | CREATE INDEX idx_charges_org_schedule_id_partial ON charges USING btree (org_id, schedule_id) WHERE schedule_id IS NOT N |
| `charges` | `idx_charges_org_source_charge_id_partial` | false | CREATE INDEX idx_charges_org_source_charge_id_partial ON charges USING btree (org_id, source_charge_id) WHERE source_cha |
| `charges` | `idx_charges_org_status` | false | CREATE INDEX idx_charges_org_status ON charges USING btree (org_id, status) |
| `charges` | `idx_charges_org_subscription_id_partial` | false | CREATE INDEX idx_charges_org_subscription_id_partial ON charges USING btree (org_id, subscription_id) WHERE subscription |
| `child_attendance_events` | `child_attendance_events_pkey` | true | CREATE UNIQUE INDEX child_attendance_events_pkey ON child_attendance_events USING btree (id) |
| `child_attendance_events` | `idx_child_attendance_events_corrects` | false | CREATE INDEX idx_child_attendance_events_corrects ON child_attendance_events USING btree (org_id, corrects_event_id) WHE |
| `child_attendance_events` | `idx_child_attendance_events_org_agreement_date` | false | CREATE INDEX idx_child_attendance_events_org_agreement_date ON child_attendance_events USING btree (org_id, enrollment_a |
| `child_attendance_events` | `idx_child_attendance_events_org_member_date` | false | CREATE INDEX idx_child_attendance_events_org_member_date ON child_attendance_events USING btree (org_id, customer_member |
| `child_attendance_events` | `idx_child_attendance_events_org_site_date` | false | CREATE INDEX idx_child_attendance_events_org_site_date ON child_attendance_events USING btree (org_id, site_location_id, |
| `child_enrollment_agreements` | `child_enrollment_agreements_pkey` | true | CREATE UNIQUE INDEX child_enrollment_agreements_pkey ON child_enrollment_agreements USING btree (id) |
| `child_enrollment_agreements` | `idx_child_enrollment_agreements_org_member` | false | CREATE INDEX idx_child_enrollment_agreements_org_member ON child_enrollment_agreements USING btree (org_id, customer_mem |
| `child_enrollment_agreements` | `idx_child_enrollment_agreements_org_ocm` | false | CREATE INDEX idx_child_enrollment_agreements_org_ocm ON child_enrollment_agreements USING btree (org_id, opportunity_cus |
| `child_enrollment_agreements` | `idx_child_enrollment_agreements_org_opportunity` | false | CREATE INDEX idx_child_enrollment_agreements_org_opportunity ON child_enrollment_agreements USING btree (org_id, opportu |
| `child_enrollment_agreements` | `idx_child_enrollment_agreements_org_site_status` | false | CREATE INDEX idx_child_enrollment_agreements_org_site_status ON child_enrollment_agreements USING btree (org_id, site_lo |
| `child_enrollment_agreements` | `ux_child_enrollment_agreements_one_operational_per_member_site` | true | CREATE UNIQUE INDEX ux_child_enrollment_agreements_one_operational_per_member_site ON child_enrollment_agreements USING  |
| `child_placements` | `child_placements_pkey` | true | CREATE UNIQUE INDEX child_placements_pkey ON child_placements USING btree (id) |
| `child_placements` | `idx_child_placements_org_agreement` | false | CREATE INDEX idx_child_placements_org_agreement ON child_placements USING btree (org_id, enrollment_agreement_id) |
| `child_placements` | `idx_child_placements_org_member_dates` | false | CREATE INDEX idx_child_placements_org_member_dates ON child_placements USING btree (org_id, customer_member_id, start_da |
| `child_placements` | `ux_child_placements_one_operational_per_agreement` | true | CREATE UNIQUE INDEX ux_child_placements_one_operational_per_agreement ON child_placements USING btree (org_id, enrollmen |
| `childcare_capacity_rules` | `childcare_capacity_rules_pkey` | true | CREATE UNIQUE INDEX childcare_capacity_rules_pkey ON childcare_capacity_rules USING btree (id) |
| `childcare_capacity_rules` | `idx_childcare_capacity_rules_org_program` | false | CREATE INDEX idx_childcare_capacity_rules_org_program ON childcare_capacity_rules USING btree (org_id, program_category_ |
| `childcare_capacity_rules` | `idx_childcare_capacity_rules_org_room` | false | CREATE INDEX idx_childcare_capacity_rules_org_room ON childcare_capacity_rules USING btree (org_id, room_location_id) WH |
| `childcare_capacity_rules` | `idx_childcare_capacity_rules_org_scope` | false | CREATE INDEX idx_childcare_capacity_rules_org_scope ON childcare_capacity_rules USING btree (org_id, scope_type) |
| `childcare_capacity_rules` | `idx_childcare_capacity_rules_org_site` | false | CREATE INDEX idx_childcare_capacity_rules_org_site ON childcare_capacity_rules USING btree (org_id, site_location_id) WH |
| `childcare_operating_windows` | `childcare_operating_windows_pkey` | true | CREATE UNIQUE INDEX childcare_operating_windows_pkey ON childcare_operating_windows USING btree (id) |
| `childcare_operating_windows` | `idx_childcare_operating_windows_org_scope` | false | CREATE INDEX idx_childcare_operating_windows_org_scope ON childcare_operating_windows USING btree (org_id, scope_type) |
| `childcare_operating_windows` | `idx_childcare_operating_windows_org_site_weekday` | false | CREATE INDEX idx_childcare_operating_windows_org_site_weekday ON childcare_operating_windows USING btree (org_id, site_l |
| `childcare_ratio_rule_tiers` | `childcare_ratio_rule_tiers_pkey` | true | CREATE UNIQUE INDEX childcare_ratio_rule_tiers_pkey ON childcare_ratio_rule_tiers USING btree (id) |
| `childcare_ratio_rule_tiers` | `childcare_ratio_rule_tiers_unique_threshold` | true | CREATE UNIQUE INDEX childcare_ratio_rule_tiers_unique_threshold ON childcare_ratio_rule_tiers USING btree (ratio_rule_id |
| `childcare_ratio_rule_tiers` | `idx_childcare_ratio_rule_tiers_rule` | false | CREATE INDEX idx_childcare_ratio_rule_tiers_rule ON childcare_ratio_rule_tiers USING btree (ratio_rule_id, max_children) |
| `childcare_ratio_rules` | `childcare_ratio_rules_pkey` | true | CREATE UNIQUE INDEX childcare_ratio_rules_pkey ON childcare_ratio_rules USING btree (id) |
| `childcare_ratio_rules` | `idx_childcare_ratio_rules_org_age_group` | false | CREATE INDEX idx_childcare_ratio_rules_org_age_group ON childcare_ratio_rules USING btree (org_id, age_group_key) WHERE  |
| `childcare_ratio_rules` | `idx_childcare_ratio_rules_org_scope` | false | CREATE INDEX idx_childcare_ratio_rules_org_scope ON childcare_ratio_rules USING btree (org_id, scope_type) |
| `childcare_schedule_rules` | `childcare_schedule_rules_pkey` | true | CREATE UNIQUE INDEX childcare_schedule_rules_pkey ON childcare_schedule_rules USING btree (id) |
| `childcare_schedule_rules` | `idx_childcare_schedule_rules_org_scope` | false | CREATE INDEX idx_childcare_schedule_rules_org_scope ON childcare_schedule_rules USING btree (org_id, scope_type) |
| `cleaning_job_addons` | `cleaning_job_addons_pkey` | true | CREATE UNIQUE INDEX cleaning_job_addons_pkey ON cleaning_job_addons USING btree (job_id, addon_type_id) |
| `cleaning_job_details` | `cleaning_job_details_pkey` | true | CREATE UNIQUE INDEX cleaning_job_details_pkey ON cleaning_job_details USING btree (job_id) |
| `cleaning_service_types` | `cleaning_service_types_key_key` | true | CREATE UNIQUE INDEX cleaning_service_types_key_key ON cleaning_service_types USING btree (key) |
| `cleaning_service_types` | `cleaning_service_types_pkey` | true | CREATE UNIQUE INDEX cleaning_service_types_pkey ON cleaning_service_types USING btree (id) |
| `communication_delivery_events` | `communication_delivery_events_pkey` | true | CREATE UNIQUE INDEX communication_delivery_events_pkey ON communication_delivery_events USING btree (id) |
| `communication_delivery_events` | `idx_comm_delivery_events_message` | false | CREATE INDEX idx_comm_delivery_events_message ON communication_delivery_events USING btree (message_id, occurred_at DESC |
| `communication_delivery_events` | `idx_comm_delivery_events_org_type` | false | CREATE INDEX idx_comm_delivery_events_org_type ON communication_delivery_events USING btree (org_id, event_type, occurre |
| `communication_delivery_events` | `idx_comm_delivery_events_provider_msg` | false | CREATE INDEX idx_comm_delivery_events_provider_msg ON communication_delivery_events USING btree (provider, provider_mess |
| `communication_delivery_events` | `uq_comm_delivery_events_provider_event` | true | CREATE UNIQUE INDEX uq_comm_delivery_events_provider_event ON communication_delivery_events USING btree (provider, provi |
| `communication_message_reads` | `communication_message_reads_pkey` | true | CREATE UNIQUE INDEX communication_message_reads_pkey ON communication_message_reads USING btree (message_id, user_id) |
| `communication_message_reads` | `idx_comm_reads_org` | false | CREATE INDEX idx_comm_reads_org ON communication_message_reads USING btree (org_id) |
| `communication_message_recipients` | `communication_message_recipients_pkey` | true | CREATE UNIQUE INDEX communication_message_recipients_pkey ON communication_message_recipients USING btree (id) |
| `communication_message_recipients` | `idx_comm_msg_recipients_message` | false | CREATE INDEX idx_comm_msg_recipients_message ON communication_message_recipients USING btree (message_id) |
| `communication_message_recipients` | `idx_comm_msg_recipients_org_person` | false | CREATE INDEX idx_comm_msg_recipients_org_person ON communication_message_recipients USING btree (org_id, person_id, crea |
| `communication_message_recipients` | `idx_comm_msg_recipients_provider_msg` | false | CREATE INDEX idx_comm_msg_recipients_provider_msg ON communication_message_recipients USING btree (org_id, provider_mess |
| `communication_messages` | `communication_messages_pkey` | true | CREATE UNIQUE INDEX communication_messages_pkey ON communication_messages USING btree (id) |
| `communication_messages` | `idx_comm_msgs_org` | false | CREATE INDEX idx_comm_msgs_org ON communication_messages USING btree (org_id) |
| `communication_messages` | `idx_comm_msgs_org_thread_created` | false | CREATE INDEX idx_comm_msgs_org_thread_created ON communication_messages USING btree (org_id, thread_id, created_at DESC) |
| `communication_messages` | `idx_comm_msgs_queue` | false | CREATE INDEX idx_comm_msgs_queue ON communication_messages USING btree (org_id, status, channel, direction) WHERE direct |
| `communication_messages` | `idx_comm_msgs_thread` | false | CREATE INDEX idx_comm_msgs_thread ON communication_messages USING btree (thread_id) |
| `communication_preference_events` | `communication_preference_events_pkey` | true | CREATE UNIQUE INDEX communication_preference_events_pkey ON communication_preference_events USING btree (id) |
| `communication_preference_events` | `idx_comm_pref_events_org_category` | false | CREATE INDEX idx_comm_pref_events_org_category ON communication_preference_events USING btree (org_id, category, occurre |
| `communication_preference_events` | `idx_comm_pref_events_org_person` | false | CREATE INDEX idx_comm_pref_events_org_person ON communication_preference_events USING btree (org_id, person_id, occurred |
| `communication_preferences` | `communication_preferences_person_category_uq` | true | CREATE UNIQUE INDEX communication_preferences_person_category_uq ON communication_preferences USING btree (org_id, perso |
| `communication_preferences` | `communication_preferences_pkey` | true | CREATE UNIQUE INDEX communication_preferences_pkey ON communication_preferences USING btree (id) |
| `communication_preferences` | `idx_comm_prefs_org_person` | false | CREATE INDEX idx_comm_prefs_org_person ON communication_preferences USING btree (org_id, person_id) |
| `communication_provider_bindings` | `communication_bindings_org_inbound_to_uq` | true | CREATE UNIQUE INDEX communication_bindings_org_inbound_to_uq ON communication_provider_bindings USING btree (org_id, inb |
| `communication_provider_bindings` | `communication_provider_bindings_pkey` | true | CREATE UNIQUE INDEX communication_provider_bindings_pkey ON communication_provider_bindings USING btree (id) |
| `communication_provider_bindings` | `idx_comm_bindings_org_channel` | false | CREATE INDEX idx_comm_bindings_org_channel ON communication_provider_bindings USING btree (org_id, channel) WHERE status |
| `communication_provider_bindings` | `idx_comm_bindings_org_location_scope` | false | CREATE INDEX idx_comm_bindings_org_location_scope ON communication_provider_bindings USING btree (org_id, location_id, c |
| `communication_scheduled_sends` | `communication_scheduled_sends_pkey` | true | CREATE UNIQUE INDEX communication_scheduled_sends_pkey ON communication_scheduled_sends USING btree (id) |
| `communication_scheduled_sends` | `idx_comm_sched_sends_announcement` | false | CREATE INDEX idx_comm_sched_sends_announcement ON communication_scheduled_sends USING btree (announcement_id, status) WH |
| `communication_scheduled_sends` | `idx_comm_sched_sends_org_status_due` | false | CREATE INDEX idx_comm_sched_sends_org_status_due ON communication_scheduled_sends USING btree (org_id, status, scheduled |
| `communication_scheduled_sends` | `ux_comm_sched_sends_one_pending_per_proposal` | true | CREATE UNIQUE INDEX ux_comm_sched_sends_one_pending_per_proposal ON communication_scheduled_sends USING btree (proposal_ |
| `communication_scheduled_sends` | `ux_comm_sched_sends_tour_reminder_dedupe` | true | CREATE UNIQUE INDEX ux_comm_sched_sends_tour_reminder_dedupe ON communication_scheduled_sends USING btree (org_id, entit |
| `communication_snippets` | `communication_snippets_org_name_uq` | true | CREATE UNIQUE INDEX communication_snippets_org_name_uq ON communication_snippets USING btree (org_id, name) |
| `communication_snippets` | `communication_snippets_pkey` | true | CREATE UNIQUE INDEX communication_snippets_pkey ON communication_snippets USING btree (id) |
| `communication_template_versions` | `communication_template_versions_pkey` | true | CREATE UNIQUE INDEX communication_template_versions_pkey ON communication_template_versions USING btree (id) |
| `communication_template_versions` | `communication_template_versions_template_version_uq` | true | CREATE UNIQUE INDEX communication_template_versions_template_version_uq ON communication_template_versions USING btree ( |
| `communication_template_versions` | `idx_comm_template_versions_org` | false | CREATE INDEX idx_comm_template_versions_org ON communication_template_versions USING btree (org_id) |
| `communication_template_versions` | `idx_comm_template_versions_org_template` | false | CREATE INDEX idx_comm_template_versions_org_template ON communication_template_versions USING btree (org_id, template_id |
| `communication_template_versions` | `idx_comm_template_versions_template` | false | CREATE INDEX idx_comm_template_versions_template ON communication_template_versions USING btree (template_id, version_nu |
| `communication_template_versions` | `idx_comm_template_versions_template_b2` | false | CREATE INDEX idx_comm_template_versions_template_b2 ON communication_template_versions USING btree (template_id, version |
| `communication_templates` | `communication_templates_org_name_uq` | true | CREATE UNIQUE INDEX communication_templates_org_name_uq ON communication_templates USING btree (org_id, name) |
| `communication_templates` | `communication_templates_pkey` | true | CREATE UNIQUE INDEX communication_templates_pkey ON communication_templates USING btree (id) |
| `communication_templates` | `idx_comm_templates_org` | false | CREATE INDEX idx_comm_templates_org ON communication_templates USING btree (org_id) |
| `communication_templates` | `idx_comm_templates_org_category_channel` | false | CREATE INDEX idx_comm_templates_org_category_channel ON communication_templates USING btree (org_id, category, channel) |
| `communication_templates` | `idx_comm_templates_org_channel_status` | false | CREATE INDEX idx_comm_templates_org_channel_status ON communication_templates USING btree (org_id, channel, approval_sta |
| `communication_templates` | `idx_comm_templates_org_status` | false | CREATE INDEX idx_comm_templates_org_status ON communication_templates USING btree (org_id, status) |
| `communication_threads` | `communication_threads_identity_uq` | true | CREATE UNIQUE INDEX communication_threads_identity_uq ON communication_threads USING btree (org_id, primary_entity_type, |
| `communication_threads` | `communication_threads_pkey` | true | CREATE UNIQUE INDEX communication_threads_pkey ON communication_threads USING btree (id) |
| `communication_threads` | `idx_comm_threads_org` | false | CREATE INDEX idx_comm_threads_org ON communication_threads USING btree (org_id) |
| `communication_threads` | `idx_comm_threads_org_assigned_user` | false | CREATE INDEX idx_comm_threads_org_assigned_user ON communication_threads USING btree (org_id, assigned_user_id) WHERE as |
| `communication_threads` | `idx_comm_threads_org_assignment` | false | CREATE INDEX idx_comm_threads_org_assignment ON communication_threads USING btree (org_id, assignment_state, sla_state) |
| `communication_threads` | `idx_comm_threads_org_attention` | false | CREATE INDEX idx_comm_threads_org_attention ON communication_threads USING btree (org_id, attention_state, last_message_ |
| `communication_threads` | `idx_comm_threads_org_channel` | false | CREATE INDEX idx_comm_threads_org_channel ON communication_threads USING btree (org_id, channel) |
| `communication_threads` | `idx_comm_threads_org_entity` | false | CREATE INDEX idx_comm_threads_org_entity ON communication_threads USING btree (org_id, primary_entity_type, primary_enti |
| `communication_threads` | `idx_comm_threads_org_inbox_active` | false | CREATE INDEX idx_comm_threads_org_inbox_active ON communication_threads USING btree (org_id, last_message_at DESC NULLS  |
| `communication_threads` | `idx_comm_threads_org_inbox_archived` | false | CREATE INDEX idx_comm_threads_org_inbox_archived ON communication_threads USING btree (org_id, last_message_at DESC NULL |
| `config_layout_assist_proposals` | `config_layout_assist_proposals_pkey` | true | CREATE UNIQUE INDEX config_layout_assist_proposals_pkey ON config_layout_assist_proposals USING btree (id) |
| `config_layout_assist_proposals` | `idx_config_layout_assist_proposals_org_category_created` | false | CREATE INDEX idx_config_layout_assist_proposals_org_category_created ON config_layout_assist_proposals USING btree (org_ |
| `config_layout_assist_proposals` | `idx_config_layout_assist_proposals_org_created` | false | CREATE INDEX idx_config_layout_assist_proposals_org_created ON config_layout_assist_proposals USING btree (org_id, creat |
| `config_layout_assist_proposals` | `idx_config_layout_assist_proposals_org_state_created` | false | CREATE INDEX idx_config_layout_assist_proposals_org_state_created ON config_layout_assist_proposals USING btree (org_id, |
| `contact_tags` | `contact_tags_pkey` | true | CREATE UNIQUE INDEX contact_tags_pkey ON contact_tags USING btree (contact_id, tag_id) |
| `contacts` | `contacts_email_unique` | true | CREATE UNIQUE INDEX contacts_email_unique ON contacts USING btree (lower(TRIM(BOTH FROM email))) WHERE email IS NOT NULL |
| `contacts` | `contacts_org_status_idx` | false | CREATE INDEX contacts_org_status_idx ON contacts USING btree (org_id, status_key) |
| `contacts` | `contacts_phone_unique` | true | CREATE UNIQUE INDEX contacts_phone_unique ON contacts USING btree (phone) WHERE phone IS NOT NULL AND length(TRIM(BOTH F |
| `contacts` | `contacts_pkey` | true | CREATE UNIQUE INDEX contacts_pkey ON contacts USING btree (id) |
| `contacts` | `idx_contacts_archived` | false | CREATE INDEX idx_contacts_archived ON contacts USING btree (org_id, archived_at) |
| `contacts` | `idx_contacts_customer_id` | false | CREATE INDEX idx_contacts_customer_id ON contacts USING btree (customer_id) |
| `contacts` | `idx_contacts_email` | false | CREATE INDEX idx_contacts_email ON contacts USING btree (lower(email)) |
| `contacts` | `idx_contacts_external` | false | CREATE INDEX idx_contacts_external ON contacts USING btree (external_source, external_id) |
| `contacts` | `idx_contacts_org_id` | false | CREATE INDEX idx_contacts_org_id ON contacts USING btree (org_id) |
| `contacts` | `idx_contacts_person_id` | false | CREATE INDEX idx_contacts_person_id ON contacts USING btree (person_id) |
| `contacts` | `idx_contacts_phone` | false | CREATE INDEX idx_contacts_phone ON contacts USING btree (phone) |
| `contacts` | `idx_contacts_postal_code` | false | CREATE INDEX idx_contacts_postal_code ON contacts USING btree (postal_code) |
| `contacts` | `idx_contacts_vendor_id` | false | CREATE INDEX idx_contacts_vendor_id ON contacts USING btree (vendor_id) |
| `contacts` | `ux_contacts_email_not_null` | true | CREATE UNIQUE INDEX ux_contacts_email_not_null ON contacts USING btree (lower(email)) WHERE email IS NOT NULL AND email  |
| `contacts` | `ux_contacts_phone_not_null` | true | CREATE UNIQUE INDEX ux_contacts_phone_not_null ON contacts USING btree (phone) WHERE phone IS NOT NULL AND phone <> '':: |
| `conversation_assignment_events` | `conversation_assignment_events_pkey` | true | CREATE UNIQUE INDEX conversation_assignment_events_pkey ON conversation_assignment_events USING btree (id) |
| `conversation_assignment_events` | `idx_conv_assign_events_org_thread` | false | CREATE INDEX idx_conv_assign_events_org_thread ON conversation_assignment_events USING btree (org_id, thread_id, occurre |
| `conversation_assignment_events` | `idx_conv_assign_events_org_time` | false | CREATE INDEX idx_conv_assign_events_org_time ON conversation_assignment_events USING btree (org_id, occurred_at DESC) |
| `customer_member_contact_roles` | `customer_member_contact_roles_org_active_idx` | false | CREATE INDEX customer_member_contact_roles_org_active_idx ON customer_member_contact_roles USING btree (org_id, is_activ |
| `customer_member_contact_roles` | `customer_member_contact_roles_pkey` | true | CREATE UNIQUE INDEX customer_member_contact_roles_pkey ON customer_member_contact_roles USING btree (id) |
| `customer_member_contact_roles` | `customer_member_contact_roles_unique` | true | CREATE UNIQUE INDEX customer_member_contact_roles_unique ON customer_member_contact_roles USING btree (org_id, role_key) |
| `customer_member_contacts` | `customer_member_contacts_org_contact_idx` | false | CREATE INDEX customer_member_contacts_org_contact_idx ON customer_member_contacts USING btree (org_id, contact_id) |
| `customer_member_contacts` | `customer_member_contacts_org_customer_idx` | false | CREATE INDEX customer_member_contacts_org_customer_idx ON customer_member_contacts USING btree (org_id, customer_id) |
| `customer_member_contacts` | `customer_member_contacts_org_member_idx` | false | CREATE INDEX customer_member_contacts_org_member_idx ON customer_member_contacts USING btree (org_id, customer_member_id |
| `customer_member_contacts` | `customer_member_contacts_pkey` | true | CREATE UNIQUE INDEX customer_member_contacts_pkey ON customer_member_contacts USING btree (id) |
| `customer_member_contacts` | `customer_member_contacts_unique` | true | CREATE UNIQUE INDEX customer_member_contacts_unique ON customer_member_contacts USING btree (org_id, customer_member_id, |
| `customer_member_relationship_types` | `customer_member_relationship_types_org_key_unique` | true | CREATE UNIQUE INDEX customer_member_relationship_types_org_key_unique ON customer_member_relationship_types USING btree  |
| `customer_member_relationship_types` | `customer_member_relationship_types_org_sort_idx` | false | CREATE INDEX customer_member_relationship_types_org_sort_idx ON customer_member_relationship_types USING btree (org_id,  |
| `customer_member_relationship_types` | `customer_member_relationship_types_pkey` | true | CREATE UNIQUE INDEX customer_member_relationship_types_pkey ON customer_member_relationship_types USING btree (id) |
| `customer_member_relationship_types` | `customer_member_relationship_types_unique` | true | CREATE UNIQUE INDEX customer_member_relationship_types_unique ON customer_member_relationship_types USING btree (org_id, |
| `customer_members` | `customer_members_org_customer_idx` | false | CREATE INDEX customer_members_org_customer_idx ON customer_members USING btree (org_id, customer_id) |
| `customer_members` | `customer_members_org_name_idx` | false | CREATE INDEX customer_members_org_name_idx ON customer_members USING btree (org_id, display_name) |
| `customer_members` | `customer_members_org_status_idx` | false | CREATE INDEX customer_members_org_status_idx ON customer_members USING btree (org_id, status_key) |
| `customer_members` | `customer_members_pkey` | true | CREATE UNIQUE INDEX customer_members_pkey ON customer_members USING btree (id) |
| `customer_members` | `idx_customer_members_person_id` | false | CREATE INDEX idx_customer_members_person_id ON customer_members USING btree (person_id) |
| `customer_payment_methods` | `customer_payment_methods_customer_id_stripe_payment_method__key` | true | CREATE UNIQUE INDEX customer_payment_methods_customer_id_stripe_payment_method__key ON customer_payment_methods USING bt |
| `customer_payment_methods` | `customer_payment_methods_pkey` | true | CREATE UNIQUE INDEX customer_payment_methods_pkey ON customer_payment_methods USING btree (id) |
| `customer_person_role_types` | `customer_person_role_types_pkey` | true | CREATE UNIQUE INDEX customer_person_role_types_pkey ON customer_person_role_types USING btree (id) |
| `customer_person_role_types` | `idx_customer_person_role_types_active` | false | CREATE INDEX idx_customer_person_role_types_active ON customer_person_role_types USING btree (org_id, is_active, sort_or |
| `customer_person_role_types` | `idx_customer_person_role_types_industry_id` | false | CREATE INDEX idx_customer_person_role_types_industry_id ON customer_person_role_types USING btree (industry_id) |
| `customer_person_role_types` | `idx_customer_person_role_types_org_id` | false | CREATE INDEX idx_customer_person_role_types_org_id ON customer_person_role_types USING btree (org_id) |
| `customer_person_role_types` | `idx_customer_person_role_types_vertical_id` | false | CREATE INDEX idx_customer_person_role_types_vertical_id ON customer_person_role_types USING btree (vertical_id) |
| `customer_person_role_types` | `uq_customer_person_role_types_scope_key` | true | CREATE UNIQUE INDEX uq_customer_person_role_types_scope_key ON customer_person_role_types USING btree (org_id, COALESCE( |
| `customer_persons` | `customer_persons_pkey` | true | CREATE UNIQUE INDEX customer_persons_pkey ON customer_persons USING btree (id) |
| `customer_persons` | `idx_customer_persons_customer_id` | false | CREATE INDEX idx_customer_persons_customer_id ON customer_persons USING btree (customer_id) |
| `customer_persons` | `idx_customer_persons_org_id` | false | CREATE INDEX idx_customer_persons_org_id ON customer_persons USING btree (org_id) |
| `customer_persons` | `idx_customer_persons_person_id` | false | CREATE INDEX idx_customer_persons_person_id ON customer_persons USING btree (person_id) |
| `customer_persons` | `uq_customer_persons_unique` | true | CREATE UNIQUE INDEX uq_customer_persons_unique ON customer_persons USING btree (org_id, customer_id, person_id, role_typ |
| `customer_subscriptions` | `customer_subscriptions_customer_id_idx` | false | CREATE INDEX customer_subscriptions_customer_id_idx ON customer_subscriptions USING btree (customer_id) |
| `customer_subscriptions` | `customer_subscriptions_customer_idx` | false | CREATE INDEX customer_subscriptions_customer_idx ON customer_subscriptions USING btree (customer_id) |
| `customer_subscriptions` | `customer_subscriptions_pkey` | true | CREATE UNIQUE INDEX customer_subscriptions_pkey ON customer_subscriptions USING btree (id) |
| `customer_subscriptions` | `customer_subscriptions_status_idx` | false | CREATE INDEX customer_subscriptions_status_idx ON customer_subscriptions USING btree (status) |
| `customer_subscriptions` | `idx_customer_subscriptions_org_customer` | false | CREATE INDEX idx_customer_subscriptions_org_customer ON customer_subscriptions USING btree (org_id, customer_id) |
| `customer_subscriptions` | `uq_customer_subscriptions_active` | true | CREATE UNIQUE INDEX uq_customer_subscriptions_active ON customer_subscriptions USING btree (org_id, customer_id, vertica |
| `customer_tags` | `customer_tags_pkey` | true | CREATE UNIQUE INDEX customer_tags_pkey ON customer_tags USING btree (customer_id, tag_id) |
| `customer_vertical_job_counters` | `customer_vertical_job_counters_pkey` | true | CREATE UNIQUE INDEX customer_vertical_job_counters_pkey ON customer_vertical_job_counters USING btree (customer_id, vert |
| `customer_vertical_job_counters` | `uniq_counter_per_customer_vertical` | true | CREATE UNIQUE INDEX uniq_counter_per_customer_vertical ON customer_vertical_job_counters USING btree (customer_id, verti |
| `customers` | `customers_org_status_idx` | false | CREATE INDEX customers_org_status_idx ON customers USING btree (org_id, status_key) |
| `customers` | `customers_pkey` | true | CREATE UNIQUE INDEX customers_pkey ON customers USING btree (id) |
| `customers` | `customers_stripe_customer_unique` | true | CREATE UNIQUE INDEX customers_stripe_customer_unique ON customers USING btree (stripe_customer_id) WHERE stripe_customer |
| `customers` | `idx_customers_external` | false | CREATE INDEX idx_customers_external ON customers USING btree (external_source, external_id) |
| `customers` | `idx_customers_org_id` | false | CREATE INDEX idx_customers_org_id ON customers USING btree (org_id) |
| `customers` | `idx_customers_primary_contact` | false | CREATE INDEX idx_customers_primary_contact ON customers USING btree (primary_contact_id) |
| `customers` | `idx_customers_vertical_id` | false | CREATE INDEX idx_customers_vertical_id ON customers USING btree (vertical_id) |
| `customers` | `ux_customers_org_customer_number` | true | CREATE UNIQUE INDEX ux_customers_org_customer_number ON customers USING btree (org_id, customer_number) |
| `customers` | `ux_customers_stripe_customer_id_not_null` | true | CREATE UNIQUE INDEX ux_customers_stripe_customer_id_not_null ON customers USING btree (stripe_customer_id) WHERE stripe_ |
| `departments` | `departments_pkey` | true | CREATE UNIQUE INDEX departments_pkey ON departments USING btree (id) |
| `departments` | `idx_departments_org_active_sort` | false | CREATE INDEX idx_departments_org_active_sort ON departments USING btree (org_id, is_active, sort_order) |
| `departments` | `idx_departments_org_id` | false | CREATE INDEX idx_departments_org_id ON departments USING btree (org_id) |
| `departments` | `uq_departments_org_key` | true | CREATE UNIQUE INDEX uq_departments_org_key ON departments USING btree (org_id, key) |
| `discount_applications` | `discount_applications_commitment_idx` | false | CREATE INDEX discount_applications_commitment_idx ON discount_applications USING btree (discount_commitment_id) |
| `discount_applications` | `discount_applications_customer_idx` | false | CREATE INDEX discount_applications_customer_idx ON discount_applications USING btree (org_id, customer_id) |
| `discount_applications` | `discount_applications_legacy_discount_code_id_idx` | false | CREATE INDEX discount_applications_legacy_discount_code_id_idx ON discount_applications USING btree (legacy_discount_cod |
| `discount_applications` | `discount_applications_legacy_discount_redemption_id_uidx` | true | CREATE UNIQUE INDEX discount_applications_legacy_discount_redemption_id_uidx ON discount_applications USING btree (legac |
| `discount_applications` | `discount_applications_org_target_idx` | false | CREATE INDEX discount_applications_org_target_idx ON discount_applications USING btree (org_id, target_entity_type, targ |
| `discount_applications` | `discount_applications_pkey` | true | CREATE UNIQUE INDEX discount_applications_pkey ON discount_applications USING btree (id) |
| `discount_applications` | `discount_applications_program_idx` | false | CREATE INDEX discount_applications_program_idx ON discount_applications USING btree (discount_program_id) |
| `discount_codes` | `discount_codes_code_key` | true | CREATE UNIQUE INDEX discount_codes_code_key ON discount_codes USING btree (code) |
| `discount_codes` | `discount_codes_code_unique` | true | CREATE UNIQUE INDEX discount_codes_code_unique ON discount_codes USING btree (code) |
| `discount_codes` | `discount_codes_pkey` | true | CREATE UNIQUE INDEX discount_codes_pkey ON discount_codes USING btree (id) |
| `discount_codes` | `idx_discount_codes_active` | false | CREATE INDEX idx_discount_codes_active ON discount_codes USING btree (is_active) |
| `discount_codes` | `idx_discount_codes_code` | false | CREATE INDEX idx_discount_codes_code ON discount_codes USING btree (code) |
| `discount_codes` | `uniq_discount_codes_code` | true | CREATE UNIQUE INDEX uniq_discount_codes_code ON discount_codes USING btree (code) |
| `discount_commitments` | `discount_commitments_org_customer_idx` | false | CREATE INDEX discount_commitments_org_customer_idx ON discount_commitments USING btree (org_id, customer_id) |
| `discount_commitments` | `discount_commitments_pkey` | true | CREATE UNIQUE INDEX discount_commitments_pkey ON discount_commitments USING btree (id) |
| `discount_commitments` | `discount_commitments_program_idx` | false | CREATE INDEX discount_commitments_program_idx ON discount_commitments USING btree (discount_program_id) |
| `discount_commitments` | `discount_commitments_status_idx` | false | CREATE INDEX discount_commitments_status_idx ON discount_commitments USING btree (org_id, status) |
| `discount_program_benefits` | `discount_program_benefits_org_idx` | false | CREATE INDEX discount_program_benefits_org_idx ON discount_program_benefits USING btree (org_id) |
| `discount_program_benefits` | `discount_program_benefits_pkey` | true | CREATE UNIQUE INDEX discount_program_benefits_pkey ON discount_program_benefits USING btree (id) |
| `discount_program_benefits` | `discount_program_benefits_program_idx` | false | CREATE INDEX discount_program_benefits_program_idx ON discount_program_benefits USING btree (discount_program_id) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_org_idx` | false | CREATE INDEX discount_program_commitment_rules_org_idx ON discount_program_commitment_rules USING btree (org_id) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_pkey` | true | CREATE UNIQUE INDEX discount_program_commitment_rules_pkey ON discount_program_commitment_rules USING btree (id) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_program_idx` | false | CREATE INDEX discount_program_commitment_rules_program_idx ON discount_program_commitment_rules USING btree (discount_pr |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_program_unique` | true | CREATE UNIQUE INDEX discount_program_commitment_rules_program_unique ON discount_program_commitment_rules USING btree (d |
| `discount_program_qualifiers` | `discount_program_qualifiers_org_idx` | false | CREATE INDEX discount_program_qualifiers_org_idx ON discount_program_qualifiers USING btree (org_id) |
| `discount_program_qualifiers` | `discount_program_qualifiers_pkey` | true | CREATE UNIQUE INDEX discount_program_qualifiers_pkey ON discount_program_qualifiers USING btree (id) |
| `discount_program_qualifiers` | `discount_program_qualifiers_program_idx` | false | CREATE INDEX discount_program_qualifiers_program_idx ON discount_program_qualifiers USING btree (discount_program_id, so |
| `discount_programs` | `discount_programs_legacy_discount_code_id_uidx` | true | CREATE UNIQUE INDEX discount_programs_legacy_discount_code_id_uidx ON discount_programs USING btree (legacy_discount_cod |
| `discount_programs` | `discount_programs_org_code_unique_active_idx` | true | CREATE UNIQUE INDEX discount_programs_org_code_unique_active_idx ON discount_programs USING btree (org_id, lower(code))  |
| `discount_programs` | `discount_programs_org_program_type_idx` | false | CREATE INDEX discount_programs_org_program_type_idx ON discount_programs USING btree (org_id, program_type) |
| `discount_programs` | `discount_programs_org_status_idx` | false | CREATE INDEX discount_programs_org_status_idx ON discount_programs USING btree (org_id, status) |
| `discount_programs` | `discount_programs_pkey` | true | CREATE UNIQUE INDEX discount_programs_pkey ON discount_programs USING btree (id) |
| `discount_redemptions` | `discount_redemptions_pkey` | true | CREATE UNIQUE INDEX discount_redemptions_pkey ON discount_redemptions USING btree (id) |
| `discount_redemptions` | `discount_redemptions_unique_code` | true | CREATE UNIQUE INDEX discount_redemptions_unique_code ON discount_redemptions USING btree (customer_id, discount_code_id) |
| `discount_redemptions` | `discount_redemptions_unique_program` | true | CREATE UNIQUE INDEX discount_redemptions_unique_program ON discount_redemptions USING btree (customer_id, discount_progr |
| `discount_redemptions` | `idx_discount_redemptions_code` | false | CREATE INDEX idx_discount_redemptions_code ON discount_redemptions USING btree (discount_code) |
| `discount_redemptions` | `idx_discount_redemptions_contact` | false | CREATE INDEX idx_discount_redemptions_contact ON discount_redemptions USING btree (contact_id) |
| `discount_redemptions` | `idx_discount_redemptions_created` | false | CREATE INDEX idx_discount_redemptions_created ON discount_redemptions USING btree (created_at DESC) |
| `discount_redemptions` | `idx_discount_redemptions_discount_code` | false | CREATE INDEX idx_discount_redemptions_discount_code ON discount_redemptions USING btree (discount_code) |
| `discount_redemptions` | `idx_discount_redemptions_job` | false | CREATE INDEX idx_discount_redemptions_job ON discount_redemptions USING btree (job_id) |
| `discount_redemptions` | `idx_discount_redemptions_opportunity` | false | CREATE INDEX idx_discount_redemptions_opportunity ON discount_redemptions USING btree (opportunity_id) |
| `discount_redemptions` | `uniq_redemption_per_contact_code` | true | CREATE UNIQUE INDEX uniq_redemption_per_contact_code ON discount_redemptions USING btree (contact_id, discount_code_id) |
| `discount_redemptions` | `uniq_redemption_per_customer_code` | true | CREATE UNIQUE INDEX uniq_redemption_per_customer_code ON discount_redemptions USING btree (customer_id, discount_code_id |
| `discounts` | `discounts_code_key` | true | CREATE UNIQUE INDEX discounts_code_key ON discounts USING btree (code) |
| `discounts` | `discounts_pkey` | true | CREATE UNIQUE INDEX discounts_pkey ON discounts USING btree (id) |
| `document_field_definitions` | `document_field_definitions_org_doc_type_field_key_key` | true | CREATE UNIQUE INDEX document_field_definitions_org_doc_type_field_key_key ON document_field_definitions USING btree (org |
| `document_field_definitions` | `document_field_definitions_pkey` | true | CREATE UNIQUE INDEX document_field_definitions_pkey ON document_field_definitions USING btree (id) |
| `document_field_definitions` | `idx_document_field_definitions_org_doc_type` | false | CREATE INDEX idx_document_field_definitions_org_doc_type ON document_field_definitions USING btree (org_id, doc_type) |
| `document_field_definitions` | `idx_document_field_definitions_org_id` | false | CREATE INDEX idx_document_field_definitions_org_id ON document_field_definitions USING btree (org_id) |
| `document_field_values` | `document_field_values_document_id_field_key_key` | true | CREATE UNIQUE INDEX document_field_values_document_id_field_key_key ON document_field_values USING btree (document_id, f |
| `document_field_values` | `document_field_values_pkey` | true | CREATE UNIQUE INDEX document_field_values_pkey ON document_field_values USING btree (id) |
| `document_field_values` | `idx_document_field_values_document_id` | false | CREATE INDEX idx_document_field_values_document_id ON document_field_values USING btree (document_id) |
| `document_field_values` | `idx_document_field_values_field_definition_id` | false | CREATE INDEX idx_document_field_values_field_definition_id ON document_field_values USING btree (field_definition_id) |
| `document_field_values` | `idx_document_field_values_org_id` | false | CREATE INDEX idx_document_field_values_org_id ON document_field_values USING btree (org_id) |
| `document_versions` | `document_versions_document_id_version_number_key` | true | CREATE UNIQUE INDEX document_versions_document_id_version_number_key ON document_versions USING btree (document_id, vers |
| `document_versions` | `document_versions_pkey` | true | CREATE UNIQUE INDEX document_versions_pkey ON document_versions USING btree (id) |
| `document_versions` | `idx_document_versions_document_id` | false | CREATE INDEX idx_document_versions_document_id ON document_versions USING btree (document_id) |
| `document_versions` | `idx_document_versions_org_id` | false | CREATE INDEX idx_document_versions_org_id ON document_versions USING btree (org_id) |
| `documents` | `documents_pkey` | true | CREATE UNIQUE INDEX documents_pkey ON documents USING btree (id) |
| `documents` | `idx_documents_created_at` | false | CREATE INDEX idx_documents_created_at ON documents USING btree (created_at) |
| `documents` | `idx_documents_doc_type` | false | CREATE INDEX idx_documents_doc_type ON documents USING btree (doc_type) |
| `documents` | `idx_documents_entity` | false | CREATE INDEX idx_documents_entity ON documents USING btree (entity_type, entity_id) |
| `documents` | `idx_documents_extraction_status` | false | CREATE INDEX idx_documents_extraction_status ON documents USING btree (extraction_status) |
| `documents` | `idx_documents_generated_from_document_id` | false | CREATE INDEX idx_documents_generated_from_document_id ON documents USING btree (generated_from_document_id) |
| `documents` | `idx_documents_org_id` | false | CREATE INDEX idx_documents_org_id ON documents USING btree (org_id) |
| `entity_labels` | `entity_labels_entity_type_idx` | false | CREATE INDEX entity_labels_entity_type_idx ON entity_labels USING btree (entity_type) |
| `entity_labels` | `entity_labels_org_id_idx` | false | CREATE INDEX entity_labels_org_id_idx ON entity_labels USING btree (org_id) |
| `entity_labels` | `entity_labels_pkey` | true | CREATE UNIQUE INDEX entity_labels_pkey ON entity_labels USING btree (id) |
| `entity_labels` | `entity_labels_unique` | true | CREATE UNIQUE INDEX entity_labels_unique ON entity_labels USING btree (org_id, entity_type) |
| `entity_layouts` | `entity_layouts_org_entity_surface_key_version` | true | CREATE UNIQUE INDEX entity_layouts_org_entity_surface_key_version ON entity_layouts USING btree (org_id, entity_type, su |
| `entity_layouts` | `entity_layouts_pkey` | true | CREATE UNIQUE INDEX entity_layouts_pkey ON entity_layouts USING btree (id) |
| `entity_layouts` | `idx_entity_layouts_default_entity_surface` | false | CREATE INDEX idx_entity_layouts_default_entity_surface ON entity_layouts USING btree (entity_type, surface, status) WHER |
| `entity_layouts` | `idx_entity_layouts_org_entity_surface_status` | false | CREATE INDEX idx_entity_layouts_org_entity_surface_status ON entity_layouts USING btree (org_id, entity_type, surface, s |
| `entity_layouts` | `uq_entity_layouts_default_version` | true | CREATE UNIQUE INDEX uq_entity_layouts_default_version ON entity_layouts USING btree (entity_type, surface, layout_key, v |
| `external_mappings` | `external_mappings_pkey` | true | CREATE UNIQUE INDEX external_mappings_pkey ON external_mappings USING btree (id) |
| `external_mappings` | `external_mappings_source_entity_type_external_id_key` | true | CREATE UNIQUE INDEX external_mappings_source_entity_type_external_id_key ON external_mappings USING btree (source, entit |
| `external_mappings` | `idx_external_mappings_internal` | false | CREATE INDEX idx_external_mappings_internal ON external_mappings USING btree (internal_table, internal_id) |
| `external_mappings` | `ux_external_mappings_unique` | true | CREATE UNIQUE INDEX ux_external_mappings_unique ON external_mappings USING btree (source, entity_type, external_id, inte |
| `field_definitions` | `field_definitions_pkey` | true | CREATE UNIQUE INDEX field_definitions_pkey ON field_definitions USING btree (id) |
| `field_definitions` | `ux_field_definitions_org_entity_key` | true | CREATE UNIQUE INDEX ux_field_definitions_org_entity_key ON field_definitions USING btree (org_id, entity_type, field_key |
| `field_section_definitions` | `field_section_definitions_org_entity_section_key` | true | CREATE UNIQUE INDEX field_section_definitions_org_entity_section_key ON field_section_definitions USING btree (org_id, e |
| `field_section_definitions` | `field_section_definitions_pkey` | true | CREATE UNIQUE INDEX field_section_definitions_pkey ON field_section_definitions USING btree (id) |
| `field_section_definitions` | `idx_field_section_definitions_org_entity` | false | CREATE INDEX idx_field_section_definitions_org_entity ON field_section_definitions USING btree (org_id, entity_type, sor |
| `field_values` | `field_values_pkey` | true | CREATE UNIQUE INDEX field_values_pkey ON field_values USING btree (id) |
| `field_values` | `idx_field_values_entity` | false | CREATE INDEX idx_field_values_entity ON field_values USING btree (entity_type, entity_id) |
| `field_values` | `idx_field_values_org_entity` | false | CREATE INDEX idx_field_values_org_entity ON field_values USING btree (org_id, entity_type, entity_id) |
| `field_values` | `ux_field_values_field_entity` | true | CREATE UNIQUE INDEX ux_field_values_field_entity ON field_values USING btree (field_definition_id, entity_id) |
| `form_definition_versions` | `form_definition_versions_pkey` | true | CREATE UNIQUE INDEX form_definition_versions_pkey ON form_definition_versions USING btree (id) |
| `form_definition_versions` | `idx_form_definition_versions_def_status` | false | CREATE INDEX idx_form_definition_versions_def_status ON form_definition_versions USING btree (form_definition_id, status |
| `form_definition_versions` | `idx_form_definition_versions_def_version_desc` | false | CREATE INDEX idx_form_definition_versions_def_version_desc ON form_definition_versions USING btree (form_definition_id,  |
| `form_definition_versions` | `idx_form_definition_versions_org` | false | CREATE INDEX idx_form_definition_versions_org ON form_definition_versions USING btree (org_id) |
| `form_definition_versions` | `uq_form_definition_versions_definition_version` | true | CREATE UNIQUE INDEX uq_form_definition_versions_definition_version ON form_definition_versions USING btree (form_definit |
| `form_definitions` | `form_definitions_pkey` | true | CREATE UNIQUE INDEX form_definitions_pkey ON form_definitions USING btree (id) |
| `form_definitions` | `idx_form_definitions_org_active` | false | CREATE INDEX idx_form_definitions_org_active ON form_definitions USING btree (org_id, is_active) |
| `form_definitions` | `idx_form_definitions_org_id` | false | CREATE INDEX idx_form_definitions_org_id ON form_definitions USING btree (org_id) |
| `form_definitions` | `uq_form_definitions_org_key` | true | CREATE UNIQUE INDEX uq_form_definitions_org_key ON form_definitions USING btree (org_id, key) |
| `form_packet_definitions` | `form_packet_definitions_pkey` | true | CREATE UNIQUE INDEX form_packet_definitions_pkey ON form_packet_definitions USING btree (id) |
| `form_packet_definitions` | `idx_form_packet_definitions_org` | false | CREATE INDEX idx_form_packet_definitions_org ON form_packet_definitions USING btree (org_id) |
| `form_packet_definitions` | `idx_form_packet_definitions_org_active` | false | CREATE INDEX idx_form_packet_definitions_org_active ON form_packet_definitions USING btree (org_id, is_active) |
| `form_packet_definitions` | `uq_form_packet_definitions_org_key` | true | CREATE UNIQUE INDEX uq_form_packet_definitions_org_key ON form_packet_definitions USING btree (org_id, key) |
| `form_packet_items` | `form_packet_items_pkey` | true | CREATE UNIQUE INDEX form_packet_items_pkey ON form_packet_items USING btree (id) |
| `form_packet_items` | `idx_form_packet_items_form_def` | false | CREATE INDEX idx_form_packet_items_form_def ON form_packet_items USING btree (form_definition_id) |
| `form_packet_items` | `idx_form_packet_items_packet` | false | CREATE INDEX idx_form_packet_items_packet ON form_packet_items USING btree (packet_definition_id, sequence_index) |
| `form_packet_items` | `uq_form_packet_items_packet_sequence` | true | CREATE UNIQUE INDEX uq_form_packet_items_packet_sequence ON form_packet_items USING btree (packet_definition_id, sequenc |
| `form_packet_session_items` | `form_packet_session_items_pkey` | true | CREATE UNIQUE INDEX form_packet_session_items_pkey ON form_packet_session_items USING btree (id) |
| `form_packet_session_items` | `idx_form_packet_session_items_session` | false | CREATE INDEX idx_form_packet_session_items_session ON form_packet_session_items USING btree (packet_session_id, sequence |
| `form_packet_session_items` | `idx_form_packet_session_items_submission` | false | CREATE INDEX idx_form_packet_session_items_submission ON form_packet_session_items USING btree (form_submission_id) WHER |
| `form_packet_session_items` | `uq_form_packet_session_items_session_packet_item` | true | CREATE UNIQUE INDEX uq_form_packet_session_items_session_packet_item ON form_packet_session_items USING btree (packet_se |
| `form_packet_session_items` | `uq_form_packet_session_items_session_sequence` | true | CREATE UNIQUE INDEX uq_form_packet_session_items_session_sequence ON form_packet_session_items USING btree (packet_sessi |
| `form_packet_sessions` | `form_packet_sessions_pkey` | true | CREATE UNIQUE INDEX form_packet_sessions_pkey ON form_packet_sessions USING btree (id) |
| `form_packet_sessions` | `idx_form_packet_sessions_org_created` | false | CREATE INDEX idx_form_packet_sessions_org_created ON form_packet_sessions USING btree (org_id, created_at DESC) |
| `form_packet_sessions` | `idx_form_packet_sessions_org_status` | false | CREATE INDEX idx_form_packet_sessions_org_status ON form_packet_sessions USING btree (org_id, status) |
| `form_packet_sessions` | `uq_form_packet_sessions_one_link` | true | CREATE UNIQUE INDEX uq_form_packet_sessions_one_link ON form_packet_sessions USING btree (started_via_public_link_id) |
| `form_public_links` | `form_public_links_pkey` | true | CREATE UNIQUE INDEX form_public_links_pkey ON form_public_links USING btree (id) |
| `form_public_links` | `idx_form_public_links_org_def` | false | CREATE INDEX idx_form_public_links_org_def ON form_public_links USING btree (org_id, form_definition_id) |
| `form_public_links` | `uq_form_public_links_token_hash` | true | CREATE UNIQUE INDEX uq_form_public_links_token_hash ON form_public_links USING btree (token_hash) |
| `form_submission_documents` | `form_submission_documents_pkey` | true | CREATE UNIQUE INDEX form_submission_documents_pkey ON form_submission_documents USING btree (id) |
| `form_submission_documents` | `idx_form_submission_documents_doc` | false | CREATE INDEX idx_form_submission_documents_doc ON form_submission_documents USING btree (document_id) |
| `form_submission_documents` | `idx_form_submission_documents_org_sub` | false | CREATE INDEX idx_form_submission_documents_org_sub ON form_submission_documents USING btree (org_id, form_submission_id) |
| `form_submission_documents` | `idx_form_submission_documents_sub` | false | CREATE INDEX idx_form_submission_documents_sub ON form_submission_documents USING btree (form_submission_id) |
| `form_submission_documents` | `uq_form_submission_documents_sub_doc` | true | CREATE UNIQUE INDEX uq_form_submission_documents_sub_doc ON form_submission_documents USING btree (form_submission_id, d |
| `form_submission_signatures` | `form_submission_signatures_pkey` | true | CREATE UNIQUE INDEX form_submission_signatures_pkey ON form_submission_signatures USING btree (id) |
| `form_submission_signatures` | `idx_form_submission_signatures_org` | false | CREATE INDEX idx_form_submission_signatures_org ON form_submission_signatures USING btree (org_id) |
| `form_submission_signatures` | `idx_form_submission_signatures_sub` | false | CREATE INDEX idx_form_submission_signatures_sub ON form_submission_signatures USING btree (form_submission_id) |
| `form_submission_signatures` | `uq_form_submission_signatures_field_instance` | true | CREATE UNIQUE INDEX uq_form_submission_signatures_field_instance ON form_submission_signatures USING btree (form_submiss |
| `form_submissions` | `form_submissions_pkey` | true | CREATE UNIQUE INDEX form_submissions_pkey ON form_submissions USING btree (id) |
| `form_submissions` | `idx_form_submissions_customer` | false | CREATE INDEX idx_form_submissions_customer ON form_submissions USING btree (customer_id) |
| `form_submissions` | `idx_form_submissions_member` | false | CREATE INDEX idx_form_submissions_member ON form_submissions USING btree (customer_member_id) |
| `form_submissions` | `idx_form_submissions_org_created` | false | CREATE INDEX idx_form_submissions_org_created ON form_submissions USING btree (org_id, created_at DESC) |
| `form_submissions` | `idx_form_submissions_org_opp` | false | CREATE INDEX idx_form_submissions_org_opp ON form_submissions USING btree (org_id, opportunity_id) |
| `form_submissions` | `idx_form_submissions_org_status` | false | CREATE INDEX idx_form_submissions_org_status ON form_submissions USING btree (org_id, status) |
| `form_submissions` | `idx_form_submissions_org_version` | false | CREATE INDEX idx_form_submissions_org_version ON form_submissions USING btree (org_id, form_definition_version_id) |
| `gl_account_mappings` | `gl_account_mappings_org_key_uq` | true | CREATE UNIQUE INDEX gl_account_mappings_org_key_uq ON gl_account_mappings USING btree (org_id, key) |
| `gl_account_mappings` | `gl_account_mappings_pkey` | true | CREATE UNIQUE INDEX gl_account_mappings_pkey ON gl_account_mappings USING btree (id) |
| `gl_account_mappings` | `ux_gl_account_mappings_org_key_active` | true | CREATE UNIQUE INDEX ux_gl_account_mappings_org_key_active ON gl_account_mappings USING btree (org_id, key) WHERE is_acti |
| `gl_accounts` | `gl_accounts_org_code_uq` | true | CREATE UNIQUE INDEX gl_accounts_org_code_uq ON gl_accounts USING btree (org_id, code) |
| `gl_accounts` | `gl_accounts_org_type_idx` | false | CREATE INDEX gl_accounts_org_type_idx ON gl_accounts USING btree (org_id, type) |
| `gl_accounts` | `gl_accounts_pkey` | true | CREATE UNIQUE INDEX gl_accounts_pkey ON gl_accounts USING btree (id) |
| `gl_accounts` | `ux_gl_accounts_org_code` | true | CREATE UNIQUE INDEX ux_gl_accounts_org_code ON gl_accounts USING btree (org_id, code) WHERE is_active = true |
| `gl_accounts` | `ux_gl_accounts_org_code_active` | true | CREATE UNIQUE INDEX ux_gl_accounts_org_code_active ON gl_accounts USING btree (org_id, code) WHERE is_active = true |
| `gl_journal_entries` | `gl_journal_entries_org_date_idx` | false | CREATE INDEX gl_journal_entries_org_date_idx ON gl_journal_entries USING btree (org_id, entry_date) |
| `gl_journal_entries` | `gl_journal_entries_org_source_idx` | false | CREATE INDEX gl_journal_entries_org_source_idx ON gl_journal_entries USING btree (org_id, source_type, source_id) |
| `gl_journal_entries` | `gl_journal_entries_pkey` | true | CREATE UNIQUE INDEX gl_journal_entries_pkey ON gl_journal_entries USING btree (id) |
| `gl_journal_entries` | `ux_gl_journal_entries_source` | true | CREATE UNIQUE INDEX ux_gl_journal_entries_source ON gl_journal_entries USING btree (org_id, source_type, source_id) WHER |
| `gl_journal_lines` | `gl_journal_lines_entry_idx` | false | CREATE INDEX gl_journal_lines_entry_idx ON gl_journal_lines USING btree (entry_id, line_no) |
| `gl_journal_lines` | `gl_journal_lines_org_account_idx` | false | CREATE INDEX gl_journal_lines_org_account_idx ON gl_journal_lines USING btree (org_id, account_id) |
| `gl_journal_lines` | `gl_journal_lines_org_job_idx` | false | CREATE INDEX gl_journal_lines_org_job_idx ON gl_journal_lines USING btree (org_id, job_id) |
| `gl_journal_lines` | `gl_journal_lines_pkey` | true | CREATE UNIQUE INDEX gl_journal_lines_pkey ON gl_journal_lines USING btree (id) |
| `gl_journal_lines` | `idx_gl_journal_lines_org_billable_source_partial` | false | CREATE INDEX idx_gl_journal_lines_org_billable_source_partial ON gl_journal_lines USING btree (org_id, billable_source_t |
| `gl_journal_lines` | `ux_gl_journal_lines_entry_line` | true | CREATE UNIQUE INDEX ux_gl_journal_lines_entry_line ON gl_journal_lines USING btree (entry_id, line_no) |
| `home_types` | `home_types_key_key` | true | CREATE UNIQUE INDEX home_types_key_key ON home_types USING btree (key) |
| `home_types` | `home_types_pkey` | true | CREATE UNIQUE INDEX home_types_pkey ON home_types USING btree (id) |
| `industries` | `industries_is_active_idx` | false | CREATE INDEX industries_is_active_idx ON industries USING btree (is_active) |
| `industries` | `industries_key_unique` | true | CREATE UNIQUE INDEX industries_key_unique ON industries USING btree (key) |
| `industries` | `industries_pkey` | true | CREATE UNIQUE INDEX industries_pkey ON industries USING btree (id) |
| `industry_default_entity_labels` | `industry_default_entity_labels_entity_type_idx` | false | CREATE INDEX industry_default_entity_labels_entity_type_idx ON industry_default_entity_labels USING btree (entity_type) |
| `industry_default_entity_labels` | `industry_default_entity_labels_industry_id_idx` | false | CREATE INDEX industry_default_entity_labels_industry_id_idx ON industry_default_entity_labels USING btree (industry_id) |
| `industry_default_entity_labels` | `industry_default_entity_labels_pkey` | true | CREATE UNIQUE INDEX industry_default_entity_labels_pkey ON industry_default_entity_labels USING btree (id) |
| `industry_default_entity_labels` | `industry_default_entity_labels_unique` | true | CREATE UNIQUE INDEX industry_default_entity_labels_unique ON industry_default_entity_labels USING btree (industry_id, en |
| `job_line_items` | `idx_job_line_items_active` | false | CREATE INDEX idx_job_line_items_active ON job_line_items USING btree (is_active) |
| `job_line_items` | `idx_job_line_items_job_id` | false | CREATE INDEX idx_job_line_items_job_id ON job_line_items USING btree (job_id) |
| `job_line_items` | `idx_job_line_items_line_type` | false | CREATE INDEX idx_job_line_items_line_type ON job_line_items USING btree (org_id, line_type) |
| `job_line_items` | `idx_job_line_items_org_job` | false | CREATE INDEX idx_job_line_items_org_job ON job_line_items USING btree (org_id, job_id) |
| `job_line_items` | `job_line_items_pkey` | true | CREATE UNIQUE INDEX job_line_items_pkey ON job_line_items USING btree (id) |
| `job_pricing_snapshots` | `idx_job_pricing_snapshots_job_id` | false | CREATE INDEX idx_job_pricing_snapshots_job_id ON job_pricing_snapshots USING btree (job_id) |
| `job_pricing_snapshots` | `idx_job_pricing_snapshots_org_job` | false | CREATE INDEX idx_job_pricing_snapshots_org_job ON job_pricing_snapshots USING btree (org_id, job_id) |
| `job_pricing_snapshots` | `job_pricing_snapshots_pkey` | true | CREATE UNIQUE INDEX job_pricing_snapshots_pkey ON job_pricing_snapshots USING btree (id) |
| `job_statuses` | `job_statuses_key_key` | true | CREATE UNIQUE INDEX job_statuses_key_key ON job_statuses USING btree (key) |
| `job_statuses` | `job_statuses_org_id_idx` | false | CREATE INDEX job_statuses_org_id_idx ON job_statuses USING btree (org_id) |
| `job_statuses` | `job_statuses_pkey` | true | CREATE UNIQUE INDEX job_statuses_pkey ON job_statuses USING btree (id) |
| `job_tags` | `job_tags_pkey` | true | CREATE UNIQUE INDEX job_tags_pkey ON job_tags USING btree (job_id, tag_id) |
| `jobs` | `idx_jobs_archived` | false | CREATE INDEX idx_jobs_archived ON jobs USING btree (org_id, archived_at) |
| `jobs` | `idx_jobs_customer` | false | CREATE INDEX idx_jobs_customer ON jobs USING btree (customer_id) |
| `jobs` | `idx_jobs_customer_vertical_completed` | false | CREATE INDEX idx_jobs_customer_vertical_completed ON jobs USING btree (customer_id, vertical_id, completed_at) |
| `jobs` | `idx_jobs_customer_vertical_created` | false | CREATE INDEX idx_jobs_customer_vertical_created ON jobs USING btree (customer_id, vertical_id, created_at) |
| `jobs` | `idx_jobs_external` | false | CREATE INDEX idx_jobs_external ON jobs USING btree (external_source, external_id) |
| `jobs` | `idx_jobs_is_recurring` | false | CREATE INDEX idx_jobs_is_recurring ON jobs USING btree (is_recurring) |
| `jobs` | `idx_jobs_opportunity` | false | CREATE INDEX idx_jobs_opportunity ON jobs USING btree (opportunity_id) |
| `jobs` | `idx_jobs_org_id` | false | CREATE INDEX idx_jobs_org_id ON jobs USING btree (org_id) |
| `jobs` | `idx_jobs_org_location` | false | CREATE INDEX idx_jobs_org_location ON jobs USING btree (org_id, location_id) |
| `jobs` | `idx_jobs_primary_person` | false | CREATE INDEX idx_jobs_primary_person ON jobs USING btree (primary_person_id) |
| `jobs` | `idx_jobs_status` | false | CREATE INDEX idx_jobs_status ON jobs USING btree (job_status_id) |
| `jobs` | `idx_jobs_work_unit_id` | false | CREATE INDEX idx_jobs_work_unit_id ON jobs USING btree (work_unit_id) WHERE work_unit_id IS NOT NULL |
| `jobs` | `jobs_assigned_vendor_id_idx` | false | CREATE INDEX jobs_assigned_vendor_id_idx ON jobs USING btree (assigned_vendor_id) |
| `jobs` | `jobs_discount_program_id_idx` | false | CREATE INDEX jobs_discount_program_id_idx ON jobs USING btree (discount_program_id) |
| `jobs` | `jobs_org_status_idx` | false | CREATE INDEX jobs_org_status_idx ON jobs USING btree (org_id, status_key) |
| `jobs` | `jobs_pkey` | true | CREATE UNIQUE INDEX jobs_pkey ON jobs USING btree (id) |
| `jobs` | `ux_jobs_org_job_number` | true | CREATE UNIQUE INDEX ux_jobs_org_job_number ON jobs USING btree (org_id, job_number) |
| `ledger_transactions` | `idx_ledger_transactions_org_billable_source_partial` | false | CREATE INDEX idx_ledger_transactions_org_billable_source_partial ON ledger_transactions USING btree (org_id, billable_so |
| `ledger_transactions` | `ledger_transactions_pkey` | true | CREATE UNIQUE INDEX ledger_transactions_pkey ON ledger_transactions USING btree (id) |
| `ledger_transactions` | `ledger_tx_org_job_idx` | false | CREATE INDEX ledger_tx_org_job_idx ON ledger_transactions USING btree (org_id, job_id) |
| `ledger_transactions` | `ledger_tx_org_occurred_idx` | false | CREATE INDEX ledger_tx_org_occurred_idx ON ledger_transactions USING btree (org_id, occurred_at) |
| `ledger_transactions` | `ux_ledger_transactions_provider_ref` | true | CREATE UNIQUE INDEX ux_ledger_transactions_provider_ref ON ledger_transactions USING btree (org_id, provider, provider_r |
| `location_program_categories` | `idx_location_program_categories_org_key` | false | CREATE INDEX idx_location_program_categories_org_key ON location_program_categories USING btree (org_id, key) |
| `location_program_categories` | `idx_location_program_categories_org_location` | false | CREATE INDEX idx_location_program_categories_org_location ON location_program_categories USING btree (org_id, location_i |
| `location_program_categories` | `location_program_categories_org_location_key_unique` | true | CREATE UNIQUE INDEX location_program_categories_org_location_key_unique ON location_program_categories USING btree (org_ |
| `location_program_categories` | `location_program_categories_pkey` | true | CREATE UNIQUE INDEX location_program_categories_pkey ON location_program_categories USING btree (id) |
| `location_tags` | `location_tags_pkey` | true | CREATE UNIQUE INDEX location_tags_pkey ON location_tags USING btree (location_id, tag_id) |
| `location_types` | `location_types_is_active_idx` | false | CREATE INDEX location_types_is_active_idx ON location_types USING btree (org_id, is_active) |
| `location_types` | `location_types_org_id_idx` | false | CREATE INDEX location_types_org_id_idx ON location_types USING btree (org_id) |
| `location_types` | `location_types_pkey` | true | CREATE UNIQUE INDEX location_types_pkey ON location_types USING btree (id) |
| `location_types` | `location_types_unique` | true | CREATE UNIQUE INDEX location_types_unique ON location_types USING btree (org_id, key) |
| `locations` | `idx_locations_customer_id` | false | CREATE INDEX idx_locations_customer_id ON locations USING btree (customer_id) |
| `locations` | `idx_locations_external` | false | CREATE INDEX idx_locations_external ON locations USING btree (external_source, external_id) |
| `locations` | `idx_locations_org_customer` | false | CREATE INDEX idx_locations_org_customer ON locations USING btree (org_id, customer_id) |
| `locations` | `idx_locations_org_id` | false | CREATE INDEX idx_locations_org_id ON locations USING btree (org_id) |
| `locations` | `idx_locations_org_parent` | false | CREATE INDEX idx_locations_org_parent ON locations USING btree (org_id, parent_location_id) |
| `locations` | `idx_locations_org_status_key` | false | CREATE INDEX idx_locations_org_status_key ON locations USING btree (org_id, status_key) |
| `locations` | `idx_locations_org_type` | false | CREATE INDEX idx_locations_org_type ON locations USING btree (org_id, location_type) |
| `locations` | `idx_locations_org_vendor` | false | CREATE INDEX idx_locations_org_vendor ON locations USING btree (org_id, vendor_id) |
| `locations` | `locations_location_type_id_idx` | false | CREATE INDEX locations_location_type_id_idx ON locations USING btree (org_id, location_type_id) |
| `locations` | `locations_pkey` | true | CREATE UNIQUE INDEX locations_pkey ON locations USING btree (id) |
| `locations` | `ux_locations_org_location_number` | true | CREATE UNIQUE INDEX ux_locations_org_location_number ON locations USING btree (org_id, location_number) |
| `messages_outbox` | `messages_outbox_dedupe_key_uq` | true | CREATE UNIQUE INDEX messages_outbox_dedupe_key_uq ON messages_outbox USING btree (dedupe_key) WHERE dedupe_key IS NOT NU |
| `messages_outbox` | `messages_outbox_org_created_idx` | false | CREATE INDEX messages_outbox_org_created_idx ON messages_outbox USING btree (org_id, created_at DESC) |
| `messages_outbox` | `messages_outbox_pkey` | true | CREATE UNIQUE INDEX messages_outbox_pkey ON messages_outbox USING btree (id) |
| `messages_outbox` | `messages_outbox_status_idx` | false | CREATE INDEX messages_outbox_status_idx ON messages_outbox USING btree (status, created_at DESC) |
| `messages` | `idx_messages_contact` | false | CREATE INDEX idx_messages_contact ON messages USING btree (contact_id) |
| `messages` | `idx_messages_contact_created` | false | CREATE INDEX idx_messages_contact_created ON messages USING btree (contact_id, created_at DESC) |
| `messages` | `idx_messages_created_at` | false | CREATE INDEX idx_messages_created_at ON messages USING btree (created_at DESC) |
| `messages` | `idx_messages_customer` | false | CREATE INDEX idx_messages_customer ON messages USING btree (customer_id, created_at DESC) |
| `messages` | `idx_messages_job` | false | CREATE INDEX idx_messages_job ON messages USING btree (job_id) |
| `messages` | `idx_messages_opportunity` | false | CREATE INDEX idx_messages_opportunity ON messages USING btree (opportunity_id, created_at DESC) |
| `messages` | `idx_messages_related` | false | CREATE INDEX idx_messages_related ON messages USING btree (related_entity_type, related_entity_id) |
| `messages` | `idx_messages_status` | false | CREATE INDEX idx_messages_status ON messages USING btree (status, created_at DESC) |
| `messages` | `idx_messages_workflow_run` | false | CREATE INDEX idx_messages_workflow_run ON messages USING btree (workflow_run_id) |
| `messages` | `messages_pkey` | true | CREATE UNIQUE INDEX messages_pkey ON messages USING btree (id) |
| `metric_definitions` | `idx_metric_definitions_global_key` | true | CREATE UNIQUE INDEX idx_metric_definitions_global_key ON metric_definitions USING btree (key) WHERE org_id IS NULL |
| `metric_definitions` | `idx_metric_definitions_org_key` | true | CREATE UNIQUE INDEX idx_metric_definitions_org_key ON metric_definitions USING btree (org_id, key) WHERE org_id IS NOT N |
| `metric_definitions` | `idx_metric_definitions_org_status` | false | CREATE INDEX idx_metric_definitions_org_status ON metric_definitions USING btree (org_id, status) |
| `metric_definitions` | `metric_definitions_pkey` | true | CREATE UNIQUE INDEX metric_definitions_pkey ON metric_definitions USING btree (id) |
| `metric_placements` | `idx_metric_placements_org_surface` | false | CREATE INDEX idx_metric_placements_org_surface ON metric_placements USING btree (org_id, surface, surface_key, placement |
| `metric_placements` | `idx_metric_placements_visualization` | false | CREATE INDEX idx_metric_placements_visualization ON metric_placements USING btree (visualization_id) |
| `metric_placements` | `metric_placements_pkey` | true | CREATE UNIQUE INDEX metric_placements_pkey ON metric_placements USING btree (id) |
| `metric_platform_snapshots` | `idx_metric_platform_snapshots_def_computed` | false | CREATE INDEX idx_metric_platform_snapshots_def_computed ON metric_platform_snapshots USING btree (metric_definition_id,  |
| `metric_platform_snapshots` | `idx_metric_platform_snapshots_org_context` | false | CREATE INDEX idx_metric_platform_snapshots_org_context ON metric_platform_snapshots USING btree (org_id, context_type, c |
| `metric_platform_snapshots` | `idx_metric_platform_snapshots_org_def_period` | false | CREATE INDEX idx_metric_platform_snapshots_org_def_period ON metric_platform_snapshots USING btree (org_id, metric_defin |
| `metric_platform_snapshots` | `metric_platform_snapshots_pkey` | true | CREATE UNIQUE INDEX metric_platform_snapshots_pkey ON metric_platform_snapshots USING btree (id) |
| `metric_rollups` | `idx_metric_rollups_org_key` | true | CREATE UNIQUE INDEX idx_metric_rollups_org_key ON metric_rollups USING btree (org_id, key) |
| `metric_rollups` | `metric_rollups_pkey` | true | CREATE UNIQUE INDEX metric_rollups_pkey ON metric_rollups USING btree (id) |
| `metric_snapshots` | `idx_metric_snapshots_org_computed` | false | CREATE INDEX idx_metric_snapshots_org_computed ON metric_snapshots USING btree (org_id, computed_at DESC) |
| `metric_snapshots` | `idx_metric_snapshots_org_metric_computed` | false | CREATE INDEX idx_metric_snapshots_org_metric_computed ON metric_snapshots USING btree (org_id, metric_key, computed_at D |
| `metric_snapshots` | `idx_metric_snapshots_org_metric_scope` | false | CREATE INDEX idx_metric_snapshots_org_metric_scope ON metric_snapshots USING btree (org_id, metric_key, scope_type, scop |
| `metric_snapshots` | `metric_snapshots_pkey` | true | CREATE UNIQUE INDEX metric_snapshots_pkey ON metric_snapshots USING btree (id) |
| `metric_visualizations` | `idx_metric_visualizations_org_key` | true | CREATE UNIQUE INDEX idx_metric_visualizations_org_key ON metric_visualizations USING btree (org_id, key) WHERE org_id IS |
| `metric_visualizations` | `idx_metric_visualizations_org_metric` | false | CREATE INDEX idx_metric_visualizations_org_metric ON metric_visualizations USING btree (org_id, metric_definition_id) |
| `metric_visualizations` | `metric_visualizations_pkey` | true | CREATE UNIQUE INDEX metric_visualizations_pkey ON metric_visualizations USING btree (id) |
| `operational_tasks` | `idx_operational_tasks_org_due_open` | false | CREATE INDEX idx_operational_tasks_org_due_open ON operational_tasks USING btree (org_id, due_at) WHERE status = 'open': |
| `operational_tasks` | `idx_operational_tasks_org_entity_status` | false | CREATE INDEX idx_operational_tasks_org_entity_status ON operational_tasks USING btree (org_id, entity_type, entity_id, s |
| `operational_tasks` | `operational_tasks_pkey` | true | CREATE UNIQUE INDEX operational_tasks_pkey ON operational_tasks USING btree (id) |
| `opportunities` | `idx_opportunities_org_id` | false | CREATE INDEX idx_opportunities_org_id ON opportunities USING btree (org_id) |
| `opportunities` | `idx_opportunities_org_work_unit_updated` | false | CREATE INDEX idx_opportunities_org_work_unit_updated ON opportunities USING btree (org_id, work_unit_id, updated_at DESC |
| `opportunities` | `idx_opportunities_primary_person` | false | CREATE INDEX idx_opportunities_primary_person ON opportunities USING btree (primary_person_id) |
| `opportunities` | `idx_opportunities_work_unit_id` | false | CREATE INDEX idx_opportunities_work_unit_id ON opportunities USING btree (work_unit_id) |
| `opportunities` | `idx_opps_contact` | false | CREATE INDEX idx_opps_contact ON opportunities USING btree (primary_contact_id) |
| `opportunities` | `idx_opps_customer` | false | CREATE INDEX idx_opps_customer ON opportunities USING btree (customer_id) |
| `opportunities` | `idx_opps_external` | false | CREATE INDEX idx_opps_external ON opportunities USING btree (external_source, external_id) |
| `opportunities` | `idx_opps_stage` | false | CREATE INDEX idx_opps_stage ON opportunities USING btree (pipeline_stage_id) |
| `opportunities` | `opportunities_discount_program_id_idx` | false | CREATE INDEX opportunities_discount_program_id_idx ON opportunities USING btree (discount_program_id) |
| `opportunities` | `opportunities_org_status_idx` | false | CREATE INDEX opportunities_org_status_idx ON opportunities USING btree (org_id, status_key) |
| `opportunities` | `opportunities_pkey` | true | CREATE UNIQUE INDEX opportunities_pkey ON opportunities USING btree (id) |
| `opportunities` | `ux_opportunities_org_opportunity_number` | true | CREATE UNIQUE INDEX ux_opportunities_org_opportunity_number ON opportunities USING btree (org_id, opportunity_number) |
| `opportunity_customer_members` | `idx_opportunity_customer_members_desired_program_category` | false | CREATE INDEX idx_opportunity_customer_members_desired_program_category ON opportunity_customer_members USING btree (org_ |
| `opportunity_customer_members` | `idx_opportunity_customer_members_org_customer_member` | false | CREATE INDEX idx_opportunity_customer_members_org_customer_member ON opportunity_customer_members USING btree (org_id, c |
| `opportunity_customer_members` | `idx_opportunity_customer_members_org_location` | false | CREATE INDEX idx_opportunity_customer_members_org_location ON opportunity_customer_members USING btree (org_id, location |
| `opportunity_customer_members` | `idx_opportunity_customer_members_org_opportunity` | false | CREATE INDEX idx_opportunity_customer_members_org_opportunity ON opportunity_customer_members USING btree (org_id, oppor |
| `opportunity_customer_members` | `idx_opportunity_customer_members_org_outcome_status` | false | CREATE INDEX idx_opportunity_customer_members_org_outcome_status ON opportunity_customer_members USING btree (org_id, ou |
| `opportunity_customer_members` | `opportunity_customer_members_pkey` | true | CREATE UNIQUE INDEX opportunity_customer_members_pkey ON opportunity_customer_members USING btree (id) |
| `opportunity_customer_members` | `uq_opportunity_customer_members_unique` | true | CREATE UNIQUE INDEX uq_opportunity_customer_members_unique ON opportunity_customer_members USING btree (org_id, opportun |
| `opportunity_persons` | `idx_opportunity_persons_org_opportunity` | false | CREATE INDEX idx_opportunity_persons_org_opportunity ON opportunity_persons USING btree (org_id, opportunity_id) |
| `opportunity_persons` | `idx_opportunity_persons_org_person` | false | CREATE INDEX idx_opportunity_persons_org_person ON opportunity_persons USING btree (org_id, person_id) |
| `opportunity_persons` | `opportunity_persons_pkey` | true | CREATE UNIQUE INDEX opportunity_persons_pkey ON opportunity_persons USING btree (id) |
| `opportunity_persons` | `uq_opportunity_persons_opp_person` | true | CREATE UNIQUE INDEX uq_opportunity_persons_opp_person ON opportunity_persons USING btree (opportunity_id, person_id) |
| `opportunity_tags` | `opportunity_tags_pkey` | true | CREATE UNIQUE INDEX opportunity_tags_pkey ON opportunity_tags USING btree (opportunity_id, tag_id) |
| `option_set_items` | `idx_option_set_items_set_id` | false | CREATE INDEX idx_option_set_items_set_id ON option_set_items USING btree (option_set_id) |
| `option_set_items` | `option_set_items_pkey` | true | CREATE UNIQUE INDEX option_set_items_pkey ON option_set_items USING btree (id) |
| `option_set_items` | `option_set_items_set_item_key` | true | CREATE UNIQUE INDEX option_set_items_set_item_key ON option_set_items USING btree (option_set_id, item_key) |
| `option_sets` | `idx_option_sets_org_id` | false | CREATE INDEX idx_option_sets_org_id ON option_sets USING btree (org_id) |
| `option_sets` | `option_sets_org_set_key` | true | CREATE UNIQUE INDEX option_sets_org_set_key ON option_sets USING btree (org_id, set_key) |
| `option_sets` | `option_sets_pkey` | true | CREATE UNIQUE INDEX option_sets_pkey ON option_sets USING btree (id) |
| `org_settings` | `org_settings_org_id_key` | true | CREATE UNIQUE INDEX org_settings_org_id_key ON org_settings USING btree (org_id) |
| `org_settings` | `org_settings_org_idx` | false | CREATE INDEX org_settings_org_idx ON org_settings USING btree (org_id) |
| `org_settings` | `org_settings_pkey` | true | CREATE UNIQUE INDEX org_settings_pkey ON org_settings USING btree (id) |
| `orgs` | `orgs_industry_id_idx` | false | CREATE INDEX orgs_industry_id_idx ON orgs USING btree (industry_id) |
| `orgs` | `orgs_pkey` | true | CREATE UNIQUE INDEX orgs_pkey ON orgs USING btree (id) |
| `orgs` | `orgs_slug_key` | true | CREATE UNIQUE INDEX orgs_slug_key ON orgs USING btree (slug) |
| `payment_allocations` | `idx_payment_allocations_org_allocated_at` | false | CREATE INDEX idx_payment_allocations_org_allocated_at ON payment_allocations USING btree (org_id, allocated_at DESC) |
| `payment_allocations` | `idx_payment_allocations_org_charge_id_partial` | false | CREATE INDEX idx_payment_allocations_org_charge_id_partial ON payment_allocations USING btree (org_id, charge_id) WHERE  |
| `payment_allocations` | `idx_payment_allocations_org_payment` | false | CREATE INDEX idx_payment_allocations_org_payment ON payment_allocations USING btree (org_id, payment_id) |
| `payment_allocations` | `idx_payment_allocations_org_status_target` | false | CREATE INDEX idx_payment_allocations_org_status_target ON payment_allocations USING btree (org_id, status, target_entity |
| `payment_allocations` | `idx_payment_allocations_org_target` | false | CREATE INDEX idx_payment_allocations_org_target ON payment_allocations USING btree (org_id, target_entity_type, target_e |
| `payment_allocations` | `payment_allocations_pkey` | true | CREATE UNIQUE INDEX payment_allocations_pkey ON payment_allocations USING btree (id) |
| `payment_statuses` | `payment_statuses_key_key` | true | CREATE UNIQUE INDEX payment_statuses_key_key ON payment_statuses USING btree (key) |
| `payment_statuses` | `payment_statuses_pkey` | true | CREATE UNIQUE INDEX payment_statuses_pkey ON payment_statuses USING btree (id) |
| `payments` | `idx_payments_customer` | false | CREATE INDEX idx_payments_customer ON payments USING btree (customer_id) |
| `payments` | `idx_payments_job` | false | CREATE INDEX idx_payments_job ON payments USING btree (job_id) |
| `payments` | `idx_payments_org_customer_received_at` | false | CREATE INDEX idx_payments_org_customer_received_at ON payments USING btree (org_id, customer_id, received_at DESC) WHERE |
| `payments` | `idx_payments_org_id` | false | CREATE INDEX idx_payments_org_id ON payments USING btree (org_id) |
| `payments` | `idx_payments_org_payer_entity` | false | CREATE INDEX idx_payments_org_payer_entity ON payments USING btree (org_id, payer_entity_type, payer_entity_id) WHERE pa |
| `payments` | `idx_payments_org_posted_at` | false | CREATE INDEX idx_payments_org_posted_at ON payments USING btree (org_id, posted_at DESC) |
| `payments` | `idx_payments_org_status_received_at` | false | CREATE INDEX idx_payments_org_status_received_at ON payments USING btree (org_id, status, received_at DESC) |
| `payments` | `idx_payments_posted_to_ledger` | false | CREATE INDEX idx_payments_posted_to_ledger ON payments USING btree (org_id, posted_to_ledger_at) |
| `payments` | `idx_payments_processor_transaction` | false | CREATE INDEX idx_payments_processor_transaction ON payments USING btree (processor, processor_transaction_id) WHERE proc |
| `payments` | `idx_payments_provider` | false | CREATE INDEX idx_payments_provider ON payments USING btree (provider, provider_payment_id) |
| `payments` | `idx_payments_status` | false | CREATE INDEX idx_payments_status ON payments USING btree (payment_status_id) |
| `payments` | `payments_org_status_idx` | false | CREATE INDEX payments_org_status_idx ON payments USING btree (org_id, status_key) |
| `payments` | `payments_pkey` | true | CREATE UNIQUE INDEX payments_pkey ON payments USING btree (id) |
| `permission_definitions` | `permission_definitions_group_key_idx` | false | CREATE INDEX permission_definitions_group_key_idx ON permission_definitions USING btree (group_key) |
| `permission_definitions` | `permission_definitions_is_active_idx` | false | CREATE INDEX permission_definitions_is_active_idx ON permission_definitions USING btree (is_active) |
| `permission_definitions` | `permission_definitions_key_key` | true | CREATE UNIQUE INDEX permission_definitions_key_key ON permission_definitions USING btree (key) |
| `permission_definitions` | `permission_definitions_pkey` | true | CREATE UNIQUE INDEX permission_definitions_pkey ON permission_definitions USING btree (id) |
| `permission_keys` | `permission_keys_pkey` | true | CREATE UNIQUE INDEX permission_keys_pkey ON permission_keys USING btree (key) |
| `permissions` | `permissions_pkey` | true | CREATE UNIQUE INDEX permissions_pkey ON permissions USING btree (key) |
| `person_locations` | `idx_person_locations_location` | false | CREATE INDEX idx_person_locations_location ON person_locations USING btree (location_id) |
| `person_locations` | `idx_person_locations_org` | false | CREATE INDEX idx_person_locations_org ON person_locations USING btree (org_id) |
| `person_locations` | `idx_person_locations_person` | false | CREATE INDEX idx_person_locations_person ON person_locations USING btree (person_id) |
| `person_locations` | `person_locations_pkey` | true | CREATE UNIQUE INDEX person_locations_pkey ON person_locations USING btree (id) |
| `person_locations` | `uq_person_locations_person_location` | true | CREATE UNIQUE INDEX uq_person_locations_person_location ON person_locations USING btree (person_id, location_id) |
| `person_relationship_type_settings` | `idx_person_relationship_type_settings_active` | false | CREATE INDEX idx_person_relationship_type_settings_active ON person_relationship_type_settings USING btree (org_id, is_a |
| `person_relationship_type_settings` | `idx_person_relationship_type_settings_industry_id` | false | CREATE INDEX idx_person_relationship_type_settings_industry_id ON person_relationship_type_settings USING btree (industr |
| `person_relationship_type_settings` | `idx_person_relationship_type_settings_org_id` | false | CREATE INDEX idx_person_relationship_type_settings_org_id ON person_relationship_type_settings USING btree (org_id) |
| `person_relationship_type_settings` | `idx_person_relationship_type_settings_vertical_id` | false | CREATE INDEX idx_person_relationship_type_settings_vertical_id ON person_relationship_type_settings USING btree (vertica |
| `person_relationship_type_settings` | `person_relationship_type_settings_pkey` | true | CREATE UNIQUE INDEX person_relationship_type_settings_pkey ON person_relationship_type_settings USING btree (id) |
| `person_relationship_type_settings` | `uq_person_relationship_type_settings_scope_key` | true | CREATE UNIQUE INDEX uq_person_relationship_type_settings_scope_key ON person_relationship_type_settings USING btree (org |
| `person_relationships` | `idx_person_relationships_from_person_id` | false | CREATE INDEX idx_person_relationships_from_person_id ON person_relationships USING btree (from_person_id) |
| `person_relationships` | `idx_person_relationships_org_id` | false | CREATE INDEX idx_person_relationships_org_id ON person_relationships USING btree (org_id) |
| `person_relationships` | `idx_person_relationships_to_person_id` | false | CREATE INDEX idx_person_relationships_to_person_id ON person_relationships USING btree (to_person_id) |
| `person_relationships` | `person_relationships_pkey` | true | CREATE UNIQUE INDEX person_relationships_pkey ON person_relationships USING btree (id) |
| `person_relationships` | `uq_person_relationships_unique` | true | CREATE UNIQUE INDEX uq_person_relationships_unique ON person_relationships USING btree (org_id, from_person_id, to_perso |
| `persons` | `idx_persons_email` | false | CREATE INDEX idx_persons_email ON persons USING btree (email) |
| `persons` | `idx_persons_full_name` | false | CREATE INDEX idx_persons_full_name ON persons USING btree (full_name) |
| `persons` | `idx_persons_org_id` | false | CREATE INDEX idx_persons_org_id ON persons USING btree (org_id) |
| `persons` | `idx_persons_phone` | false | CREATE INDEX idx_persons_phone ON persons USING btree (phone) |
| `persons` | `persons_pkey` | true | CREATE UNIQUE INDEX persons_pkey ON persons USING btree (id) |
| `persons` | `ux_persons_org_person_number` | true | CREATE UNIQUE INDEX ux_persons_org_person_number ON persons USING btree (org_id, person_number) |
| `pipeline_stages` | `idx_pipeline_stages_org_key` | false | CREATE INDEX idx_pipeline_stages_org_key ON pipeline_stages USING btree (org_id, key) WHERE key IS NOT NULL |
| `pipeline_stages` | `pipeline_stages_org_id_idx` | false | CREATE INDEX pipeline_stages_org_id_idx ON pipeline_stages USING btree (org_id) |
| `pipeline_stages` | `pipeline_stages_pipeline_id_ghl_stage_uuid_key` | true | CREATE UNIQUE INDEX pipeline_stages_pipeline_id_ghl_stage_uuid_key ON pipeline_stages USING btree (pipeline_id, ghl_stag |
| `pipeline_stages` | `pipeline_stages_pkey` | true | CREATE UNIQUE INDEX pipeline_stages_pkey ON pipeline_stages USING btree (id) |
| `pipeline_stages` | `ux_pipeline_stages_org_key` | true | CREATE UNIQUE INDEX ux_pipeline_stages_org_key ON pipeline_stages USING btree (org_id, key) WHERE key IS NOT NULL |
| `pipelines` | `pipelines_ghl_pipeline_id_key` | true | CREATE UNIQUE INDEX pipelines_ghl_pipeline_id_key ON pipelines USING btree (ghl_pipeline_id) |
| `pipelines` | `pipelines_org_id_idx` | false | CREATE INDEX pipelines_org_id_idx ON pipelines USING btree (org_id) |
| `pipelines` | `pipelines_pkey` | true | CREATE UNIQUE INDEX pipelines_pkey ON pipelines USING btree (id) |
| `placement_candidates` | `idx_placement_candidates_org_cohort_status` | false | CREATE INDEX idx_placement_candidates_org_cohort_status ON placement_candidates USING btree (org_id, program_room_cohort |
| `placement_candidates` | `idx_placement_candidates_org_customer_member` | false | CREATE INDEX idx_placement_candidates_org_customer_member ON placement_candidates USING btree (org_id, customer_member_i |
| `placement_candidates` | `idx_placement_candidates_org_ocm` | false | CREATE INDEX idx_placement_candidates_org_ocm ON placement_candidates USING btree (org_id, opportunity_customer_member_i |
| `placement_candidates` | `idx_placement_candidates_org_opportunity` | false | CREATE INDEX idx_placement_candidates_org_opportunity ON placement_candidates USING btree (org_id, opportunity_id) |
| `placement_candidates` | `idx_placement_candidates_org_status` | false | CREATE INDEX idx_placement_candidates_org_status ON placement_candidates USING btree (org_id, status) |
| `placement_candidates` | `idx_placement_candidates_org_status_opportunity` | false | CREATE INDEX idx_placement_candidates_org_status_opportunity ON placement_candidates USING btree (org_id, status, opport |
| `placement_candidates` | `placement_candidates_pkey` | true | CREATE UNIQUE INDEX placement_candidates_pkey ON placement_candidates USING btree (id) |
| `placement_candidates` | `ux_placement_candidates_ocm_cohort_active` | true | CREATE UNIQUE INDEX ux_placement_candidates_ocm_cohort_active ON placement_candidates USING btree (org_id, opportunity_c |
| `placement_candidates` | `ux_placement_candidates_org_seed_key` | true | CREATE UNIQUE INDEX ux_placement_candidates_org_seed_key ON placement_candidates USING btree (org_id, seed_key) WHERE se |
| `placement_candidates` | `ux_placement_candidates_synthetic_cohort_active` | true | CREATE UNIQUE INDEX ux_placement_candidates_synthetic_cohort_active ON placement_candidates USING btree (org_id, opportu |
| `placement_link_group_members` | `idx_placement_link_group_members_org_candidate` | false | CREATE INDEX idx_placement_link_group_members_org_candidate ON placement_link_group_members USING btree (org_id, placeme |
| `placement_link_group_members` | `idx_placement_link_group_members_org_group` | false | CREATE INDEX idx_placement_link_group_members_org_group ON placement_link_group_members USING btree (org_id, placement_l |
| `placement_link_group_members` | `placement_link_group_members_pkey` | true | CREATE UNIQUE INDEX placement_link_group_members_pkey ON placement_link_group_members USING btree (id) |
| `placement_link_group_members` | `uq_placement_link_group_members_group_candidate` | true | CREATE UNIQUE INDEX uq_placement_link_group_members_group_candidate ON placement_link_group_members USING btree (placeme |
| `placement_link_groups` | `idx_placement_link_groups_org_opportunity` | false | CREATE INDEX idx_placement_link_groups_org_opportunity ON placement_link_groups USING btree (org_id, opportunity_id) |
| `placement_link_groups` | `placement_link_groups_pkey` | true | CREATE UNIQUE INDEX placement_link_groups_pkey ON placement_link_groups USING btree (id) |
| `placement_overrides` | `idx_placement_overrides_org_candidate` | false | CREATE INDEX idx_placement_overrides_org_candidate ON placement_overrides USING btree (org_id, placement_candidate_id) |
| `placement_overrides` | `idx_placement_overrides_org_cohort_active` | false | CREATE INDEX idx_placement_overrides_org_cohort_active ON placement_overrides USING btree (org_id, program_room_cohort_k |
| `placement_overrides` | `placement_overrides_pkey` | true | CREATE UNIQUE INDEX placement_overrides_pkey ON placement_overrides USING btree (id) |
| `placement_overrides` | `ux_placement_overrides_one_active_pin` | true | CREATE UNIQUE INDEX ux_placement_overrides_one_active_pin ON placement_overrides USING btree (org_id, placement_candidat |
| `pricing_addons` | `idx_addons_unique` | true | CREATE UNIQUE INDEX idx_addons_unique ON pricing_addons USING btree (vertical_id, addon_key) |
| `pricing_addons` | `pricing_addons_pkey` | true | CREATE UNIQUE INDEX pricing_addons_pkey ON pricing_addons USING btree (id) |
| `pricing_addons` | `pricing_addons_vertical_key_uniq` | true | CREATE UNIQUE INDEX pricing_addons_vertical_key_uniq ON pricing_addons USING btree (vertical_id, addon_key) |
| `pricing_addons` | `ux_pricing_addons_vertical_addon_key` | true | CREATE UNIQUE INDEX ux_pricing_addons_vertical_addon_key ON pricing_addons USING btree (vertical_id, addon_key) |
| `pricing_dimension_values` | `pricing_dimension_values_pkey` | true | CREATE UNIQUE INDEX pricing_dimension_values_pkey ON pricing_dimension_values USING btree (id) |
| `pricing_dimension_values` | `ux_pricing_dimension_values_key` | true | CREATE UNIQUE INDEX ux_pricing_dimension_values_key ON pricing_dimension_values USING btree (dimension_id, value_key) |
| `pricing_dimensions` | `pricing_dimensions_pkey` | true | CREATE UNIQUE INDEX pricing_dimensions_pkey ON pricing_dimensions USING btree (id) |
| `pricing_dimensions` | `ux_pricing_dimensions_vertical_key` | true | CREATE UNIQUE INDEX ux_pricing_dimensions_vertical_key ON pricing_dimensions USING btree (vertical_id, dimension_key) |
| `pricing_first_clean_prices` | `idx_first_clean_unique` | true | CREATE UNIQUE INDEX idx_first_clean_unique ON pricing_first_clean_prices USING btree (vertical_id, sqft_tier_id) |
| `pricing_first_clean_prices` | `pricing_first_clean_prices_pkey` | true | CREATE UNIQUE INDEX pricing_first_clean_prices_pkey ON pricing_first_clean_prices USING btree (id) |
| `pricing_first_clean_prices` | `pricing_first_clean_unique` | true | CREATE UNIQUE INDEX pricing_first_clean_unique ON pricing_first_clean_prices USING btree (vertical_id, service_id, sqft_ |
| `pricing_first_clean_prices` | `ux_first_clean_prices` | true | CREATE UNIQUE INDEX ux_first_clean_prices ON pricing_first_clean_prices USING btree (vertical_id, service_id, sqft_tier_ |
| `pricing_first_clean_prices` | `ux_first_clean_vertical_service_sqft` | true | CREATE UNIQUE INDEX ux_first_clean_vertical_service_sqft ON pricing_first_clean_prices USING btree (vertical_id, service |
| `pricing_first_clean_prices` | `ux_pricing_first_clean_unique` | true | CREATE UNIQUE INDEX ux_pricing_first_clean_unique ON pricing_first_clean_prices USING btree (vertical_id, sqft_tier_id,  |
| `pricing_frequencies` | `idx_pricing_freq_unique` | true | CREATE UNIQUE INDEX idx_pricing_freq_unique ON pricing_frequencies USING btree (vertical_id, frequency_key) |
| `pricing_frequencies` | `pricing_frequencies_pkey` | true | CREATE UNIQUE INDEX pricing_frequencies_pkey ON pricing_frequencies USING btree (id) |
| `pricing_frequencies` | `pricing_frequencies_recur_idx` | false | CREATE INDEX pricing_frequencies_recur_idx ON pricing_frequencies USING btree (recurrence_unit, recurrence_interval) |
| `pricing_frequencies` | `ux_pricing_freq_vertical_key` | true | CREATE UNIQUE INDEX ux_pricing_freq_vertical_key ON pricing_frequencies USING btree (vertical_id, frequency_key) |
| `pricing_matrix` | `pricing_matrix_dimension_idx` | false | CREATE INDEX pricing_matrix_dimension_idx ON pricing_matrix USING btree (pricing_dimension_value_id) |
| `pricing_matrix` | `pricing_matrix_mode_idx` | false | CREATE INDEX pricing_matrix_mode_idx ON pricing_matrix USING btree (pricing_mode_id) |
| `pricing_matrix` | `pricing_matrix_org_idx` | false | CREATE INDEX pricing_matrix_org_idx ON pricing_matrix USING btree (org_id) |
| `pricing_matrix` | `pricing_matrix_pkey` | true | CREATE UNIQUE INDEX pricing_matrix_pkey ON pricing_matrix USING btree (id) |
| `pricing_matrix` | `pricing_matrix_plan_idx` | false | CREATE INDEX pricing_matrix_plan_idx ON pricing_matrix USING btree (service_plan_template_id) |
| `pricing_matrix` | `pricing_matrix_vertical_idx` | false | CREATE INDEX pricing_matrix_vertical_idx ON pricing_matrix USING btree (vertical_id) |
| `pricing_matrix` | `uq_pricing_matrix_lookup` | true | CREATE UNIQUE INDEX uq_pricing_matrix_lookup ON pricing_matrix USING btree (org_id, vertical_id, service_offering_id, CO |
| `pricing_matrix` | `uq_pricing_matrix_source` | true | CREATE UNIQUE INDEX uq_pricing_matrix_source ON pricing_matrix USING btree (source_table, source_id) |
| `pricing_matrix` | `ux_pricing_matrix_rule` | true | CREATE UNIQUE INDEX ux_pricing_matrix_rule ON pricing_matrix USING btree (vertical_id, service_offering_id, service_plan |
| `pricing_modes` | `pricing_modes_pkey` | true | CREATE UNIQUE INDEX pricing_modes_pkey ON pricing_modes USING btree (id) |
| `pricing_modes` | `ux_pricing_modes_vertical_key` | true | CREATE UNIQUE INDEX ux_pricing_modes_vertical_key ON pricing_modes USING btree (vertical_id, mode_key) |
| `pricing_recurring_prices` | `idx_recurring_unique` | true | CREATE UNIQUE INDEX idx_recurring_unique ON pricing_recurring_prices USING btree (vertical_id, frequency_id, sqft_tier_i |
| `pricing_recurring_prices` | `pricing_recurring_prices_pkey` | true | CREATE UNIQUE INDEX pricing_recurring_prices_pkey ON pricing_recurring_prices USING btree (id) |
| `pricing_recurring_prices` | `ux_pricing_recurring_unique` | true | CREATE UNIQUE INDEX ux_pricing_recurring_unique ON pricing_recurring_prices USING btree (vertical_id, frequency_id, sqft |
| `pricing_recurring_prices` | `ux_recurring_prices` | true | CREATE UNIQUE INDEX ux_recurring_prices ON pricing_recurring_prices USING btree (vertical_id, service_id, frequency_id,  |
| `pricing_recurring_prices` | `ux_recurring_vertical_frequency_sqft` | true | CREATE UNIQUE INDEX ux_recurring_vertical_frequency_sqft ON pricing_recurring_prices USING btree (vertical_id, frequency |
| `pricing_services` | `idx_pricing_services_unique` | true | CREATE UNIQUE INDEX idx_pricing_services_unique ON pricing_services USING btree (vertical_id, service_key) |
| `pricing_services` | `pricing_services_pkey` | true | CREATE UNIQUE INDEX pricing_services_pkey ON pricing_services USING btree (id) |
| `pricing_services` | `pricing_services_unique_vertical_service` | true | CREATE UNIQUE INDEX pricing_services_unique_vertical_service ON pricing_services USING btree (vertical_id, service_key) |
| `pricing_square_footage_tiers` | `idx_pricing_tier_unique` | true | CREATE UNIQUE INDEX idx_pricing_tier_unique ON pricing_square_footage_tiers USING btree (vertical_id, tier_key) |
| `pricing_square_footage_tiers` | `pricing_square_footage_tiers_pkey` | true | CREATE UNIQUE INDEX pricing_square_footage_tiers_pkey ON pricing_square_footage_tiers USING btree (id) |
| `processing_case_sources` | `idx_pcs_case` | false | CREATE INDEX idx_pcs_case ON processing_case_sources USING btree (processing_case_id) |
| `processing_case_sources` | `idx_pcs_org_source` | false | CREATE INDEX idx_pcs_org_source ON processing_case_sources USING btree (org_id, source_kind, source_id) |
| `processing_case_sources` | `processing_case_sources_pkey` | true | CREATE UNIQUE INDEX processing_case_sources_pkey ON processing_case_sources USING btree (id) |
| `processing_case_sources` | `uq_pcs_one_primary_per_case` | true | CREATE UNIQUE INDEX uq_pcs_one_primary_per_case ON processing_case_sources USING btree (processing_case_id) WHERE role = |
| `processing_case_sources` | `uq_pcs_primary_source_once` | true | CREATE UNIQUE INDEX uq_pcs_primary_source_once ON processing_case_sources USING btree (org_id, source_kind, source_id) W |
| `processing_cases` | `idx_processing_cases_org` | false | CREATE INDEX idx_processing_cases_org ON processing_cases USING btree (org_id) |
| `processing_cases` | `idx_processing_cases_org_status` | false | CREATE INDEX idx_processing_cases_org_status ON processing_cases USING btree (org_id, status) |
| `processing_cases` | `idx_processing_cases_org_status_created` | false | CREATE INDEX idx_processing_cases_org_status_created ON processing_cases USING btree (org_id, status, created_at DESC) |
| `processing_cases` | `processing_cases_pkey` | true | CREATE UNIQUE INDEX processing_cases_pkey ON processing_cases USING btree (id) |
| `quotes` | `idx_quotes_job` | false | CREATE INDEX idx_quotes_job ON quotes USING btree (job_id) |
| `quotes` | `idx_quotes_opp` | false | CREATE INDEX idx_quotes_opp ON quotes USING btree (opportunity_id) |
| `quotes` | `idx_quotes_org_id` | false | CREATE INDEX idx_quotes_org_id ON quotes USING btree (org_id) |
| `quotes` | `quotes_pkey` | true | CREATE UNIQUE INDEX quotes_pkey ON quotes USING btree (id) |
| `record_actions` | `idx_record_actions_entity_active` | false | CREATE INDEX idx_record_actions_entity_active ON record_actions USING btree (entity_type) WHERE is_active = true |
| `record_actions` | `record_actions_pkey` | true | CREATE UNIQUE INDEX record_actions_pkey ON record_actions USING btree (id) |
| `record_actions` | `ux_record_actions_entity_action` | true | CREATE UNIQUE INDEX ux_record_actions_entity_action ON record_actions USING btree (entity_type, action_key) |
| `record_drawer_layouts` | `idx_record_drawer_layouts_org_entity_surface` | false | CREATE INDEX idx_record_drawer_layouts_org_entity_surface ON record_drawer_layouts USING btree (org_id, entity_type, sur |
| `record_drawer_layouts` | `record_drawer_layouts_pkey` | true | CREATE UNIQUE INDEX record_drawer_layouts_pkey ON record_drawer_layouts USING btree (id) |
| `record_drawer_layouts` | `ux_record_drawer_layouts_org_entity_surface_key` | true | CREATE UNIQUE INDEX ux_record_drawer_layouts_org_entity_surface_key ON record_drawer_layouts USING btree (org_id, entity |
| `record_layouts` | `idx_record_layouts_entity_active` | false | CREATE INDEX idx_record_layouts_entity_active ON record_layouts USING btree (entity_type) WHERE is_active = true |
| `record_layouts` | `record_layouts_pkey` | true | CREATE UNIQUE INDEX record_layouts_pkey ON record_layouts USING btree (id) |
| `record_layouts` | `ux_record_layouts_entity_key` | true | CREATE UNIQUE INDEX ux_record_layouts_entity_key ON record_layouts USING btree (entity_type, key) |
| `record_overview_layouts` | `idx_record_overview_layouts_org_entity_active` | false | CREATE INDEX idx_record_overview_layouts_org_entity_active ON record_overview_layouts USING btree (org_id, entity_type)  |
| `record_overview_layouts` | `idx_record_overview_layouts_org_id` | false | CREATE INDEX idx_record_overview_layouts_org_id ON record_overview_layouts USING btree (org_id) |
| `record_overview_layouts` | `record_overview_layouts_pkey` | true | CREATE UNIQUE INDEX record_overview_layouts_pkey ON record_overview_layouts USING btree (id) |
| `record_overview_layouts` | `ux_record_overview_layouts_org_entity_surface` | true | CREATE UNIQUE INDEX ux_record_overview_layouts_org_entity_surface ON record_overview_layouts USING btree (org_id, entity |
| `recurrence_plans` | `recurrence_plans_job_id_key` | true | CREATE UNIQUE INDEX recurrence_plans_job_id_key ON recurrence_plans USING btree (job_id) |
| `recurrence_plans` | `recurrence_plans_pkey` | true | CREATE UNIQUE INDEX recurrence_plans_pkey ON recurrence_plans USING btree (id) |
| `role_definitions` | `role_definitions_org_role_key_uk` | true | CREATE UNIQUE INDEX role_definitions_org_role_key_uk ON role_definitions USING btree (org_id, role_key) |
| `role_definitions` | `role_definitions_org_role_key_uq` | true | CREATE UNIQUE INDEX role_definitions_org_role_key_uq ON role_definitions USING btree (org_id, role_key) |
| `role_definitions` | `role_definitions_pkey` | true | CREATE UNIQUE INDEX role_definitions_pkey ON role_definitions USING btree (id) |
| `role_permission_grants` | `role_permission_grants_org_idx` | false | CREATE INDEX role_permission_grants_org_idx ON role_permission_grants USING btree (org_id) |
| `role_permission_grants` | `role_permission_grants_org_role_idx` | false | CREATE INDEX role_permission_grants_org_role_idx ON role_permission_grants USING btree (org_id, role_key) |
| `role_permission_grants` | `role_permission_grants_org_role_perm_uk` | true | CREATE UNIQUE INDEX role_permission_grants_org_role_perm_uk ON role_permission_grants USING btree (org_id, role_key, per |
| `role_permission_grants` | `role_permission_grants_org_role_perm_uq` | true | CREATE UNIQUE INDEX role_permission_grants_org_role_perm_uq ON role_permission_grants USING btree (org_id, role_key, per |
| `role_permission_grants` | `role_permission_grants_permission_idx` | false | CREATE INDEX role_permission_grants_permission_idx ON role_permission_grants USING btree (permission_key) |
| `role_permission_grants` | `role_permission_grants_pkey` | true | CREATE UNIQUE INDEX role_permission_grants_pkey ON role_permission_grants USING btree (id) |
| `role_permission_grants` | `role_permission_grants_unique` | true | CREATE UNIQUE INDEX role_permission_grants_unique ON role_permission_grants USING btree (org_id, role_key, permission_ke |
| `schedule_assignments` | `idx_schedule_assignments_org_agreement` | false | CREATE INDEX idx_schedule_assignments_org_agreement ON schedule_assignments USING btree (org_id, enrollment_agreement_id |
| `schedule_assignments` | `idx_schedule_assignments_org_member_dates` | false | CREATE INDEX idx_schedule_assignments_org_member_dates ON schedule_assignments USING btree (org_id, customer_member_id,  |
| `schedule_assignments` | `schedule_assignments_pkey` | true | CREATE UNIQUE INDEX schedule_assignments_pkey ON schedule_assignments USING btree (id) |
| `schedule_assignments` | `ux_schedule_assignments_one_operational_per_agreement` | true | CREATE UNIQUE INDEX ux_schedule_assignments_one_operational_per_agreement ON schedule_assignments USING btree (org_id, e |
| `schedule_patterns` | `idx_schedule_patterns_org_schedule_type` | false | CREATE INDEX idx_schedule_patterns_org_schedule_type ON schedule_patterns USING btree (org_id, schedule_type_key) |
| `schedule_patterns` | `idx_schedule_patterns_org_site` | false | CREATE INDEX idx_schedule_patterns_org_site ON schedule_patterns USING btree (org_id, site_location_id) |
| `schedule_patterns` | `schedule_patterns_org_site_key_unique` | true | CREATE UNIQUE INDEX schedule_patterns_org_site_key_unique ON schedule_patterns USING btree (org_id, site_location_id, ke |
| `schedule_patterns` | `schedule_patterns_pkey` | true | CREATE UNIQUE INDEX schedule_patterns_pkey ON schedule_patterns USING btree (id) |
| `schedule_statuses` | `schedule_statuses_key_key` | true | CREATE UNIQUE INDEX schedule_statuses_key_key ON schedule_statuses USING btree (key) |
| `schedule_statuses` | `schedule_statuses_pkey` | true | CREATE UNIQUE INDEX schedule_statuses_pkey ON schedule_statuses USING btree (id) |
| `schedule_tags` | `schedule_tags_pkey` | true | CREATE UNIQUE INDEX schedule_tags_pkey ON schedule_tags USING btree (schedule_id, tag_id) |
| `schedules` | `idx_schedules_job` | false | CREATE INDEX idx_schedules_job ON schedules USING btree (job_id) |
| `schedules` | `idx_schedules_org_id` | false | CREATE INDEX idx_schedules_org_id ON schedules USING btree (org_id) |
| `schedules` | `idx_schedules_org_id_start_at` | false | CREATE INDEX idx_schedules_org_id_start_at ON schedules USING btree (org_id, start_at) |
| `schedules` | `idx_schedules_org_location` | false | CREATE INDEX idx_schedules_org_location ON schedules USING btree (org_id, location_id) |
| `schedules` | `idx_schedules_start_at` | false | CREATE INDEX idx_schedules_start_at ON schedules USING btree (start_at) |
| `schedules` | `idx_schedules_status` | false | CREATE INDEX idx_schedules_status ON schedules USING btree (schedule_status_id) |
| `schedules` | `idx_schedules_subscription` | false | CREATE INDEX idx_schedules_subscription ON schedules USING btree (customer_subscription_id, subscription_sequence) |
| `schedules` | `schedules_job_status_idx` | false | CREATE INDEX schedules_job_status_idx ON schedules USING btree (org_id, job_id, status_key) |
| `schedules` | `schedules_job_vendor_status_idx` | false | CREATE INDEX schedules_job_vendor_status_idx ON schedules USING btree (org_id, job_id, assigned_vendor_id, status_key) |
| `schedules` | `schedules_org_assigned_vendor_idx` | false | CREATE INDEX schedules_org_assigned_vendor_idx ON schedules USING btree (org_id, assigned_vendor_id) |
| `schedules` | `schedules_org_job_start_idx` | false | CREATE INDEX schedules_org_job_start_idx ON schedules USING btree (org_id, job_id, start_at) |
| `schedules` | `schedules_org_job_status_idx` | false | CREATE INDEX schedules_org_job_status_idx ON schedules USING btree (org_id, job_id, status_key) |
| `schedules` | `schedules_org_job_vendor_status_idx` | false | CREATE INDEX schedules_org_job_vendor_status_idx ON schedules USING btree (org_id, job_id, assigned_vendor_id, status_ke |
| `schedules` | `schedules_org_status_idx` | false | CREATE INDEX schedules_org_status_idx ON schedules USING btree (org_id, status_key) |
| `schedules` | `schedules_pkey` | true | CREATE UNIQUE INDEX schedules_pkey ON schedules USING btree (id) |
| `schedules` | `schedules_subscription_idx` | false | CREATE INDEX schedules_subscription_idx ON schedules USING btree (customer_subscription_id) |
| `schedules` | `ux_schedules_org_schedule_number` | true | CREATE UNIQUE INDEX ux_schedules_org_schedule_number ON schedules USING btree (org_id, schedule_number) |
| `service_offerings` | `service_offerings_org_active_idx` | false | CREATE INDEX service_offerings_org_active_idx ON service_offerings USING btree (org_id, is_active) |
| `service_offerings` | `service_offerings_org_key_uidx` | true | CREATE UNIQUE INDEX service_offerings_org_key_uidx ON service_offerings USING btree (org_id, offering_key) |
| `service_offerings` | `service_offerings_pkey` | true | CREATE UNIQUE INDEX service_offerings_pkey ON service_offerings USING btree (id) |
| `service_plan_templates` | `service_plan_templates_org_active_idx` | false | CREATE INDEX service_plan_templates_org_active_idx ON service_plan_templates USING btree (org_id, is_active) |
| `service_plan_templates` | `service_plan_templates_org_key_uidx` | true | CREATE UNIQUE INDEX service_plan_templates_org_key_uidx ON service_plan_templates USING btree (org_id, plan_key) |
| `service_plan_templates` | `service_plan_templates_pkey` | true | CREATE UNIQUE INDEX service_plan_templates_pkey ON service_plan_templates USING btree (id) |
| `service_price_dimensions` | `service_price_dimensions_pkey` | true | CREATE UNIQUE INDEX service_price_dimensions_pkey ON service_price_dimensions USING btree (id) |
| `service_price_dimensions` | `service_price_dimensions_rule_idx` | false | CREATE INDEX service_price_dimensions_rule_idx ON service_price_dimensions USING btree (pricing_rule_id) |
| `service_pricing_rules` | `service_pricing_rules_offering_idx` | false | CREATE INDEX service_pricing_rules_offering_idx ON service_pricing_rules USING btree (service_offering_id) |
| `service_pricing_rules` | `service_pricing_rules_org_active_idx` | false | CREATE INDEX service_pricing_rules_org_active_idx ON service_pricing_rules USING btree (org_id, is_active) |
| `service_pricing_rules` | `service_pricing_rules_org_idx` | false | CREATE INDEX service_pricing_rules_org_idx ON service_pricing_rules USING btree (org_id) |
| `service_pricing_rules` | `service_pricing_rules_pkey` | true | CREATE UNIQUE INDEX service_pricing_rules_pkey ON service_pricing_rules USING btree (id) |
| `service_pricing_rules` | `service_pricing_rules_plan_idx` | false | CREATE INDEX service_pricing_rules_plan_idx ON service_pricing_rules USING btree (service_plan_template_id) |
| `sla_events` | `idx_sla_events_org_thread` | false | CREATE INDEX idx_sla_events_org_thread ON sla_events USING btree (org_id, thread_id, occurred_at DESC) |
| `sla_events` | `idx_sla_events_org_type_state` | false | CREATE INDEX idx_sla_events_org_type_state ON sla_events USING btree (org_id, sla_type, state) |
| `sla_events` | `sla_events_pkey` | true | CREATE UNIQUE INDEX sla_events_pkey ON sla_events USING btree (id) |
| `sqft_bands` | `sqft_bands_key_key` | true | CREATE UNIQUE INDEX sqft_bands_key_key ON sqft_bands USING btree (key) |
| `sqft_bands` | `sqft_bands_pkey` | true | CREATE UNIQUE INDEX sqft_bands_pkey ON sqft_bands USING btree (id) |
| `status_definitions` | `status_definitions_org_entity_sort_idx` | false | CREATE INDEX status_definitions_org_entity_sort_idx ON status_definitions USING btree (org_id, entity_type, sort_order) |
| `status_definitions` | `status_definitions_pkey` | true | CREATE UNIQUE INDEX status_definitions_pkey ON status_definitions USING btree (id) |
| `status_definitions` | `status_definitions_unique_scope` | true | CREATE UNIQUE INDEX status_definitions_unique_scope ON status_definitions USING btree (COALESCE(org_id, '00000000-0000-0 |
| `status_transition_rules` | `idx_status_transition_rules_org_entity_action` | false | CREATE INDEX idx_status_transition_rules_org_entity_action ON status_transition_rules USING btree (org_id, entity_type,  |
| `status_transition_rules` | `idx_status_transition_rules_org_entity_scope` | false | CREATE INDEX idx_status_transition_rules_org_entity_scope ON status_transition_rules USING btree (org_id, entity_type, d |
| `status_transition_rules` | `idx_status_transition_rules_org_entity_to` | false | CREATE INDEX idx_status_transition_rules_org_entity_to ON status_transition_rules USING btree (org_id, entity_type, to_s |
| `status_transition_rules` | `status_transition_rules_pkey` | true | CREATE UNIQUE INDEX status_transition_rules_pkey ON status_transition_rules USING btree (id) |
| `tags` | `tags_name_key` | true | CREATE UNIQUE INDEX tags_name_key ON tags USING btree (name) |
| `tags` | `tags_pkey` | true | CREATE UNIQUE INDEX tags_pkey ON tags USING btree (id) |
| `task_assist_proposals` | `idx_task_assist_proposals_org_entity_status` | false | CREATE INDEX idx_task_assist_proposals_org_entity_status ON task_assist_proposals USING btree (org_id, entity_type, enti |
| `task_assist_proposals` | `idx_task_assist_proposals_org_expires` | false | CREATE INDEX idx_task_assist_proposals_org_expires ON task_assist_proposals USING btree (org_id, expires_at) WHERE statu |
| `task_assist_proposals` | `task_assist_proposals_pkey` | true | CREATE UNIQUE INDEX task_assist_proposals_pkey ON task_assist_proposals USING btree (id) |
| `tour_availability_rules` | `idx_tour_availability_rules_org_active` | false | CREATE INDEX idx_tour_availability_rules_org_active ON tour_availability_rules USING btree (org_id, is_active) |
| `tour_availability_rules` | `idx_tour_availability_rules_org_dow` | false | CREATE INDEX idx_tour_availability_rules_org_dow ON tour_availability_rules USING btree (org_id, day_of_week) |
| `tour_availability_rules` | `idx_tour_availability_rules_org_location` | false | CREATE INDEX idx_tour_availability_rules_org_location ON tour_availability_rules USING btree (org_id, location_id) |
| `tour_availability_rules` | `idx_tour_availability_rules_org_user` | false | CREATE INDEX idx_tour_availability_rules_org_user ON tour_availability_rules USING btree (org_id, user_id) |
| `tour_availability_rules` | `tour_availability_rules_pkey` | true | CREATE UNIQUE INDEX tour_availability_rules_pkey ON tour_availability_rules USING btree (id) |
| `tour_bookings` | `idx_tour_bookings_form_public_link` | false | CREATE INDEX idx_tour_bookings_form_public_link ON tour_bookings USING btree (form_public_link_id) WHERE form_public_lin |
| `tour_bookings` | `idx_tour_bookings_form_submission` | false | CREATE INDEX idx_tour_bookings_form_submission ON tour_bookings USING btree (form_submission_id) WHERE form_submission_i |
| `tour_bookings` | `idx_tour_bookings_org_location_start` | false | CREATE INDEX idx_tour_bookings_org_location_start ON tour_bookings USING btree (org_id, location_id, start_at) |
| `tour_bookings` | `idx_tour_bookings_org_opportunity` | false | CREATE INDEX idx_tour_bookings_org_opportunity ON tour_bookings USING btree (org_id, opportunity_id) |
| `tour_bookings` | `idx_tour_bookings_org_status_start` | false | CREATE INDEX idx_tour_bookings_org_status_start ON tour_bookings USING btree (org_id, status_key, start_at) |
| `tour_bookings` | `idx_tour_bookings_org_window` | false | CREATE INDEX idx_tour_bookings_org_window ON tour_bookings USING btree (org_id, start_at, end_at) |
| `tour_bookings` | `tour_bookings_pkey` | true | CREATE UNIQUE INDEX tour_bookings_pkey ON tour_bookings USING btree (id) |
| `tour_bookings` | `ux_tour_bookings_one_active_non_terminal_per_opportunity` | true | CREATE UNIQUE INDEX ux_tour_bookings_one_active_non_terminal_per_opportunity ON tour_bookings USING btree (org_id, oppor |
| `tour_public_booking_links` | `idx_tour_public_booking_links_org_opportunity` | false | CREATE INDEX idx_tour_public_booking_links_org_opportunity ON tour_public_booking_links USING btree (org_id, opportunity |
| `tour_public_booking_links` | `tour_public_booking_links_pkey` | true | CREATE UNIQUE INDEX tour_public_booking_links_pkey ON tour_public_booking_links USING btree (id) |
| `tour_public_booking_links` | `ux_tour_public_booking_links_token_hash` | true | CREATE UNIQUE INDEX ux_tour_public_booking_links_token_hash ON tour_public_booking_links USING btree (token_hash) |
| `user_access_profiles` | `idx_user_access_profiles_org_id` | false | CREATE INDEX idx_user_access_profiles_org_id ON user_access_profiles USING btree (org_id) |
| `user_access_profiles` | `idx_user_access_profiles_user_id` | false | CREATE INDEX idx_user_access_profiles_user_id ON user_access_profiles USING btree (user_id) |
| `user_access_profiles` | `uq_user_access_profiles_user_org` | true | CREATE UNIQUE INDEX uq_user_access_profiles_user_org ON user_access_profiles USING btree (user_id, org_id) |
| `user_access_profiles` | `user_access_profiles_pkey` | true | CREATE UNIQUE INDEX user_access_profiles_pkey ON user_access_profiles USING btree (id) |
| `user_department_access` | `idx_user_department_access_department_id` | false | CREATE INDEX idx_user_department_access_department_id ON user_department_access USING btree (department_id) |
| `user_department_access` | `idx_user_department_access_user_org` | false | CREATE INDEX idx_user_department_access_user_org ON user_department_access USING btree (user_id, org_id) |
| `user_department_access` | `uq_user_department_access_user_org_dept` | true | CREATE UNIQUE INDEX uq_user_department_access_user_org_dept ON user_department_access USING btree (user_id, org_id, depa |
| `user_department_access` | `user_department_access_pkey` | true | CREATE UNIQUE INDEX user_department_access_pkey ON user_department_access USING btree (id) |
| `user_profiles` | `user_profiles_pkey` | true | CREATE UNIQUE INDEX user_profiles_pkey ON user_profiles USING btree (id) |
| `user_roles` | `idx_user_roles_org_id` | false | CREATE INDEX idx_user_roles_org_id ON user_roles USING btree (org_id) |
| `user_roles` | `idx_user_roles_role` | false | CREATE INDEX idx_user_roles_role ON user_roles USING btree (role) |
| `user_roles` | `idx_user_roles_user_id` | false | CREATE INDEX idx_user_roles_user_id ON user_roles USING btree (user_id) |
| `user_roles` | `idx_user_roles_user_id_org_id` | false | CREATE INDEX idx_user_roles_user_id_org_id ON user_roles USING btree (user_id, org_id) |
| `user_roles` | `user_roles_org_user_idx` | false | CREATE INDEX user_roles_org_user_idx ON user_roles USING btree (org_id, user_id) |
| `user_roles` | `user_roles_pkey` | true | CREATE UNIQUE INDEX user_roles_pkey ON user_roles USING btree (user_id, org_id, role) |
| `user_site_access` | `idx_user_site_access_location_id` | false | CREATE INDEX idx_user_site_access_location_id ON user_site_access USING btree (location_id) |
| `user_site_access` | `idx_user_site_access_user_org` | false | CREATE INDEX idx_user_site_access_user_org ON user_site_access USING btree (user_id, org_id) |
| `user_site_access` | `uq_user_site_access_user_org_location` | true | CREATE UNIQUE INDEX uq_user_site_access_user_org_location ON user_site_access USING btree (user_id, org_id, location_id) |
| `user_site_access` | `user_site_access_pkey` | true | CREATE UNIQUE INDEX user_site_access_pkey ON user_site_access USING btree (id) |
| `vendor_statuses` | `vendor_statuses_key_key` | true | CREATE UNIQUE INDEX vendor_statuses_key_key ON vendor_statuses USING btree (key) |
| `vendor_statuses` | `vendor_statuses_pkey` | true | CREATE UNIQUE INDEX vendor_statuses_pkey ON vendor_statuses USING btree (id) |
| `vendor_tags` | `vendor_tags_pkey` | true | CREATE UNIQUE INDEX vendor_tags_pkey ON vendor_tags USING btree (vendor_id, tag_id) |
| `vendor_users` | `idx_vendor_users_external` | false | CREATE INDEX idx_vendor_users_external ON vendor_users USING btree (external_source, external_id) |
| `vendor_users` | `idx_vendor_users_org_id` | false | CREATE INDEX idx_vendor_users_org_id ON vendor_users USING btree (org_id) |
| `vendor_users` | `idx_vendor_users_vendor_id` | false | CREATE INDEX idx_vendor_users_vendor_id ON vendor_users USING btree (vendor_id) |
| `vendor_users` | `vendor_users_pkey` | true | CREATE UNIQUE INDEX vendor_users_pkey ON vendor_users USING btree (id) |
| `vendor_users` | `vendor_users_vendor_id_contact_id_key` | true | CREATE UNIQUE INDEX vendor_users_vendor_id_contact_id_key ON vendor_users USING btree (vendor_id, contact_id) |
| `vendor_verticals` | `idx_vendor_verticals_vertical_id` | false | CREATE INDEX idx_vendor_verticals_vertical_id ON vendor_verticals USING btree (vertical_id) |
| `vendor_verticals` | `vendor_verticals_pkey` | true | CREATE UNIQUE INDEX vendor_verticals_pkey ON vendor_verticals USING btree (vendor_id, vertical_id) |
| `vendors` | `idx_vendors_company_name` | false | CREATE INDEX idx_vendors_company_name ON vendors USING btree (company_name) |
| `vendors` | `idx_vendors_days_available_gin` | false | CREATE INDEX idx_vendors_days_available_gin ON vendors USING gin (days_available) |
| `vendors` | `idx_vendors_external` | false | CREATE INDEX idx_vendors_external ON vendors USING btree (external_source, external_id) |
| `vendors` | `idx_vendors_org_id` | false | CREATE INDEX idx_vendors_org_id ON vendors USING btree (org_id) |
| `vendors` | `idx_vendors_service_area_zip_codes_gin` | false | CREATE INDEX idx_vendors_service_area_zip_codes_gin ON vendors USING gin (service_area_zip_codes) |
| `vendors` | `idx_vendors_status` | false | CREATE INDEX idx_vendors_status ON vendors USING btree (status) |
| `vendors` | `idx_vendors_submitted_at` | false | CREATE INDEX idx_vendors_submitted_at ON vendors USING btree (submitted_at) |
| `vendors` | `ux_vendors_org_vendor_number` | true | CREATE UNIQUE INDEX ux_vendors_org_vendor_number ON vendors USING btree (org_id, vendor_number) |
| `vendors` | `vendors_drivers_license_doc_path_idx` | false | CREATE INDEX vendors_drivers_license_doc_path_idx ON vendors USING btree (drivers_license_doc_path) |
| `vendors` | `vendors_insurance_doc_path_idx` | false | CREATE INDEX vendors_insurance_doc_path_idx ON vendors USING btree (insurance_doc_path) |
| `vendors` | `vendors_org_payout_override_idx` | false | CREATE INDEX vendors_org_payout_override_idx ON vendors USING btree (org_id, payout_override_type) |
| `vendors` | `vendors_org_status_idx` | false | CREATE INDEX vendors_org_status_idx ON vendors USING btree (org_id, status_key) |
| `vendors` | `vendors_pkey` | true | CREATE UNIQUE INDEX vendors_pkey ON vendors USING btree (id) |
| `verticals` | `verticals_pkey` | true | CREATE UNIQUE INDEX verticals_pkey ON verticals USING btree (id) |
| `verticals` | `verticals_slug_key` | true | CREATE UNIQUE INDEX verticals_slug_key ON verticals USING btree (slug) |
| `work_units` | `idx_work_units_department_id` | false | CREATE INDEX idx_work_units_department_id ON work_units USING btree (department_id) |
| `work_units` | `idx_work_units_org_department_active_sort` | false | CREATE INDEX idx_work_units_org_department_active_sort ON work_units USING btree (org_id, department_id, is_active, sort |
| `work_units` | `idx_work_units_org_id` | false | CREATE INDEX idx_work_units_org_id ON work_units USING btree (org_id) |
| `work_units` | `uq_work_units_department_key` | true | CREATE UNIQUE INDEX uq_work_units_department_key ON work_units USING btree (department_id, key) |
| `work_units` | `work_units_pkey` | true | CREATE UNIQUE INDEX work_units_pkey ON work_units USING btree (id) |
| `workflow_action_runs` | `workflow_action_runs_org_run_idx` | false | CREATE INDEX workflow_action_runs_org_run_idx ON workflow_action_runs USING btree (org_id, workflow_run_id, started_at D |
| `workflow_action_runs` | `workflow_action_runs_org_status_idx` | false | CREATE INDEX workflow_action_runs_org_status_idx ON workflow_action_runs USING btree (org_id, status, started_at DESC) |
| `workflow_action_runs` | `workflow_action_runs_pkey` | true | CREATE UNIQUE INDEX workflow_action_runs_pkey ON workflow_action_runs USING btree (id) |
| `workflow_actions` | `idx_workflow_actions_order` | false | CREATE INDEX idx_workflow_actions_order ON workflow_actions USING btree (workflow_id, action_order) |
| `workflow_actions` | `idx_workflow_actions_workflow` | false | CREATE INDEX idx_workflow_actions_workflow ON workflow_actions USING btree (workflow_id) |
| `workflow_actions` | `uniq_workflow_action_order` | true | CREATE UNIQUE INDEX uniq_workflow_action_order ON workflow_actions USING btree (workflow_id, action_order) |
| `workflow_actions` | `uniq_workflow_actions_order` | true | CREATE UNIQUE INDEX uniq_workflow_actions_order ON workflow_actions USING btree (workflow_id, action_order) |
| `workflow_actions` | `workflow_actions_org_id_idx` | false | CREATE INDEX workflow_actions_org_id_idx ON workflow_actions USING btree (org_id) |
| `workflow_actions` | `workflow_actions_pkey` | true | CREATE UNIQUE INDEX workflow_actions_pkey ON workflow_actions USING btree (id) |
| `workflow_conditions` | `idx_workflow_conditions_workflow` | false | CREATE INDEX idx_workflow_conditions_workflow ON workflow_conditions USING btree (workflow_id) |
| `workflow_conditions` | `workflow_conditions_org_id_idx` | false | CREATE INDEX workflow_conditions_org_id_idx ON workflow_conditions USING btree (org_id) |
| `workflow_conditions` | `workflow_conditions_pkey` | true | CREATE UNIQUE INDEX workflow_conditions_pkey ON workflow_conditions USING btree (id) |
| `workflow_events` | `workflow_events_entity_idx` | false | CREATE INDEX workflow_events_entity_idx ON workflow_events USING btree (entity_type, entity_id) |
| `workflow_events` | `workflow_events_event_type_idx` | false | CREATE INDEX workflow_events_event_type_idx ON workflow_events USING btree (event_type) |
| `workflow_events` | `workflow_events_org_entity_idx` | false | CREATE INDEX workflow_events_org_entity_idx ON workflow_events USING btree (org_id, entity_type, entity_id) |
| `workflow_events` | `workflow_events_org_event_occurred_idx` | false | CREATE INDEX workflow_events_org_event_occurred_idx ON workflow_events USING btree (org_id, event_type, occurred_at DESC |
| `workflow_events` | `workflow_events_org_occurred_idx` | false | CREATE INDEX workflow_events_org_occurred_idx ON workflow_events USING btree (org_id, occurred_at DESC) |
| `workflow_events` | `workflow_events_payload_gin_idx` | false | CREATE INDEX workflow_events_payload_gin_idx ON workflow_events USING gin (payload) |
| `workflow_events` | `workflow_events_pkey` | true | CREATE UNIQUE INDEX workflow_events_pkey ON workflow_events USING btree (id) |
| `workflow_runs` | `idx_workflow_runs_workflow` | false | CREATE INDEX idx_workflow_runs_workflow ON workflow_runs USING btree (workflow_id) |
| `workflow_runs` | `workflow_runs_event_id_idx` | false | CREATE INDEX workflow_runs_event_id_idx ON workflow_runs USING btree (event_id) |
| `workflow_runs` | `workflow_runs_failed_idx` | false | CREATE INDEX workflow_runs_failed_idx ON workflow_runs USING btree (org_id, status) WHERE status = 'failed'::text |
| `workflow_runs` | `workflow_runs_org_completed_idx` | false | CREATE INDEX workflow_runs_org_completed_idx ON workflow_runs USING btree (org_id, completed_at DESC) |
| `workflow_runs` | `workflow_runs_org_id_idx` | false | CREATE INDEX workflow_runs_org_id_idx ON workflow_runs USING btree (org_id) |
| `workflow_runs` | `workflow_runs_org_started_desc` | false | CREATE INDEX workflow_runs_org_started_desc ON workflow_runs USING btree (org_id, started_at DESC) |
| `workflow_runs` | `workflow_runs_org_started_idx` | false | CREATE INDEX workflow_runs_org_started_idx ON workflow_runs USING btree (org_id, started_at DESC) |
| `workflow_runs` | `workflow_runs_org_status_started_idx` | false | CREATE INDEX workflow_runs_org_status_started_idx ON workflow_runs USING btree (org_id, status, started_at DESC) |
| `workflow_runs` | `workflow_runs_org_workflow_started_idx` | false | CREATE INDEX workflow_runs_org_workflow_started_idx ON workflow_runs USING btree (org_id, workflow_id, started_at DESC) |
| `workflow_runs` | `workflow_runs_pkey` | true | CREATE UNIQUE INDEX workflow_runs_pkey ON workflow_runs USING btree (id) |
| `workflow_runs` | `workflow_runs_status_idx` | false | CREATE INDEX workflow_runs_status_idx ON workflow_runs USING btree (status) |
| `workflows` | `idx_workflows_enabled` | false | CREATE INDEX idx_workflows_enabled ON workflows USING btree (enabled) WHERE enabled = true |
| `workflows` | `idx_workflows_entity` | false | CREATE INDEX idx_workflows_entity ON workflows USING btree (entity_type) |
| `workflows` | `idx_workflows_metadata_scope_department` | false | CREATE INDEX idx_workflows_metadata_scope_department ON workflows USING btree (((metadata -> 'scope'::text) ->> 'departm |
| `workflows` | `idx_workflows_metadata_scope_work_unit` | false | CREATE INDEX idx_workflows_metadata_scope_work_unit ON workflows USING btree (((metadata -> 'scope'::text) ->> 'work_uni |
| `workflows` | `idx_workflows_trigger` | false | CREATE INDEX idx_workflows_trigger ON workflows USING btree (event_type) |
| `workflows` | `workflows_org_id_idx` | false | CREATE INDEX workflows_org_id_idx ON workflows USING btree (org_id) |
| `workflows` | `workflows_org_id_name_uniq` | true | CREATE UNIQUE INDEX workflows_org_id_name_uniq ON workflows USING btree (org_id, name) |
| `workflows` | `workflows_pkey` | true | CREATE UNIQUE INDEX workflows_pkey ON workflows USING btree (id) |
| `workspace_kpi_placement` | `idx_workspace_kpi_placement_org_surface` | false | CREATE INDEX idx_workspace_kpi_placement_org_surface ON workspace_kpi_placement USING btree (org_id, surface) WHERE is_v |
| `workspace_kpi_placement` | `ux_workspace_kpi_placement_department_active` | true | CREATE UNIQUE INDEX ux_workspace_kpi_placement_department_active ON workspace_kpi_placement USING btree (org_id, departm |
| `workspace_kpi_placement` | `ux_workspace_kpi_placement_work_unit_active` | true | CREATE UNIQUE INDEX ux_workspace_kpi_placement_work_unit_active ON workspace_kpi_placement USING btree (org_id, work_uni |
| `workspace_kpi_placement` | `ux_workspace_kpi_placement_workspace_active` | true | CREATE UNIQUE INDEX ux_workspace_kpi_placement_workspace_active ON workspace_kpi_placement USING btree (org_id, metric_k |
| `workspace_kpi_placement` | `workspace_kpi_placement_pkey` | true | CREATE UNIQUE INDEX workspace_kpi_placement_pkey ON workspace_kpi_placement USING btree (id) |
