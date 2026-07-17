# Schema — constraints

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** 2026-07-17 · **Constraint count:** 1296

| Table | Name | Type | Definition |
|-------|------|------|------------|
| `access_methods` | `access_methods_key_key` | UNIQUE | UNIQUE (key) |
| `access_methods` | `access_methods_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `action_definitions` | `action_definitions_action_type_check` | CHECK | CHECK (action_type = ANY (ARRAY['navigate'::text, 'open_drawer'::text, 'open_form'::text, 'update_st |
| `action_definitions` | `action_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `action_definitions` | `action_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `action_definitions` | `action_definitions_workflow_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL |
| `action_links` | `action_links_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `action_links` | `action_links_token_key` | UNIQUE | UNIQUE (token) |
| `action_placements` | `action_placements_action_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (action_definition_id) REFERENCES action_definitions(id) ON DELETE CASCADE |
| `action_placements` | `action_placements_department_id_fkey` | FOREIGN KEY | FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE |
| `action_placements` | `action_placements_display_style_check` | CHECK | CHECK (display_style = ANY (ARRAY['button'::text, 'icon_button'::text, 'link'::text, 'menu_item'::te |
| `action_placements` | `action_placements_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `action_placements` | `action_placements_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `action_placements` | `action_placements_slot_check` | CHECK | CHECK (slot = ANY (ARRAY['primary'::text, 'secondary'::text, 'overflow'::text, 'right_rail'::text, ' |
| `action_placements` | `action_placements_surface_check` | CHECK | CHECK (surface = ANY (ARRAY['record_header'::text, 'record_section'::text, 'queue_row'::text, 'work_ |
| `action_placements` | `action_placements_work_unit_id_fkey` | FOREIGN KEY | FOREIGN KEY (work_unit_id) REFERENCES work_units(id) ON DELETE CASCADE |
| `activity_log` | `activity_log_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `addon_frequencies` | `addon_frequencies_key_key` | UNIQUE | UNIQUE (key) |
| `addon_frequencies` | `addon_frequencies_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `addon_types` | `addon_types_key_key` | UNIQUE | UNIQUE (key) |
| `addon_types` | `addon_types_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `addon_types` | `addon_types_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `agent_v0_apply_audit` | `agent_v0_apply_audit_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `agent_v0_apply_audit` | `agent_v0_apply_audit_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `agent_v0_apply_audit` | `agent_v0_apply_audit_work_unit_id_fkey` | FOREIGN KEY | FOREIGN KEY (work_unit_id) REFERENCES work_units(id) ON DELETE CASCADE |
| `agent_v0_apply_audit` | `chk_agent_v0_apply_terminal` | CHECK | CHECK (terminal_status = ANY (ARRAY['success'::text, 'failed'::text])) |
| `agent_v0_apply_audit` | `fk_agent_v0_apply_proposal` | FOREIGN KEY | FOREIGN KEY (proposal_id) REFERENCES agent_v0_proposals(proposal_id) ON DELETE CASCADE |
| `agent_v0_apply_audit` | `ux_agent_v0_apply_audit_result_id` | UNIQUE | UNIQUE (result_id) |
| `agent_v0_proposals` | `agent_v0_proposals_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `agent_v0_proposals` | `agent_v0_proposals_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `agent_v0_proposals` | `agent_v0_proposals_work_unit_id_fkey` | FOREIGN KEY | FOREIGN KEY (work_unit_id) REFERENCES work_units(id) ON DELETE CASCADE |
| `agent_v0_proposals` | `ux_agent_v0_proposals_proposal_id` | UNIQUE | UNIQUE (proposal_id) |
| `agent_v1_record_layout_apply_audit` | `agent_v1_record_layout_apply_aud_record_overview_layout_id_fkey` | FOREIGN KEY | FOREIGN KEY (record_overview_layout_id) REFERENCES record_overview_layouts(id) ON DELETE CASCADE |
| `agent_v1_record_layout_apply_audit` | `agent_v1_record_layout_apply_audit_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `agent_v1_record_layout_apply_audit` | `agent_v1_record_layout_apply_audit_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `agent_v1_record_layout_apply_audit` | `chk_agent_v1_rl_apply_terminal` | CHECK | CHECK (terminal_status = ANY (ARRAY['success'::text, 'failed'::text])) |
| `agent_v1_record_layout_apply_audit` | `fk_agent_v1_rl_apply_proposal` | FOREIGN KEY | FOREIGN KEY (proposal_id) REFERENCES agent_v1_record_layout_proposals(proposal_id) ON DELETE CASCADE |
| `agent_v1_record_layout_apply_audit` | `ux_agent_v1_rl_apply_result_id` | UNIQUE | UNIQUE (result_id) |
| `agent_v1_record_layout_proposals` | `agent_v1_record_layout_proposals_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `agent_v1_record_layout_proposals` | `agent_v1_record_layout_proposals_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `agent_v1_record_layout_proposals` | `agent_v1_record_layout_proposals_record_overview_layout_id_fkey` | FOREIGN KEY | FOREIGN KEY (record_overview_layout_id) REFERENCES record_overview_layouts(id) ON DELETE CASCADE |
| `agent_v1_record_layout_proposals` | `ux_agent_v1_rl_proposals_proposal_id` | UNIQUE | UNIQUE (proposal_id) |
| `agent_v2_field_visibility_apply_audit` | `agent_v2_field_visibility_apply_audit_field_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id) ON DELETE CASCADE |
| `agent_v2_field_visibility_apply_audit` | `agent_v2_field_visibility_apply_audit_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `agent_v2_field_visibility_apply_audit` | `agent_v2_field_visibility_apply_audit_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `agent_v2_field_visibility_apply_audit` | `chk_agent_v2_fv_apply_terminal` | CHECK | CHECK (terminal_status = ANY (ARRAY['success'::text, 'failed'::text])) |
| `agent_v2_field_visibility_apply_audit` | `fk_agent_v2_fv_apply_proposal` | FOREIGN KEY | FOREIGN KEY (proposal_id) REFERENCES agent_v2_field_visibility_proposals(proposal_id) ON DELETE CASC |
| `agent_v2_field_visibility_apply_audit` | `ux_agent_v2_fv_apply_result_id` | UNIQUE | UNIQUE (result_id) |
| `agent_v2_field_visibility_proposals` | `agent_v2_field_visibility_proposals_field_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id) ON DELETE CASCADE |
| `agent_v2_field_visibility_proposals` | `agent_v2_field_visibility_proposals_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `agent_v2_field_visibility_proposals` | `agent_v2_field_visibility_proposals_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `agent_v2_field_visibility_proposals` | `ux_agent_v2_fv_proposals_proposal_id` | UNIQUE | UNIQUE (proposal_id) |
| `announcement_deliveries` | `announcement_deliveries_announcement_id_fkey` | FOREIGN KEY | FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE |
| `announcement_deliveries` | `announcement_deliveries_message_id_fkey` | FOREIGN KEY | FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE SET NULL |
| `announcement_deliveries` | `announcement_deliveries_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `announcement_deliveries` | `announcement_deliveries_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `announcement_recipients` | `announcement_recipients_announcement_id_fkey` | FOREIGN KEY | FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE |
| `announcement_recipients` | `announcement_recipients_channel_check` | CHECK | CHECK (channel = ANY (ARRAY['email'::text, 'sms'::text, 'in_app'::text])) |
| `announcement_recipients` | `announcement_recipients_communication_message_id_fkey` | FOREIGN KEY | FOREIGN KEY (communication_message_id) REFERENCES communication_messages(id) ON DELETE SET NULL |
| `announcement_recipients` | `announcement_recipients_communication_scheduled_send_id_fkey` | FOREIGN KEY | FOREIGN KEY (communication_scheduled_send_id) REFERENCES communication_scheduled_sends(id) ON DELETE |
| `announcement_recipients` | `announcement_recipients_consent_state_check` | CHECK | CHECK (consent_state = ANY (ARRAY['opted_in'::text, 'opted_out'::text, 'unset'::text])) |
| `announcement_recipients` | `announcement_recipients_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `announcement_recipients` | `announcement_recipients_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `announcement_recipients` | `announcement_recipients_status_check` | CHECK | CHECK (status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'skipped'::text, 'sent'::text, 'faile |
| `announcement_recipients` | `announcement_recipients_uq` | UNIQUE | UNIQUE (announcement_id, person_id, channel) |
| `announcement_targets` | `announcement_targets_announcement_id_fkey` | FOREIGN KEY | FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE |
| `announcement_targets` | `announcement_targets_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `announcement_targets` | `announcement_targets_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `announcements` | `announcements_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `announcements` | `announcements_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `announcements` | `announcements_template_id_fkey` | FOREIGN KEY | FOREIGN KEY (template_id) REFERENCES communication_templates(id) ON DELETE SET NULL |
| `app_users` | `app_users_auth_user_id_key` | UNIQUE | UNIQUE (auth_user_id) |
| `app_users` | `app_users_id_fkey` | FOREIGN KEY | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE |
| `app_users` | `app_users_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `app_users` | `app_users_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `app_users` | `app_users_role_check` | CHECK | CHECK (role = ANY (ARRAY['admin'::text, 'ops'::text, 'vendor_owner'::text, 'vendor_worker'::text])) |
| `app_users` | `app_users_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL |
| `assignment_statuses` | `assignment_statuses_key_key` | UNIQUE | UNIQUE (key) |
| `assignment_statuses` | `assignment_statuses_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `assignments` | `assignments_assignment_status_id_fkey` | FOREIGN KEY | FOREIGN KEY (assignment_status_id) REFERENCES assignment_statuses(id) ON DELETE SET NULL |
| `assignments` | `assignments_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `assignments` | `assignments_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `assignments` | `assignments_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `assignments` | `assignments_schedule_id_fkey` | FOREIGN KEY | FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE |
| `assignments` | `assignments_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT |
| `assignments` | `assignments_vendor_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_user_id) REFERENCES vendor_users(id) ON DELETE SET NULL |
| `business_process_layout_assignments` | `business_process_layout_assignments_entity_layout_id_fkey` | FOREIGN KEY | FOREIGN KEY (entity_layout_id) REFERENCES entity_layouts(id) ON DELETE SET NULL |
| `business_process_layout_assignments` | `business_process_layout_assignments_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `business_process_layout_assignments` | `business_process_layout_assignments_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `business_process_layout_assignments` | `business_process_layout_assignments_surface_check` | CHECK | CHECK (surface = ANY (ARRAY['drawer'::text, 'queue'::text])) |
| `business_process_layout_assignments` | `business_process_layout_assignments_version_check` | CHECK | CHECK (version >= 1) |
| `campaigns` | `campaigns_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `charge_line_items` | `charge_line_items_amount_cents_nonzero_chk` | CHECK | CHECK (amount_cents <> 0) |
| `charge_line_items` | `charge_line_items_charge_id_fkey` | FOREIGN KEY | FOREIGN KEY (charge_id) REFERENCES charges(id) ON DELETE CASCADE |
| `charge_line_items` | `charge_line_items_job_line_item_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_line_item_id) REFERENCES job_line_items(id) ON DELETE SET NULL |
| `charge_line_items` | `charge_line_items_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `charge_line_items` | `charge_line_items_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `charges` | `charges_amount_cents_nonzero_chk` | CHECK | CHECK (amount_cents <> 0) |
| `charges` | `charges_billable_source_type_chk` | CHECK | CHECK (billable_source_type IS NULL OR (billable_source_type = ANY (ARRAY['job'::text, 'enrollment_a |
| `charges` | `charges_charge_category_chk` | CHECK | CHECK (charge_category IS NULL OR (charge_category = ANY (ARRAY['tuition'::text, 'deposit'::text, 'c |
| `charges` | `charges_charge_template_id_fkey` | FOREIGN KEY | FOREIGN KEY (charge_template_id) REFERENCES financial_charge_templates(id) ON DELETE SET NULL |
| `charges` | `charges_charge_type_chk` | CHECK | CHECK (charge_type = ANY (ARRAY['service'::text, 'fee'::text, 'adjustment'::text, 'cancellation_fee' |
| `charges` | `charges_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT |
| `charges` | `charges_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `charges` | `charges_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `charges` | `charges_schedule_id_fkey` | FOREIGN KEY | FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL |
| `charges` | `charges_service_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_id) REFERENCES financial_services(id) ON DELETE SET NULL |
| `charges` | `charges_source_charge_id_fkey` | FOREIGN KEY | FOREIGN KEY (source_charge_id) REFERENCES charges(id) ON DELETE SET NULL |
| `charges` | `charges_source_present_chk` | CHECK | CHECK (job_id IS NOT NULL OR billable_source_type IS NOT NULL AND billable_source_id IS NOT NULL) |
| `charges` | `charges_status_chk` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'posted'::text, 'partially_paid'::text, 'paid'::text, 'voi |
| `charges` | `charges_subscription_id_fkey` | FOREIGN KEY | FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id) ON DELETE SET NULL |
| `child_attendance_events` | `child_attendance_events_actor_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (actor_person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `child_attendance_events` | `child_attendance_events_actor_type_check` | CHECK | CHECK (actor_type = ANY (ARRAY['staff'::text, 'parent'::text, 'guardian'::text, 'emergency_contact': |
| `child_attendance_events` | `child_attendance_events_corrects_event_id_fkey` | FOREIGN KEY | FOREIGN KEY (corrects_event_id) REFERENCES child_attendance_events(id) ON DELETE RESTRICT |
| `child_attendance_events` | `child_attendance_events_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE RESTRICT |
| `child_attendance_events` | `child_attendance_events_enrollment_agreement_id_fkey` | FOREIGN KEY | FOREIGN KEY (enrollment_agreement_id) REFERENCES child_enrollment_agreements(id) ON DELETE CASCADE |
| `child_attendance_events` | `child_attendance_events_entry_link_shape` | CHECK | CHECK (entry_type = 'original'::text AND corrects_event_id IS NULL OR (entry_type = ANY (ARRAY['corr |
| `child_attendance_events` | `child_attendance_events_entry_type_check` | CHECK | CHECK (entry_type = ANY (ARRAY['original'::text, 'correction'::text, 'reversal'::text])) |
| `child_attendance_events` | `child_attendance_events_event_kind_check` | CHECK | CHECK (event_kind = ANY (ARRAY['check_in'::text, 'check_out'::text, 'absence'::text, 'present'::text |
| `child_attendance_events` | `child_attendance_events_from_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (from_room_location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `child_attendance_events` | `child_attendance_events_no_self_reference` | CHECK | CHECK (corrects_event_id IS NULL OR corrects_event_id <> id) |
| `child_attendance_events` | `child_attendance_events_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `child_attendance_events` | `child_attendance_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `child_attendance_events` | `child_attendance_events_presence_room` | CHECK | CHECK ((event_kind <> ALL (ARRAY['check_in'::text, 'present'::text])) OR room_location_id IS NOT NUL |
| `child_attendance_events` | `child_attendance_events_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (room_location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `child_attendance_events` | `child_attendance_events_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE RESTRICT |
| `child_attendance_events` | `child_attendance_events_source_key_nonempty` | CHECK | CHECK (char_length(btrim(source_key)) > 0) |
| `child_attendance_events` | `child_attendance_events_source_type_check` | CHECK | CHECK (source_type = ANY (ARRAY['operator_action'::text, 'staff_workspace'::text, 'parent_portal'::t |
| `child_attendance_events` | `child_attendance_events_to_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (to_room_location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `child_attendance_events` | `child_attendance_events_transfer_rooms` | CHECK | CHECK (event_kind <> 'room_transfer'::text OR from_room_location_id IS NOT NULL AND to_room_location |
| `child_enrollment_agreements` | `child_enrollment_agreements_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `child_enrollment_agreements` | `child_enrollment_agreements_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE RESTRICT |
| `child_enrollment_agreements` | `child_enrollment_agreements_end_after_start` | CHECK | CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date) |
| `child_enrollment_agreements` | `child_enrollment_agreements_opportunity_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_customer_member_id) REFERENCES opportunity_customer_members(id) ON DELETE S |
| `child_enrollment_agreements` | `child_enrollment_agreements_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL |
| `child_enrollment_agreements` | `child_enrollment_agreements_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `child_enrollment_agreements` | `child_enrollment_agreements_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `child_enrollment_agreements` | `child_enrollment_agreements_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `child_enrollment_agreements` | `child_enrollment_agreements_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE RESTRICT |
| `child_enrollment_agreements` | `child_enrollment_agreements_source_key_nonempty` | CHECK | CHECK (char_length(btrim(source_key)) > 0) |
| `child_enrollment_agreements` | `child_enrollment_agreements_status_check` | CHECK | CHECK (status = ANY (ARRAY['pending_start'::text, 'active'::text, 'ending'::text, 'ended'::text, 'ca |
| `child_placements` | `child_placements_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE RESTRICT |
| `child_placements` | `child_placements_end_after_start` | CHECK | CHECK (end_date IS NULL OR end_date >= start_date) |
| `child_placements` | `child_placements_enrollment_agreement_id_fkey` | FOREIGN KEY | FOREIGN KEY (enrollment_agreement_id) REFERENCES child_enrollment_agreements(id) ON DELETE CASCADE |
| `child_placements` | `child_placements_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `child_placements` | `child_placements_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `child_placements` | `child_placements_program_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_category_id) REFERENCES location_program_categories(id) ON DELETE SET NULL |
| `child_placements` | `child_placements_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (room_location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `child_placements` | `child_placements_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE RESTRICT |
| `child_placements` | `child_placements_source_key_nonempty` | CHECK | CHECK (char_length(btrim(source_key)) > 0) |
| `child_placements` | `child_placements_status_check` | CHECK | CHECK (status = ANY (ARRAY['planned'::text, 'active'::text, 'ending'::text, 'ended'::text, 'supersed |
| `child_placements` | `child_placements_supersedes_placement_id_fkey` | FOREIGN KEY | FOREIGN KEY (supersedes_placement_id) REFERENCES child_placements(id) ON DELETE SET NULL |
| `childcare_capacity_rules` | `childcare_capacity_rules_capacity_kind_check` | CHECK | CHECK (capacity_kind = ANY (ARRAY['physical'::text, 'licensed'::text, 'operational'::text])) |
| `childcare_capacity_rules` | `childcare_capacity_rules_capacity_nonneg` | CHECK | CHECK (capacity >= 0) |
| `childcare_capacity_rules` | `childcare_capacity_rules_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `childcare_capacity_rules` | `childcare_capacity_rules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `childcare_capacity_rules` | `childcare_capacity_rules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `childcare_capacity_rules` | `childcare_capacity_rules_program_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_category_id) REFERENCES location_program_categories(id) ON DELETE CASCADE |
| `childcare_capacity_rules` | `childcare_capacity_rules_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (room_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_capacity_rules` | `childcare_capacity_rules_scope_shape` | CHECK | CHECK (scope_type = 'org'::text AND site_location_id IS NULL AND program_category_id IS NULL AND roo |
| `childcare_capacity_rules` | `childcare_capacity_rules_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])) |
| `childcare_capacity_rules` | `childcare_capacity_rules_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_operating_windows` | `childcare_operating_windows_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `childcare_operating_windows` | `childcare_operating_windows_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `childcare_operating_windows` | `childcare_operating_windows_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `childcare_operating_windows` | `childcare_operating_windows_program_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_category_id) REFERENCES location_program_categories(id) ON DELETE CASCADE |
| `childcare_operating_windows` | `childcare_operating_windows_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (room_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_operating_windows` | `childcare_operating_windows_scope_shape` | CHECK | CHECK (scope_type = 'org'::text AND site_location_id IS NULL AND program_category_id IS NULL AND roo |
| `childcare_operating_windows` | `childcare_operating_windows_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])) |
| `childcare_operating_windows` | `childcare_operating_windows_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_operating_windows` | `childcare_operating_windows_time_order` | CHECK | CHECK (close_time > open_time) |
| `childcare_operating_windows` | `childcare_operating_windows_weekday_range` | CHECK | CHECK (weekday >= 0 AND weekday <= 6) |
| `childcare_rate_plans` | `childcare_rate_plans_billing_basis_check` | CHECK | CHECK (billing_basis = ANY (ARRAY['annual'::text, 'monthly'::text, 'weekly'::text, 'daily'::text, 's |
| `childcare_rate_plans` | `childcare_rate_plans_billing_cadence_check` | CHECK | CHECK (billing_cadence IS NULL OR (billing_cadence = ANY (ARRAY['monthly'::text, 'semi_monthly'::tex |
| `childcare_rate_plans` | `childcare_rate_plans_calculation_strategy_check` | CHECK | CHECK (calculation_strategy = ANY (ARRAY['scheduled'::text, 'attendance_actual'::text, 'hybrid'::tex |
| `childcare_rate_plans` | `childcare_rate_plans_currency_nonempty` | CHECK | CHECK (char_length(btrim(currency_code)) > 0) |
| `childcare_rate_plans` | `childcare_rate_plans_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `childcare_rate_plans` | `childcare_rate_plans_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `childcare_rate_plans` | `childcare_rate_plans_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `childcare_rate_plans` | `childcare_rate_plans_plan_key_nonempty` | CHECK | CHECK (char_length(btrim(plan_key)) > 0) |
| `childcare_rate_plans` | `childcare_rate_plans_program_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_category_id) REFERENCES location_program_categories(id) ON DELETE CASCADE |
| `childcare_rate_plans` | `childcare_rate_plans_proration_method_check` | CHECK | CHECK (proration_method IS NULL OR (proration_method = ANY (ARRAY['none'::text, 'daily'::text, 'cale |
| `childcare_rate_plans` | `childcare_rate_plans_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (room_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_rate_plans` | `childcare_rate_plans_scope_shape` | CHECK | CHECK (scope_type = 'org'::text AND site_location_id IS NULL AND program_category_id IS NULL AND roo |
| `childcare_rate_plans` | `childcare_rate_plans_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])) |
| `childcare_rate_plans` | `childcare_rate_plans_service_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_id) REFERENCES financial_services(id) ON DELETE SET NULL |
| `childcare_rate_plans` | `childcare_rate_plans_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_rate_rules` | `childcare_rate_rules_amount_nonneg` | CHECK | CHECK (amount_cents >= 0) |
| `childcare_rate_rules` | `childcare_rate_rules_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `childcare_rate_rules` | `childcare_rate_rules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `childcare_rate_rules` | `childcare_rate_rules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `childcare_rate_rules` | `childcare_rate_rules_rate_basis_check` | CHECK | CHECK (rate_basis = ANY (ARRAY['annual'::text, 'monthly'::text, 'weekly'::text, 'daily'::text, 'sess |
| `childcare_rate_rules` | `childcare_rate_rules_rate_plan_id_fkey` | FOREIGN KEY | FOREIGN KEY (rate_plan_id) REFERENCES childcare_rate_plans(id) ON DELETE CASCADE |
| `childcare_rate_rules` | `childcare_rate_rules_schedule_basis_check` | CHECK | CHECK (schedule_basis = ANY (ARRAY['full_day'::text, 'half_day'::text, 'three_day'::text, 'four_day' |
| `childcare_ratio_rule_tiers` | `childcare_ratio_rule_tiers_max_children_positive` | CHECK | CHECK (max_children > 0) |
| `childcare_ratio_rule_tiers` | `childcare_ratio_rule_tiers_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `childcare_ratio_rule_tiers` | `childcare_ratio_rule_tiers_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `childcare_ratio_rule_tiers` | `childcare_ratio_rule_tiers_ratio_rule_id_fkey` | FOREIGN KEY | FOREIGN KEY (ratio_rule_id) REFERENCES childcare_ratio_rules(id) ON DELETE CASCADE |
| `childcare_ratio_rule_tiers` | `childcare_ratio_rule_tiers_required_staff_positive` | CHECK | CHECK (required_staff > 0) |
| `childcare_ratio_rule_tiers` | `childcare_ratio_rule_tiers_unique_threshold` | UNIQUE | UNIQUE (ratio_rule_id, max_children) |
| `childcare_ratio_rules` | `childcare_ratio_rules_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `childcare_ratio_rules` | `childcare_ratio_rules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `childcare_ratio_rules` | `childcare_ratio_rules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `childcare_ratio_rules` | `childcare_ratio_rules_program_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_category_id) REFERENCES location_program_categories(id) ON DELETE CASCADE |
| `childcare_ratio_rules` | `childcare_ratio_rules_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (room_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_ratio_rules` | `childcare_ratio_rules_scope_shape` | CHECK | CHECK (scope_type = 'org'::text AND site_location_id IS NULL AND program_category_id IS NULL AND roo |
| `childcare_ratio_rules` | `childcare_ratio_rules_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])) |
| `childcare_ratio_rules` | `childcare_ratio_rules_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_schedule_rules` | `childcare_schedule_rules_days_range` | CHECK | CHECK ((min_days_per_week IS NULL OR min_days_per_week >= 0 AND min_days_per_week <= 7) AND (max_day |
| `childcare_schedule_rules` | `childcare_schedule_rules_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `childcare_schedule_rules` | `childcare_schedule_rules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `childcare_schedule_rules` | `childcare_schedule_rules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `childcare_schedule_rules` | `childcare_schedule_rules_program_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_category_id) REFERENCES location_program_categories(id) ON DELETE CASCADE |
| `childcare_schedule_rules` | `childcare_schedule_rules_room_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (room_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `childcare_schedule_rules` | `childcare_schedule_rules_scope_shape` | CHECK | CHECK (scope_type = 'org'::text AND site_location_id IS NULL AND program_category_id IS NULL AND roo |
| `childcare_schedule_rules` | `childcare_schedule_rules_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])) |
| `childcare_schedule_rules` | `childcare_schedule_rules_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `cleaning_job_addons` | `cleaning_job_addons_addon_type_id_fkey` | FOREIGN KEY | FOREIGN KEY (addon_type_id) REFERENCES addon_types(id) ON DELETE RESTRICT |
| `cleaning_job_addons` | `cleaning_job_addons_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `cleaning_job_addons` | `cleaning_job_addons_pkey` | PRIMARY KEY | PRIMARY KEY (job_id, addon_type_id) |
| `cleaning_job_details` | `cleaning_job_details_addon_frequency_id_fkey` | FOREIGN KEY | FOREIGN KEY (addon_frequency_id) REFERENCES addon_frequencies(id) ON DELETE SET NULL |
| `cleaning_job_details` | `cleaning_job_details_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `cleaning_job_details` | `cleaning_job_details_pkey` | PRIMARY KEY | PRIMARY KEY (job_id) |
| `cleaning_job_details` | `cleaning_job_details_service_type_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_type_id) REFERENCES cleaning_service_types(id) ON DELETE SET NULL |
| `cleaning_service_types` | `cleaning_service_types_key_key` | UNIQUE | UNIQUE (key) |
| `cleaning_service_types` | `cleaning_service_types_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_addons` | `commercial_addons_amount_cents_check` | CHECK | CHECK (amount_cents >= 0) |
| `commercial_addons` | `commercial_addons_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `commercial_addons` | `commercial_addons_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `commercial_addons` | `commercial_addons_package_expires_days_check` | CHECK | CHECK (package_expires_days IS NULL OR package_expires_days > 0) |
| `commercial_addons` | `commercial_addons_package_unit_count_check` | CHECK | CHECK (package_unit_count IS NULL OR package_unit_count > 0) |
| `commercial_addons` | `commercial_addons_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_categories` | `commercial_categories_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `commercial_categories` | `commercial_categories_org_key_unique` | UNIQUE | UNIQUE (org_id, key) |
| `commercial_categories` | `commercial_categories_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_deposits` | `commercial_deposits_amount_cents_check` | CHECK | CHECK (amount_cents >= 0) |
| `commercial_deposits` | `commercial_deposits_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `commercial_deposits` | `commercial_deposits_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `commercial_deposits` | `commercial_deposits_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_fees` | `commercial_fees_amount_cents_check` | CHECK | CHECK (amount_cents >= 0) |
| `commercial_fees` | `commercial_fees_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `commercial_fees` | `commercial_fees_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `commercial_fees` | `commercial_fees_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_policies` | `commercial_policies_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `commercial_policies` | `commercial_policies_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `commercial_policies` | `commercial_policies_offering_id_fkey` | FOREIGN KEY | FOREIGN KEY (offering_id) REFERENCES program_offerings(id) ON DELETE CASCADE |
| `commercial_policies` | `commercial_policies_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `commercial_policies` | `commercial_policies_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_policies` | `commercial_policies_policy_type_check` | CHECK | CHECK (policy_type = ANY (ARRAY['proration'::text, 'discount'::text, 'sibling_discount'::text, 'waiv |
| `commercial_policies` | `commercial_policies_scope_ref_chk` | CHECK | CHECK (scope_type = 'org'::text OR scope_type = 'location'::text AND location_id IS NOT NULL OR scop |
| `commercial_policies` | `commercial_policies_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['org'::text, 'location'::text, 'program'::text, 'offering'::text, 'va |
| `commercial_policies` | `commercial_policies_variant_id_fkey` | FOREIGN KEY | FOREIGN KEY (variant_id) REFERENCES program_offering_variants(id) ON DELETE CASCADE |
| `commercial_products` | `commercial_products_amount_cents_check` | CHECK | CHECK (amount_cents >= 0) |
| `commercial_products` | `commercial_products_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (category_id) REFERENCES commercial_categories(id) ON DELETE SET NULL |
| `commercial_products` | `commercial_products_commercial_type_check` | CHECK | CHECK (commercial_type = ANY (ARRAY['fee'::text, 'addon'::text, 'deposit'::text])) |
| `commercial_products` | `commercial_products_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `commercial_products` | `commercial_products_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `commercial_products` | `commercial_products_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_products` | `commercial_products_revenue_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (revenue_category_id) REFERENCES commercial_revenue_categories(id) ON DELETE SET NULL |
| `commercial_revenue_categories` | `commercial_revenue_categories_mapped_gl_account_id_fkey` | FOREIGN KEY | FOREIGN KEY (mapped_gl_account_id) REFERENCES gl_accounts(id) ON DELETE SET NULL |
| `commercial_revenue_categories` | `commercial_revenue_categories_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `commercial_revenue_categories` | `commercial_revenue_categories_org_label_unique` | UNIQUE | UNIQUE (org_id, label) |
| `commercial_revenue_categories` | `commercial_revenue_categories_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_tuition_rates` | `commercial_tuition_rates_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `commercial_tuition_rates` | `commercial_tuition_rates_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `commercial_tuition_rates` | `commercial_tuition_rates_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `commercial_tuition_rates` | `commercial_tuition_rates_rate_cents_check` | CHECK | CHECK (rate_cents >= 0) |
| `commercial_tuition_rates` | `commercial_tuition_rates_revenue_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (revenue_category_id) REFERENCES commercial_revenue_categories(id) ON DELETE SET NULL |
| `commercial_tuition_rates` | `commercial_tuition_rates_unique` | UNIQUE | UNIQUE NULLS NOT DISTINCT (org_id, location_id, variant_id, cadence_key, payer_type) |
| `commercial_tuition_rates` | `commercial_tuition_rates_variant_id_fkey` | FOREIGN KEY | FOREIGN KEY (variant_id) REFERENCES program_offering_variants(id) ON DELETE CASCADE |
| `communication_delivery_events` | `communication_delivery_events_message_id_fkey` | FOREIGN KEY | FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE |
| `communication_delivery_events` | `communication_delivery_events_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_delivery_events` | `communication_delivery_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_delivery_events` | `communication_delivery_events_recipient_id_fkey` | FOREIGN KEY | FOREIGN KEY (recipient_id) REFERENCES communication_message_recipients(id) ON DELETE SET NULL |
| `communication_identities` | `communication_identities_address_nonempty` | CHECK | CHECK (char_length(btrim(normalized_address)) > 0) |
| `communication_identities` | `communication_identities_channel_check` | CHECK | CHECK (channel = ANY (ARRAY['sms'::text, 'email'::text, 'voice'::text, 'internal'::text])) |
| `communication_identities` | `communication_identities_health_status_check` | CHECK | CHECK (health_status = ANY (ARRAY['unknown'::text, 'healthy'::text, 'degraded'::text, 'unavailable': |
| `communication_identities` | `communication_identities_legacy_binding_id_fkey` | FOREIGN KEY | FOREIGN KEY (legacy_binding_id) REFERENCES communication_provider_bindings(id) ON DELETE SET NULL |
| `communication_identities` | `communication_identities_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_identities` | `communication_identities_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_identities` | `communication_identities_provider_account_id_fkey` | FOREIGN KEY | FOREIGN KEY (provider_account_id) REFERENCES communication_provider_accounts(id) ON DELETE CASCADE |
| `communication_identities` | `communication_identities_scope_check` | CHECK | CHECK (scope = ANY (ARRAY['tenant'::text, 'location'::text, 'department'::text, 'system'::text])) |
| `communication_identities` | `communication_identities_status_check` | CHECK | CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text])) |
| `communication_identities` | `communication_identities_type_nonempty` | CHECK | CHECK (char_length(btrim(identity_type)) > 0) |
| `communication_identities` | `communication_identities_verification_state_check` | CHECK | CHECK (verification_state = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'faile |
| `communication_identity_grants` | `communication_identity_grants_identity_id_fkey` | FOREIGN KEY | FOREIGN KEY (identity_id) REFERENCES communication_identities(id) ON DELETE CASCADE |
| `communication_identity_grants` | `communication_identity_grants_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_identity_grants` | `communication_identity_grants_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_identity_grants` | `communication_identity_grants_status_check` | CHECK | CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text])) |
| `communication_identity_grants` | `communication_identity_grants_user_uq` | UNIQUE | UNIQUE (org_id, identity_id, user_id) |
| `communication_identity_location_bindings` | `communication_identity_location_bindings_channel_check` | CHECK | CHECK (channel = ANY (ARRAY['sms'::text, 'email'::text, 'voice'::text, 'internal'::text])) |
| `communication_identity_location_bindings` | `communication_identity_location_bindings_identity_id_fkey` | FOREIGN KEY | FOREIGN KEY (identity_id) REFERENCES communication_identities(id) ON DELETE CASCADE |
| `communication_identity_location_bindings` | `communication_identity_location_bindings_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `communication_identity_location_bindings` | `communication_identity_location_bindings_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_identity_location_bindings` | `communication_identity_location_bindings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_identity_location_bindings` | `communication_identity_location_bindings_status_check` | CHECK | CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text])) |
| `communication_message_reads` | `communication_message_reads_message_id_fkey` | FOREIGN KEY | FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE |
| `communication_message_reads` | `communication_message_reads_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_message_reads` | `communication_message_reads_pkey` | PRIMARY KEY | PRIMARY KEY (message_id, user_id) |
| `communication_message_recipients` | `communication_message_recipients_message_id_fkey` | FOREIGN KEY | FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE |
| `communication_message_recipients` | `communication_message_recipients_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_message_recipients` | `communication_message_recipients_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_message_recipients` | `communication_message_recipients_recipient_role_check` | CHECK | CHECK (recipient_role = ANY (ARRAY['to'::text, 'cc'::text, 'bcc'::text])) |
| `communication_messages` | `communication_messages_channel_check` | CHECK | CHECK (channel = ANY (ARRAY['sms'::text, 'email'::text, 'in_app'::text])) |
| `communication_messages` | `communication_messages_communication_identity_id_fkey` | FOREIGN KEY | FOREIGN KEY (communication_identity_id) REFERENCES communication_identities(id) ON DELETE SET NULL |
| `communication_messages` | `communication_messages_communication_provider_account_id_fkey` | FOREIGN KEY | FOREIGN KEY (communication_provider_account_id) REFERENCES communication_provider_accounts(id) ON DE |
| `communication_messages` | `communication_messages_communication_provider_binding_id_fkey` | FOREIGN KEY | FOREIGN KEY (communication_provider_binding_id) REFERENCES communication_provider_bindings(id) ON DE |
| `communication_messages` | `communication_messages_direction_check` | CHECK | CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text])) |
| `communication_messages` | `communication_messages_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_messages` | `communication_messages_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_messages` | `communication_messages_thread_id_fkey` | FOREIGN KEY | FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE CASCADE |
| `communication_messages` | `communication_messages_workflow_run_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL |
| `communication_preference_events` | `communication_preference_events_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_preference_events` | `communication_preference_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_preferences` | `communication_preferences_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_preferences` | `communication_preferences_person_category_uq` | UNIQUE | UNIQUE (org_id, person_id, category) |
| `communication_preferences` | `communication_preferences_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_provider_accounts` | `communication_provider_accounts_health_status_check` | CHECK | CHECK (health_status = ANY (ARRAY['unknown'::text, 'healthy'::text, 'degraded'::text, 'unavailable': |
| `communication_provider_accounts` | `communication_provider_accounts_legacy_binding_id_fkey` | FOREIGN KEY | FOREIGN KEY (legacy_binding_id) REFERENCES communication_provider_bindings(id) ON DELETE SET NULL |
| `communication_provider_accounts` | `communication_provider_accounts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_provider_accounts` | `communication_provider_accounts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_provider_accounts` | `communication_provider_accounts_provider_type_nonempty` | CHECK | CHECK (char_length(btrim(provider_type)) > 0) |
| `communication_provider_accounts` | `communication_provider_accounts_status_check` | CHECK | CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'pending_verification'::text])) |
| `communication_provider_accounts` | `communication_provider_accounts_verification_state_check` | CHECK | CHECK (verification_state = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'faile |
| `communication_provider_bindings` | `communication_provider_bindings_channel_check` | CHECK | CHECK (channel = ANY (ARRAY['sms'::text, 'email'::text])) |
| `communication_provider_bindings` | `communication_provider_bindings_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `communication_provider_bindings` | `communication_provider_bindings_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_provider_bindings` | `communication_provider_bindings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_provider_bindings` | `communication_provider_bindings_scope_check` | CHECK | CHECK (scope = ANY (ARRAY['org'::text, 'location'::text, 'user'::text])) |
| `communication_provider_bindings` | `communication_provider_bindings_status_check` | CHECK | CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'pending_verification'::text])) |
| `communication_scheduled_sends` | `chk_comm_sched_sends_schedule_after_approval` | CHECK | CHECK (scheduled_for > approved_at) |
| `communication_scheduled_sends` | `comm_sched_sends_source_entity_chk` | CHECK | CHECK (source = 'announcement'::text AND announcement_id IS NOT NULL AND entity_type = 'announcement |
| `communication_scheduled_sends` | `communication_scheduled_sends_announcement_id_fkey` | FOREIGN KEY | FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE |
| `communication_scheduled_sends` | `communication_scheduled_sends_channel_check` | CHECK | CHECK (channel = ANY (ARRAY['sms'::text, 'email'::text])) |
| `communication_scheduled_sends` | `communication_scheduled_sends_communication_message_id_fkey` | FOREIGN KEY | FOREIGN KEY (communication_message_id) REFERENCES communication_messages(id) ON DELETE SET NULL |
| `communication_scheduled_sends` | `communication_scheduled_sends_communication_provider_bindi_fkey` | FOREIGN KEY | FOREIGN KEY (communication_provider_binding_id) REFERENCES communication_provider_bindings(id) ON DE |
| `communication_scheduled_sends` | `communication_scheduled_sends_entity_id_fkey` | FOREIGN KEY | FOREIGN KEY (entity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `communication_scheduled_sends` | `communication_scheduled_sends_entity_type_check` | CHECK | CHECK (entity_type = ANY (ARRAY['opportunities'::text, 'announcements'::text])) |
| `communication_scheduled_sends` | `communication_scheduled_sends_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_scheduled_sends` | `communication_scheduled_sends_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_scheduled_sends` | `communication_scheduled_sends_proposal_id_fkey` | FOREIGN KEY | FOREIGN KEY (proposal_id) REFERENCES task_assist_proposals(id) ON DELETE SET NULL |
| `communication_scheduled_sends` | `communication_scheduled_sends_recipient_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (recipient_person_id) REFERENCES persons(id) ON DELETE RESTRICT |
| `communication_scheduled_sends` | `communication_scheduled_sends_source_check` | CHECK | CHECK (source = ANY (ARRAY['task_assist'::text, 'tour_scheduling'::text, 'announcement'::text])) |
| `communication_scheduled_sends` | `communication_scheduled_sends_status_check` | CHECK | CHECK (status = ANY (ARRAY['pending'::text, 'claimed'::text, 'queued'::text, 'sent'::text, 'canceled |
| `communication_snippets` | `communication_snippets_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_snippets` | `communication_snippets_org_name_uq` | UNIQUE | UNIQUE (org_id, name) |
| `communication_snippets` | `communication_snippets_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_template_versions` | `communication_template_versions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_template_versions` | `communication_template_versions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_template_versions` | `communication_template_versions_template_id_fkey` | FOREIGN KEY | FOREIGN KEY (template_id) REFERENCES communication_templates(id) ON DELETE CASCADE |
| `communication_template_versions` | `communication_template_versions_template_version_uq` | UNIQUE | UNIQUE (template_id, version) |
| `communication_templates` | `communication_templates_approval_status_check` | CHECK | CHECK (approval_status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text])) |
| `communication_templates` | `communication_templates_channel_check` | CHECK | CHECK (channel = ANY (ARRAY['email'::text, 'sms'::text, 'in_app'::text])) |
| `communication_templates` | `communication_templates_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_templates` | `communication_templates_org_name_uq` | UNIQUE | UNIQUE (org_id, name) |
| `communication_templates` | `communication_templates_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `communication_templates` | `communication_templates_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])) |
| `communication_threads` | `communication_threads_assignment_state_chk` | CHECK | CHECK (assignment_state = ANY (ARRAY['unassigned'::text, 'assigned'::text])) |
| `communication_threads` | `communication_threads_channel_check` | CHECK | CHECK (channel = ANY (ARRAY['sms'::text, 'email'::text, 'in_app'::text])) |
| `communication_threads` | `communication_threads_identity_uq` | UNIQUE | UNIQUE (org_id, primary_entity_type, primary_entity_id, channel, recipient_key) |
| `communication_threads` | `communication_threads_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `communication_threads` | `communication_threads_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `communication_threads` | `communication_threads_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `config_layout_assist_proposals` | `chk_config_layout_assist_proposals_apply_mode` | CHECK | CHECK (apply_mode = ANY (ARRAY['single_operation'::text, 'batched_atomic'::text, 'recommendation_onl |
| `config_layout_assist_proposals` | `chk_config_layout_assist_proposals_risk` | CHECK | CHECK (risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])) |
| `config_layout_assist_proposals` | `chk_config_layout_assist_proposals_state` | CHECK | CHECK (state = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text, 'rejected'::text, 'appl |
| `config_layout_assist_proposals` | `config_layout_assist_proposals_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `config_layout_assist_proposals` | `config_layout_assist_proposals_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `configuration_consumptions` | `configuration_consumptions_delivered_by_run_id_fkey` | FOREIGN KEY | FOREIGN KEY (delivered_by_run_id) REFERENCES configuration_distribution_runs(id) ON DELETE RESTRICT |
| `configuration_consumptions` | `configuration_consumptions_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT |
| `configuration_consumptions` | `configuration_consumptions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `configuration_consumptions` | `configuration_consumptions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `configuration_consumptions` | `configuration_consumptions_publication_id_fkey` | FOREIGN KEY | FOREIGN KEY (publication_id) REFERENCES configuration_publications(id) ON DELETE RESTRICT |
| `configuration_consumptions` | `configuration_consumptions_subject_location_unique` | UNIQUE | UNIQUE (org_id, domain_key, subject_id, location_id) |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_attempt_number_check` | CHECK | CHECK (attempt_number > 0) |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_attempted_by_fkey` | FOREIGN KEY | FOREIGN KEY (attempted_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_audit_event_id_fkey` | FOREIGN KEY | FOREIGN KEY (audit_event_id) REFERENCES workflow_events(id) ON DELETE SET NULL |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_error_shape` | CHECK | CHECK (status = 'failed'::text AND error_message IS NOT NULL OR status <> 'failed'::text) |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_run_id_fkey` | FOREIGN KEY | FOREIGN KEY (run_id) REFERENCES configuration_distribution_runs(id) ON DELETE RESTRICT |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_status_check` | CHECK | CHECK (status = ANY (ARRAY['applied'::text, 'unchanged'::text, 'failed'::text])) |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_target_id_fkey` | FOREIGN KEY | FOREIGN KEY (target_id) REFERENCES configuration_distribution_targets(id) ON DELETE RESTRICT |
| `configuration_delivery_attempts` | `configuration_delivery_attempts_target_number_unique` | UNIQUE | UNIQUE (target_id, attempt_number) |
| `configuration_distribution_runs` | `configuration_distribution_runs_created_by_fkey` | FOREIGN KEY | FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `configuration_distribution_runs` | `configuration_distribution_runs_idempotency_unique` | UNIQUE | UNIQUE (org_id, idempotency_key) |
| `configuration_distribution_runs` | `configuration_distribution_runs_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `configuration_distribution_runs` | `configuration_distribution_runs_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `configuration_distribution_runs` | `configuration_distribution_runs_provider_version_check` | CHECK | CHECK (provider_version > 0) |
| `configuration_distribution_runs` | `configuration_distribution_runs_publication_id_fkey` | FOREIGN KEY | FOREIGN KEY (publication_id) REFERENCES configuration_publications(id) ON DELETE RESTRICT |
| `configuration_distribution_runs` | `configuration_distribution_runs_status_check` | CHECK | CHECK (status = ANY (ARRAY['planned'::text, 'running'::text, 'completed'::text, 'partial_failure'::t |
| `configuration_distribution_targets` | `configuration_distribution_targets_attempt_count_check` | CHECK | CHECK (attempt_count >= 0) |
| `configuration_distribution_targets` | `configuration_distribution_targets_error_shape` | CHECK | CHECK (status = 'failed'::text AND error_message IS NOT NULL OR status <> 'failed'::text) |
| `configuration_distribution_targets` | `configuration_distribution_targets_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT |
| `configuration_distribution_targets` | `configuration_distribution_targets_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `configuration_distribution_targets` | `configuration_distribution_targets_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `configuration_distribution_targets` | `configuration_distribution_targets_run_id_fkey` | FOREIGN KEY | FOREIGN KEY (run_id) REFERENCES configuration_distribution_runs(id) ON DELETE CASCADE |
| `configuration_distribution_targets` | `configuration_distribution_targets_run_location_unique` | UNIQUE | UNIQUE (run_id, location_id) |
| `configuration_distribution_targets` | `configuration_distribution_targets_status_check` | CHECK | CHECK (status = ANY (ARRAY['pending'::text, 'applied'::text, 'unchanged'::text, 'failed'::text])) |
| `configuration_publications` | `configuration_publications_audit_event_id_fkey` | FOREIGN KEY | FOREIGN KEY (audit_event_id) REFERENCES workflow_events(id) ON DELETE SET NULL |
| `configuration_publications` | `configuration_publications_domain_nonempty` | CHECK | CHECK (char_length(btrim(domain_key)) > 0) |
| `configuration_publications` | `configuration_publications_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `configuration_publications` | `configuration_publications_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `configuration_publications` | `configuration_publications_published_by_fkey` | FOREIGN KEY | FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `configuration_publications` | `configuration_publications_revision_number_check` | CHECK | CHECK (revision_number > 0) |
| `configuration_publications` | `configuration_publications_revision_unique` | UNIQUE | UNIQUE (org_id, domain_key, revision_id) |
| `configuration_publications` | `configuration_publications_subject_number_unique` | UNIQUE | UNIQUE (org_id, domain_key, subject_id, revision_number) |
| `consumption_event_types` | `consumption_event_types_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `consumption_event_types` | `consumption_event_types_family_nonempty` | CHECK | CHECK (char_length(btrim(source_family)) > 0) |
| `consumption_event_types` | `consumption_event_types_key_nonempty` | CHECK | CHECK (char_length(btrim(event_key)) > 0) |
| `consumption_event_types` | `consumption_event_types_label_nonempty` | CHECK | CHECK (char_length(btrim(label)) > 0) |
| `consumption_event_types` | `consumption_event_types_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `consumption_event_types` | `consumption_event_types_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `consumption_events` | `consumption_events_corrects_event_id_fkey` | FOREIGN KEY | FOREIGN KEY (corrects_event_id) REFERENCES consumption_events(id) ON DELETE RESTRICT |
| `consumption_events` | `consumption_events_corrects_no_self` | CHECK | CHECK (corrects_event_id IS NULL OR corrects_event_id <> id) |
| `consumption_events` | `consumption_events_event_key_nonempty` | CHECK | CHECK (char_length(btrim(event_key)) > 0) |
| `consumption_events` | `consumption_events_event_type_id_fkey` | FOREIGN KEY | FOREIGN KEY (event_type_id) REFERENCES consumption_event_types(id) ON DELETE SET NULL |
| `consumption_events` | `consumption_events_family_nonempty` | CHECK | CHECK (char_length(btrim(source_family)) > 0) |
| `consumption_events` | `consumption_events_idempotency_nonempty` | CHECK | CHECK (char_length(btrim(idempotency_key)) > 0) |
| `consumption_events` | `consumption_events_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `consumption_events` | `consumption_events_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `consumption_events` | `consumption_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `consumption_events` | `consumption_events_status_check` | CHECK | CHECK (status = ANY (ARRAY['recorded'::text, 'resolved'::text, 'no_obligation'::text, 'superseded':: |
| `contact_tags` | `contact_tags_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE |
| `contact_tags` | `contact_tags_pkey` | PRIMARY KEY | PRIMARY KEY (contact_id, tag_id) |
| `contact_tags` | `contact_tags_tag_id_fkey` | FOREIGN KEY | FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE |
| `contacts` | `contacts_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `contacts` | `contacts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `contacts` | `contacts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `contacts` | `contacts_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL |
| `contacts` | `fk_contacts_person_id` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `conversation_assignment_events` | `conversation_assignment_events_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `conversation_assignment_events` | `conversation_assignment_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `conversation_assignment_events` | `conversation_assignment_events_thread_id_fkey` | FOREIGN KEY | FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE CASCADE |
| `customer_member_contact_roles` | `customer_member_contact_roles_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `customer_member_contact_roles` | `customer_member_contact_roles_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customer_member_contact_roles` | `customer_member_contact_roles_unique` | UNIQUE | UNIQUE (org_id, role_key) |
| `customer_member_contacts` | `customer_member_contacts_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE |
| `customer_member_contacts` | `customer_member_contacts_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE |
| `customer_member_contacts` | `customer_member_contacts_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE CASCADE |
| `customer_member_contacts` | `customer_member_contacts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `customer_member_contacts` | `customer_member_contacts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customer_member_contacts` | `customer_member_contacts_unique` | UNIQUE | UNIQUE (org_id, customer_member_id, contact_id, role_key) |
| `customer_member_relationship_types` | `customer_member_relationship_types_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `customer_member_relationship_types` | `customer_member_relationship_types_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customer_members` | `customer_members_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE |
| `customer_members` | `customer_members_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `customer_members` | `customer_members_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customer_members` | `fk_customer_members_person_id` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `customer_payment_methods` | `customer_payment_methods_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) |
| `customer_payment_methods` | `customer_payment_methods_customer_id_stripe_payment_method__key` | UNIQUE | UNIQUE (customer_id, stripe_payment_method_id) |
| `customer_payment_methods` | `customer_payment_methods_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customer_person_role_types` | `customer_person_role_types_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customer_person_role_types` | `fk_customer_person_role_types_industry` | FOREIGN KEY | FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE |
| `customer_person_role_types` | `fk_customer_person_role_types_vertical` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `customer_persons` | `customer_persons_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customer_persons` | `fk_customer_persons_customer` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE |
| `customer_persons` | `fk_customer_persons_person` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE |
| `customer_persons` | `uq_customer_persons_unique` | UNIQUE | UNIQUE (org_id, customer_id, person_id, role_type) |
| `customer_subscriptions` | `customer_subscriptions_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE |
| `customer_subscriptions` | `customer_subscriptions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customer_subscriptions` | `customer_subscriptions_primary_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) |
| `customer_subscriptions` | `customer_subscriptions_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) |
| `customer_tags` | `customer_tags_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE |
| `customer_tags` | `customer_tags_pkey` | PRIMARY KEY | PRIMARY KEY (customer_id, tag_id) |
| `customer_tags` | `customer_tags_tag_id_fkey` | FOREIGN KEY | FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE |
| `customer_vertical_job_counters` | `customer_vertical_job_counters_pkey` | PRIMARY KEY | PRIMARY KEY (customer_id, vertical_id) |
| `customer_vertical_job_counters` | `uniq_counter_per_customer_vertical` | UNIQUE | UNIQUE (customer_id, vertical_id) |
| `customers` | `customers_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `customers` | `customers_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customers` | `customers_primary_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `customers` | `customers_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE RESTRICT |
| `departments` | `departments_key_nonempty` | CHECK | CHECK (btrim(key) <> ''::text) |
| `departments` | `departments_name_nonempty` | CHECK | CHECK (btrim(name) <> ''::text) |
| `departments` | `departments_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `departments` | `departments_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `departments` | `uq_departments_org_key` | UNIQUE | UNIQUE (org_id, key) |
| `discount_applications` | `discount_applications_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `discount_applications` | `discount_applications_customer_subscription_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_subscription_id) REFERENCES customer_subscriptions(id) ON DELETE SET NULL |
| `discount_applications` | `discount_applications_discount_amount_cents_check` | CHECK | CHECK (discount_amount_cents >= 0) |
| `discount_applications` | `discount_applications_discount_commitment_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_commitment_id) REFERENCES discount_commitments(id) ON DELETE SET NULL |
| `discount_applications` | `discount_applications_discount_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_program_id) REFERENCES discount_programs(id) ON DELETE RESTRICT |
| `discount_applications` | `discount_applications_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL |
| `discount_applications` | `discount_applications_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL |
| `discount_applications` | `discount_applications_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `discount_applications` | `discount_applications_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `discount_applications` | `discount_applications_source_check` | CHECK | CHECK (source = ANY (ARRAY['system'::text, 'admin'::text, 'workflow'::text, 'api'::text, 'code'::tex |
| `discount_applications` | `discount_applications_status_check` | CHECK | CHECK (status = ANY (ARRAY['proposed'::text, 'applied'::text, 'reversed'::text, 'expired'::text, 'vo |
| `discount_applications` | `discount_applications_target_entity_type_check` | CHECK | CHECK (target_entity_type = ANY (ARRAY['opportunity'::text, 'job'::text, 'customer_subscription'::te |
| `discount_codes` | `discount_codes_code_key` | UNIQUE | UNIQUE (code) |
| `discount_codes` | `discount_codes_code_unique` | UNIQUE | UNIQUE (code) |
| `discount_codes` | `discount_codes_discount_type_check` | CHECK | CHECK (discount_type = ANY (ARRAY['percent'::text, 'fixed'::text])) |
| `discount_codes` | `discount_codes_discount_value_check` | CHECK | CHECK (discount_value >= 0::numeric) |
| `discount_codes` | `discount_codes_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `discount_codes` | `uniq_discount_codes_code` | UNIQUE | UNIQUE (code) |
| `discount_commitments` | `discount_commitments_breach_policy_check` | CHECK | CHECK (breach_policy = ANY (ARRAY['none'::text, 'charge_back'::text, 'convert_to_credit'::text, 'man |
| `discount_commitments` | `discount_commitments_completed_service_count_check` | CHECK | CHECK (completed_service_count >= 0) |
| `discount_commitments` | `discount_commitments_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT |
| `discount_commitments` | `discount_commitments_customer_subscription_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_subscription_id) REFERENCES customer_subscriptions(id) ON DELETE SET NULL |
| `discount_commitments` | `discount_commitments_discount_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_program_id) REFERENCES discount_programs(id) ON DELETE RESTRICT |
| `discount_commitments` | `discount_commitments_granted_application_fkey` | FOREIGN KEY | FOREIGN KEY (granted_discount_application_id) REFERENCES discount_applications(id) ON DELETE SET NUL |
| `discount_commitments` | `discount_commitments_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `discount_commitments` | `discount_commitments_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `discount_commitments` | `discount_commitments_progress_chk` | CHECK | CHECK (completed_service_count <= required_service_count) |
| `discount_commitments` | `discount_commitments_required_service_count_check` | CHECK | CHECK (required_service_count > 0) |
| `discount_commitments` | `discount_commitments_status_check` | CHECK | CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'fulfilled'::text, 'breached'::text, 'ex |
| `discount_commitments` | `discount_commitments_window_chk` | CHECK | CHECK (window_end_at >= window_start_at) |
| `discount_program_benefits` | `discount_program_benefits_amount_cents_check` | CHECK | CHECK (amount_cents IS NULL OR amount_cents >= 0) |
| `discount_program_benefits` | `discount_program_benefits_applies_to_check` | CHECK | CHECK (applies_to = ANY (ARRAY['order'::text, 'service'::text, 'first_service'::text, 'nth_service': |
| `discount_program_benefits` | `discount_program_benefits_benefit_type_check` | CHECK | CHECK (benefit_type = ANY (ARRAY['percent_off'::text, 'fixed_amount_off'::text, 'free_service'::text |
| `discount_program_benefits` | `discount_program_benefits_discount_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_program_id) REFERENCES discount_programs(id) ON DELETE CASCADE |
| `discount_program_benefits` | `discount_program_benefits_max_discount_cents_check` | CHECK | CHECK (max_discount_cents IS NULL OR max_discount_cents >= 0) |
| `discount_program_benefits` | `discount_program_benefits_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `discount_program_benefits` | `discount_program_benefits_percent_basis_points_check` | CHECK | CHECK (percent_basis_points IS NULL OR percent_basis_points >= 0 AND percent_basis_points <= 10000) |
| `discount_program_benefits` | `discount_program_benefits_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `discount_program_benefits` | `discount_program_benefits_service_index_check` | CHECK | CHECK (service_index IS NULL OR service_index > 0) |
| `discount_program_benefits` | `discount_program_benefits_value_present_chk` | CHECK | CHECK (amount_cents IS NOT NULL OR percent_basis_points IS NOT NULL OR (benefit_type = ANY (ARRAY['f |
| `discount_program_commitment_rules` | `discount_program_commitment__max_redemptions_per_customer_check` | CHECK | CHECK (max_redemptions_per_customer IS NULL OR max_redemptions_per_customer > 0) |
| `discount_program_commitment_rules` | `discount_program_commitment_rul_qualifying_service_status_check` | CHECK | CHECK (qualifying_service_status = ANY (ARRAY['booked'::text, 'completed'::text])) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_benefit_grant_timing_check` | CHECK | CHECK (benefit_grant_timing = ANY (ARRAY['upfront'::text, 'after_fulfillment'::text])) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_breach_policy_check` | CHECK | CHECK (breach_policy = ANY (ARRAY['none'::text, 'charge_back'::text, 'convert_to_credit'::text, 'man |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_commitment_start_mode_check` | CHECK | CHECK (commitment_start_mode = ANY (ARRAY['first_service_booked'::text, 'first_service_completed'::t |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_discount_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_program_id) REFERENCES discount_programs(id) ON DELETE CASCADE |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_enrollment_mode_check` | CHECK | CHECK (enrollment_mode = ANY (ARRAY['automatic'::text, 'manual'::text])) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_program_unique` | UNIQUE | UNIQUE (discount_program_id) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_required_service_count_check` | CHECK | CHECK (required_service_count > 0) |
| `discount_program_commitment_rules` | `discount_program_commitment_rules_timeframe_days_check` | CHECK | CHECK (timeframe_days > 0) |
| `discount_program_qualifiers` | `discount_program_qualifiers_discount_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_program_id) REFERENCES discount_programs(id) ON DELETE CASCADE |
| `discount_program_qualifiers` | `discount_program_qualifiers_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `discount_program_qualifiers` | `discount_program_qualifiers_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `discount_programs` | `discount_programs_applies_to_entity_type_check` | CHECK | CHECK (applies_to_entity_type = ANY (ARRAY['opportunity'::text, 'job'::text, 'customer_subscription' |
| `discount_programs` | `discount_programs_max_total_uses_check` | CHECK | CHECK (max_total_uses IS NULL OR max_total_uses >= 0) |
| `discount_programs` | `discount_programs_max_uses_per_customer_check` | CHECK | CHECK (max_uses_per_customer IS NULL OR max_uses_per_customer >= 0) |
| `discount_programs` | `discount_programs_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `discount_programs` | `discount_programs_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `discount_programs` | `discount_programs_program_type_check` | CHECK | CHECK (program_type = ANY (ARRAY['code'::text, 'auto'::text, 'commitment'::text, 'subscription'::tex |
| `discount_programs` | `discount_programs_stacking_mode_check` | CHECK | CHECK (stacking_mode = ANY (ARRAY['exclusive'::text, 'stackable'::text, 'best_of'::text])) |
| `discount_programs` | `discount_programs_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])) |
| `discount_programs` | `discount_programs_valid_window_chk` | CHECK | CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from) |
| `discount_redemptions` | `discount_redemptions_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) |
| `discount_redemptions` | `discount_redemptions_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) |
| `discount_redemptions` | `discount_redemptions_discount_code_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) |
| `discount_redemptions` | `discount_redemptions_discount_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_program_id) REFERENCES discount_programs(id) |
| `discount_redemptions` | `discount_redemptions_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) |
| `discount_redemptions` | `discount_redemptions_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) |
| `discount_redemptions` | `discount_redemptions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `discount_redemptions` | `uniq_redemption_per_contact_code` | UNIQUE | UNIQUE (contact_id, discount_code_id) |
| `discounts` | `discounts_campaign_id_fkey` | FOREIGN KEY | FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL |
| `discounts` | `discounts_code_key` | UNIQUE | UNIQUE (code) |
| `discounts` | `discounts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `document_field_definitions` | `document_field_definitions_org_doc_type_field_key_key` | UNIQUE | UNIQUE (org_id, doc_type, field_key) |
| `document_field_definitions` | `document_field_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `document_field_definitions` | `document_field_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `document_field_values` | `document_field_values_document_id_field_key_key` | UNIQUE | UNIQUE (document_id, field_key) |
| `document_field_values` | `document_field_values_document_id_fkey` | FOREIGN KEY | FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE |
| `document_field_values` | `document_field_values_field_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (field_definition_id) REFERENCES document_field_definitions(id) ON DELETE SET NULL |
| `document_field_values` | `document_field_values_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `document_field_values` | `document_field_values_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `document_versions` | `document_versions_document_id_fkey` | FOREIGN KEY | FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE |
| `document_versions` | `document_versions_document_id_version_number_key` | UNIQUE | UNIQUE (document_id, version_number) |
| `document_versions` | `document_versions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `document_versions` | `document_versions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `documents` | `documents_generated_from_document_id_fkey` | FOREIGN KEY | FOREIGN KEY (generated_from_document_id) REFERENCES documents(id) ON DELETE SET NULL |
| `documents` | `documents_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `documents` | `documents_owner_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (owner_contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `documents` | `documents_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `entity_labels` | `entity_labels_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `entity_labels` | `entity_labels_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `entity_labels` | `entity_labels_unique` | UNIQUE | UNIQUE (org_id, entity_type) |
| `entity_layouts` | `entity_layouts_org_entity_surface_key_version` | UNIQUE | UNIQUE (org_id, entity_type, surface, layout_key, version) |
| `entity_layouts` | `entity_layouts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `entity_layouts` | `entity_layouts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `entity_layouts` | `entity_layouts_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])) |
| `entity_layouts` | `entity_layouts_surface_check` | CHECK | CHECK (surface = ANY (ARRAY['drawer'::text, 'queue'::text, 'workspace'::text])) |
| `entity_layouts` | `entity_layouts_version_check` | CHECK | CHECK (version >= 1) |
| `external_mappings` | `external_mappings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `external_mappings` | `external_mappings_source_entity_type_external_id_key` | UNIQUE | UNIQUE (source, entity_type, external_id) |
| `field_definitions` | `field_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `field_definitions` | `field_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `field_section_definitions` | `field_section_definitions_org_entity_section_key` | UNIQUE | UNIQUE (org_id, entity_type, section_key) |
| `field_section_definitions` | `field_section_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `field_section_definitions` | `field_section_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `field_values` | `field_values_field_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id) ON DELETE CASCADE |
| `field_values` | `field_values_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `field_values` | `field_values_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `financial_charge_templates` | `financial_charge_templates_amount_shape` | CHECK | CHECK (amount_strategy = 'fixed'::text AND amount_cents IS NOT NULL AND amount_cents >= 0 OR amount_ |
| `financial_charge_templates` | `financial_charge_templates_amount_strategy_check` | CHECK | CHECK (amount_strategy = ANY (ARRAY['fixed'::text, 'rate_derived'::text, 'usage_derived'::text, 'att |
| `financial_charge_templates` | `financial_charge_templates_billable_on_check` | CHECK | CHECK (billable_on_strategy = ANY (ARRAY['immediate'::text, 'offset_days'::text, 'next_billing_cycle |
| `financial_charge_templates` | `financial_charge_templates_category_check` | CHECK | CHECK (charge_category = ANY (ARRAY['tuition'::text, 'deposit'::text, 'consumable_fee'::text, 'late_ |
| `financial_charge_templates` | `financial_charge_templates_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `financial_charge_templates` | `financial_charge_templates_key_nonempty` | CHECK | CHECK (char_length(btrim(template_key)) > 0) |
| `financial_charge_templates` | `financial_charge_templates_label_nonempty` | CHECK | CHECK (char_length(btrim(label)) > 0) |
| `financial_charge_templates` | `financial_charge_templates_occurs_on_check` | CHECK | CHECK (occurs_on_strategy = ANY (ARRAY['now'::text, 'event_date'::text, 'service_period_start'::text |
| `financial_charge_templates` | `financial_charge_templates_offset_shape` | CHECK | CHECK (billable_on_strategy = 'offset_days'::text AND billable_offset_days IS NOT NULL AND billable_ |
| `financial_charge_templates` | `financial_charge_templates_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `financial_charge_templates` | `financial_charge_templates_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `financial_charge_templates` | `financial_charge_templates_service_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_id) REFERENCES financial_services(id) ON DELETE SET NULL |
| `financial_charge_templates` | `financial_charge_templates_trigger_type_check` | CHECK | CHECK (trigger_type = ANY (ARRAY['manual'::text, 'event'::text, 'attendance'::text, 'schedule'::text |
| `financial_policies` | `financial_policies_end_after_start` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `financial_policies` | `financial_policies_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `financial_policies` | `financial_policies_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `financial_policies` | `financial_policies_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `financial_policies` | `financial_policies_policy_type_check` | CHECK | CHECK (policy_type = ANY (ARRAY['proration'::text, 'billing_cadence'::text, 'grace_period'::text, 'l |
| `financial_policies` | `financial_policies_rate_plan_id_fkey` | FOREIGN KEY | FOREIGN KEY (rate_plan_id) REFERENCES childcare_rate_plans(id) ON DELETE CASCADE |
| `financial_policies` | `financial_policies_scope_shape` | CHECK | CHECK (scope_type = 'org'::text AND location_id IS NULL AND service_id IS NULL AND rate_plan_id IS N |
| `financial_policies` | `financial_policies_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['org'::text, 'location'::text, 'service'::text, 'rate_plan'::text])) |
| `financial_policies` | `financial_policies_service_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_id) REFERENCES financial_services(id) ON DELETE CASCADE |
| `financial_services` | `financial_services_key_nonempty` | CHECK | CHECK (char_length(btrim(service_key)) > 0) |
| `financial_services` | `financial_services_label_nonempty` | CHECK | CHECK (char_length(btrim(label)) > 0) |
| `financial_services` | `financial_services_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `financial_services` | `financial_services_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `financial_services` | `financial_services_type_check` | CHECK | CHECK (service_type = ANY (ARRAY['recurring'::text, 'one_time'::text, 'usage'::text, 'attendance_der |
| `financial_services` | `financial_services_unique_key` | UNIQUE | UNIQUE (org_id, service_key) |
| `form_definition_versions` | `chk_form_definition_versions_publish_metadata_consistency` | CHECK | CHECK ((status = ANY (ARRAY['published'::text, 'archived'::text])) AND published_at IS NOT NULL OR s |
| `form_definition_versions` | `chk_form_definition_versions_status` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])) |
| `form_definition_versions` | `form_definition_versions_form_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_definition_id) REFERENCES form_definitions(id) ON DELETE CASCADE |
| `form_definition_versions` | `form_definition_versions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_definition_versions` | `form_definition_versions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_definition_versions` | `uq_form_definition_versions_definition_version` | UNIQUE | UNIQUE (form_definition_id, version_number) |
| `form_definitions` | `chk_form_definitions_kind` | CHECK | CHECK (kind = ANY (ARRAY['state'::text, 'center'::text])) |
| `form_definitions` | `form_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_definitions` | `form_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_definitions` | `uq_form_definitions_org_key` | UNIQUE | UNIQUE (org_id, key) |
| `form_packet_definitions` | `form_packet_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_packet_definitions` | `form_packet_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_packet_definitions` | `uq_form_packet_definitions_org_key` | UNIQUE | UNIQUE (org_id, key) |
| `form_packet_items` | `chk_form_packet_items_sequence_nonneg` | CHECK | CHECK (sequence_index >= 0) |
| `form_packet_items` | `form_packet_items_form_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_definition_id) REFERENCES form_definitions(id) ON DELETE RESTRICT |
| `form_packet_items` | `form_packet_items_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_packet_items` | `form_packet_items_packet_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (packet_definition_id) REFERENCES form_packet_definitions(id) ON DELETE CASCADE |
| `form_packet_items` | `form_packet_items_pinned_form_definition_version_id_fkey` | FOREIGN KEY | FOREIGN KEY (pinned_form_definition_version_id) REFERENCES form_definition_versions(id) ON DELETE SE |
| `form_packet_items` | `form_packet_items_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_packet_items` | `uq_form_packet_items_packet_sequence` | UNIQUE | UNIQUE (packet_definition_id, sequence_index) |
| `form_packet_session_items` | `chk_form_packet_session_items_seq_nonneg` | CHECK | CHECK (sequence_index >= 0) |
| `form_packet_session_items` | `chk_form_packet_session_items_status` | CHECK | CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'submitted'::text, 'skipped'::text])) |
| `form_packet_session_items` | `form_packet_session_items_form_submission_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE SET NULL |
| `form_packet_session_items` | `form_packet_session_items_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_packet_session_items` | `form_packet_session_items_packet_item_id_fkey` | FOREIGN KEY | FOREIGN KEY (packet_item_id) REFERENCES form_packet_items(id) ON DELETE RESTRICT |
| `form_packet_session_items` | `form_packet_session_items_packet_session_id_fkey` | FOREIGN KEY | FOREIGN KEY (packet_session_id) REFERENCES form_packet_sessions(id) ON DELETE CASCADE |
| `form_packet_session_items` | `form_packet_session_items_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_packet_session_items` | `uq_form_packet_session_items_session_packet_item` | UNIQUE | UNIQUE (packet_session_id, packet_item_id) |
| `form_packet_session_items` | `uq_form_packet_session_items_session_sequence` | UNIQUE | UNIQUE (packet_session_id, sequence_index) |
| `form_packet_sessions` | `chk_form_packet_sessions_operator_review_status` | CHECK | CHECK (operator_review_status IS NULL OR (operator_review_status = ANY (ARRAY['needs_review'::text,  |
| `form_packet_sessions` | `chk_form_packet_sessions_seq_nonneg` | CHECK | CHECK (current_sequence_index >= 0) |
| `form_packet_sessions` | `chk_form_packet_sessions_status` | CHECK | CHECK (status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'cancelled'::text])) |
| `form_packet_sessions` | `form_packet_sessions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_packet_sessions` | `form_packet_sessions_packet_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (packet_definition_id) REFERENCES form_packet_definitions(id) ON DELETE RESTRICT |
| `form_packet_sessions` | `form_packet_sessions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_packet_sessions` | `form_packet_sessions_started_via_public_link_id_fkey` | FOREIGN KEY | FOREIGN KEY (started_via_public_link_id) REFERENCES form_public_links(id) ON DELETE CASCADE |
| `form_public_links` | `form_public_links_form_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_definition_id) REFERENCES form_definitions(id) ON DELETE CASCADE |
| `form_public_links` | `form_public_links_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_public_links` | `form_public_links_pinned_form_definition_version_id_fkey` | FOREIGN KEY | FOREIGN KEY (pinned_form_definition_version_id) REFERENCES form_definition_versions(id) ON DELETE SE |
| `form_public_links` | `form_public_links_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_public_links` | `uq_form_public_links_token_hash` | UNIQUE | UNIQUE (token_hash) |
| `form_submission_documents` | `chk_form_submission_documents_role` | CHECK | CHECK (role = ANY (ARRAY['generated_pdf'::text, 'signature_asset'::text, 'upload'::text, 'other'::te |
| `form_submission_documents` | `form_submission_documents_document_id_fkey` | FOREIGN KEY | FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE |
| `form_submission_documents` | `form_submission_documents_form_submission_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE |
| `form_submission_documents` | `form_submission_documents_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_submission_documents` | `form_submission_documents_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_submission_documents` | `uq_form_submission_documents_sub_doc` | UNIQUE | UNIQUE (form_submission_id, document_id) |
| `form_submission_signatures` | `chk_form_submission_signatures_kind` | CHECK | CHECK (signature_kind = ANY (ARRAY['typed'::text, 'drawn'::text])) |
| `form_submission_signatures` | `form_submission_signatures_drawn_asset_document_id_fkey` | FOREIGN KEY | FOREIGN KEY (drawn_asset_document_id) REFERENCES documents(id) ON DELETE SET NULL |
| `form_submission_signatures` | `form_submission_signatures_form_submission_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE |
| `form_submission_signatures` | `form_submission_signatures_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_submission_signatures` | `form_submission_signatures_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `form_submission_signatures` | `uq_form_submission_signatures_field_instance` | UNIQUE | UNIQUE (form_submission_id, field_id, instance_key) |
| `form_submissions` | `chk_form_submissions_status` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'void'::text])) |
| `form_submissions` | `form_submissions_created_via_public_link_id_fkey` | FOREIGN KEY | FOREIGN KEY (created_via_public_link_id) REFERENCES form_public_links(id) ON DELETE SET NULL |
| `form_submissions` | `form_submissions_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `form_submissions` | `form_submissions_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE SET NULL |
| `form_submissions` | `form_submissions_form_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_definition_id) REFERENCES form_definitions(id) ON DELETE RESTRICT |
| `form_submissions` | `form_submissions_form_definition_version_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_definition_version_id) REFERENCES form_definition_versions(id) ON DELETE RESTRICT |
| `form_submissions` | `form_submissions_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL |
| `form_submissions` | `form_submissions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `form_submissions` | `form_submissions_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `form_submissions` | `form_submissions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `gl_account_mappings` | `gl_account_mappings_gl_account_id_fkey` | FOREIGN KEY | FOREIGN KEY (gl_account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT |
| `gl_account_mappings` | `gl_account_mappings_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `gl_account_mappings` | `gl_account_mappings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `gl_accounts` | `gl_accounts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `gl_accounts` | `gl_accounts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `gl_accounts` | `gl_accounts_type_check` | CHECK | CHECK (type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'revenue'::text, 'expense |
| `gl_journal_entries` | `gl_journal_entries_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `gl_journal_entries` | `gl_journal_entries_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `gl_journal_entries` | `gl_journal_entries_reversal_of_entry_id_fkey` | FOREIGN KEY | FOREIGN KEY (reversal_of_entry_id) REFERENCES gl_journal_entries(id) ON DELETE SET NULL |
| `gl_journal_entries` | `gl_journal_entries_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'posted'::text, 'void'::text])) |
| `gl_journal_lines` | `gl_journal_lines_account_id_fkey` | FOREIGN KEY | FOREIGN KEY (account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT |
| `gl_journal_lines` | `gl_journal_lines_billable_source_type_chk` | CHECK | CHECK (billable_source_type IS NULL OR (billable_source_type = ANY (ARRAY['job'::text, 'enrollment_a |
| `gl_journal_lines` | `gl_journal_lines_credit_nonneg` | CHECK | CHECK (credit_cents >= 0) |
| `gl_journal_lines` | `gl_journal_lines_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `gl_journal_lines` | `gl_journal_lines_debit_credit_chk` | CHECK | CHECK (debit_cents >= 0 AND credit_cents >= 0 AND NOT (debit_cents > 0 AND credit_cents > 0) AND NOT |
| `gl_journal_lines` | `gl_journal_lines_debit_nonneg` | CHECK | CHECK (debit_cents >= 0) |
| `gl_journal_lines` | `gl_journal_lines_entry_id_fkey` | FOREIGN KEY | FOREIGN KEY (entry_id) REFERENCES gl_journal_entries(id) ON DELETE CASCADE |
| `gl_journal_lines` | `gl_journal_lines_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL |
| `gl_journal_lines` | `gl_journal_lines_one_sided` | CHECK | CHECK (debit_cents > 0 AND credit_cents = 0 OR credit_cents > 0 AND debit_cents = 0) |
| `gl_journal_lines` | `gl_journal_lines_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `gl_journal_lines` | `gl_journal_lines_payment_id_fkey` | FOREIGN KEY | FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL |
| `gl_journal_lines` | `gl_journal_lines_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `gl_journal_lines` | `gl_journal_lines_schedule_id_fkey` | FOREIGN KEY | FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL |
| `gl_journal_lines` | `gl_journal_lines_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL |
| `home_types` | `home_types_key_key` | UNIQUE | UNIQUE (key) |
| `home_types` | `home_types_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `industries` | `industries_key_unique` | UNIQUE | UNIQUE (key) |
| `industries` | `industries_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `industry_default_entity_labels` | `industry_default_entity_labels_industry_fkey` | FOREIGN KEY | FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE |
| `industry_default_entity_labels` | `industry_default_entity_labels_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `industry_default_entity_labels` | `industry_default_entity_labels_unique` | UNIQUE | UNIQUE (industry_id, entity_type) |
| `job_line_items` | `job_line_items_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `job_line_items` | `job_line_items_line_type_check` | CHECK | CHECK (line_type = ANY (ARRAY['service'::text, 'addon'::text, 'discount'::text, 'fee'::text, 'adjust |
| `job_line_items` | `job_line_items_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `job_line_items` | `job_line_items_replaced_line_item_id_fkey` | FOREIGN KEY | FOREIGN KEY (replaced_line_item_id) REFERENCES job_line_items(id) |
| `job_pricing_snapshots` | `job_pricing_snapshots_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `job_pricing_snapshots` | `job_pricing_snapshots_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `job_statuses` | `job_statuses_key_key` | UNIQUE | UNIQUE (key) |
| `job_statuses` | `job_statuses_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `job_statuses` | `job_statuses_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `job_tags` | `job_tags_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `job_tags` | `job_tags_pkey` | PRIMARY KEY | PRIMARY KEY (job_id, tag_id) |
| `job_tags` | `job_tags_tag_id_fkey` | FOREIGN KEY | FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE |
| `jobs` | `chk_jobs_amounts_nonnegative` | CHECK | CHECK ((estimated_total_cents IS NULL OR estimated_total_cents >= 0) AND (recurring_total_cents IS N |
| `jobs` | `jobs_assigned_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (assigned_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL |
| `jobs` | `jobs_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT |
| `jobs` | `jobs_discount_code_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) |
| `jobs` | `jobs_discount_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_program_id) REFERENCES discount_programs(id) ON DELETE SET NULL |
| `jobs` | `jobs_job_status_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_status_id) REFERENCES job_statuses(id) ON DELETE SET NULL |
| `jobs` | `jobs_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `jobs` | `jobs_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL |
| `jobs` | `jobs_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `jobs` | `jobs_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `jobs` | `jobs_pricing_status_check` | CHECK | CHECK (pricing_status = ANY (ARRAY['draft'::text, 'locked'::text, 'overridden'::text, 'finalized'::t |
| `jobs` | `jobs_primary_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `jobs` | `jobs_primary_person_fk` | FOREIGN KEY | FOREIGN KEY (primary_person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `jobs` | `jobs_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE RESTRICT |
| `jobs` | `jobs_work_unit_id_fkey` | FOREIGN KEY | FOREIGN KEY (work_unit_id) REFERENCES work_units(id) ON DELETE SET NULL |
| `ledger_transactions` | `ledger_transactions_amount_cents_check` | CHECK | CHECK (amount_cents >= 0) |
| `ledger_transactions` | `ledger_transactions_billable_source_type_chk` | CHECK | CHECK (billable_source_type IS NULL OR (billable_source_type = ANY (ARRAY['job'::text, 'enrollment_a |
| `ledger_transactions` | `ledger_transactions_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `ledger_transactions` | `ledger_transactions_direction_chk` | CHECK | CHECK (direction = ANY (ARRAY['in'::text, 'out'::text])) |
| `ledger_transactions` | `ledger_transactions_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL |
| `ledger_transactions` | `ledger_transactions_journal_entry_id_fkey` | FOREIGN KEY | FOREIGN KEY (journal_entry_id) REFERENCES gl_journal_entries(id) ON DELETE SET NULL |
| `ledger_transactions` | `ledger_transactions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `ledger_transactions` | `ledger_transactions_payment_id_fkey` | FOREIGN KEY | FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL |
| `ledger_transactions` | `ledger_transactions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `ledger_transactions` | `ledger_transactions_schedule_id_fkey` | FOREIGN KEY | FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL |
| `ledger_transactions` | `ledger_transactions_status_check` | CHECK | CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text, 'reversed'::text])) |
| `ledger_transactions` | `ledger_transactions_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL |
| `location_program_categories` | `location_program_categories_configuration_consumption_id_fkey` | FOREIGN KEY | FOREIGN KEY (configuration_consumption_id) REFERENCES configuration_consumptions(id) ON DELETE SET N |
| `location_program_categories` | `location_program_categories_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `location_program_categories` | `location_program_categories_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `location_program_categories` | `location_program_categories_org_location_key_unique` | UNIQUE | UNIQUE (org_id, location_id, key) |
| `location_program_categories` | `location_program_categories_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `location_program_categories` | `location_program_categories_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT |
| `location_program_categories` | `location_program_categories_program_revision_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_revision_id) REFERENCES program_revisions(id) ON DELETE RESTRICT |
| `location_tags` | `location_tags_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `location_tags` | `location_tags_pkey` | PRIMARY KEY | PRIMARY KEY (location_id, tag_id) |
| `location_tags` | `location_tags_tag_id_fkey` | FOREIGN KEY | FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE |
| `location_types` | `location_types_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `location_types` | `location_types_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `location_types` | `location_types_unique` | UNIQUE | UNIQUE (org_id, key) |
| `locations` | `fk_locations_access_method` | FOREIGN KEY | FOREIGN KEY (access_method_id) REFERENCES access_methods(id) ON DELETE SET NULL |
| `locations` | `locations_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE |
| `locations` | `locations_location_type_check` | CHECK | CHECK (location_type = ANY (ARRAY['address'::text, 'site'::text, 'unit'::text])) |
| `locations` | `locations_location_type_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_type_id) REFERENCES location_types(id) ON DELETE SET NULL |
| `locations` | `locations_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `locations` | `locations_owner_xor_check` | CHECK | CHECK (NOT (customer_id IS NOT NULL AND vendor_id IS NOT NULL)) |
| `locations` | `locations_parent_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (parent_location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `locations` | `locations_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `locations` | `locations_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL |
| `messages_outbox` | `messages_outbox_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `messages_outbox` | `messages_outbox_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `messages_outbox` | `messages_outbox_workflow_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL |
| `messages_outbox` | `messages_outbox_workflow_run_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL |
| `messages` | `messages_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `messages` | `messages_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `messages` | `messages_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL |
| `messages` | `messages_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL |
| `messages` | `messages_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `messages` | `messages_workflow_run_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL |
| `metric_definitions` | `metric_definitions_entity_scope_check` | CHECK | CHECK (entity_scope = ANY (ARRAY['org'::text, 'site'::text, 'department'::text, 'work_unit'::text, ' |
| `metric_definitions` | `metric_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `metric_definitions` | `metric_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `metric_definitions` | `metric_definitions_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])) |
| `metric_placements` | `metric_placements_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `metric_placements` | `metric_placements_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `metric_placements` | `metric_placements_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text, 'hidden'::text])) |
| `metric_placements` | `metric_placements_surface_check` | CHECK | CHECK (surface = ANY (ARRAY['workspace_header'::text, 'business_process_tile'::text, 'work_unit_head |
| `metric_placements` | `metric_placements_visualization_id_fkey` | FOREIGN KEY | FOREIGN KEY (visualization_id) REFERENCES metric_visualizations(id) ON DELETE CASCADE |
| `metric_platform_snapshots` | `metric_platform_snapshots_health_check` | CHECK | CHECK (health_state = ANY (ARRAY['healthy'::text, 'warning'::text, 'critical'::text, 'unknown'::text |
| `metric_platform_snapshots` | `metric_platform_snapshots_metric_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (metric_definition_id) REFERENCES metric_definitions(id) ON DELETE CASCADE |
| `metric_platform_snapshots` | `metric_platform_snapshots_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `metric_platform_snapshots` | `metric_platform_snapshots_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `metric_rollups` | `metric_rollups_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `metric_rollups` | `metric_rollups_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `metric_rollups` | `metric_rollups_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])) |
| `metric_rollups` | `metric_rollups_type_check` | CHECK | CHECK (rollup_type = ANY (ARRAY['sum'::text, 'avg'::text, 'weighted_avg'::text, 'best'::text, 'worst |
| `metric_snapshots` | `metric_snapshots_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `metric_snapshots` | `metric_snapshots_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `metric_snapshots` | `metric_snapshots_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'department'::text, 'work_unit'::text])) |
| `metric_visualizations` | `metric_visualizations_metric_definition_id_fkey` | FOREIGN KEY | FOREIGN KEY (metric_definition_id) REFERENCES metric_definitions(id) ON DELETE CASCADE |
| `metric_visualizations` | `metric_visualizations_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `metric_visualizations` | `metric_visualizations_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `metric_visualizations` | `metric_visualizations_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])) |
| `metric_visualizations` | `metric_visualizations_type_check` | CHECK | CHECK (visualization_type = ANY (ARRAY['kpi_card'::text, 'trend_card'::text, 'sparkline'::text, 'lin |
| `mutation_events` | `mutation_events_origin_check` | CHECK | CHECK (origin = ANY (ARRAY['operator'::text, 'automation'::text, 'api'::text, 'system'::text])) |
| `mutation_events` | `mutation_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `operational_authorities` | `operational_authorities_effective_window` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `operational_authorities` | `operational_authorities_key_nonempty` | CHECK | CHECK (char_length(btrim(authority_key)) > 0) |
| `operational_authorities` | `operational_authorities_kind_check` | CHECK | CHECK (authority_kind = ANY (ARRAY['operational'::text, 'licensing'::text, 'policy'::text, 'process' |
| `operational_authorities` | `operational_authorities_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `operational_authorities` | `operational_authorities_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `operational_authority_assignments` | `oe_authority_assignments_effective_window` | CHECK | CHECK (effective_end IS NULL OR effective_end >= effective_start) |
| `operational_authority_assignments` | `oe_authority_assignments_holder_type_check` | CHECK | CHECK (holder_type = ANY (ARRAY['human'::text, 'policy'::text, 'process'::text, 'external'::text])) |
| `operational_authority_assignments` | `oe_authority_assignments_revocation_shape` | CHECK | CHECK (status = 'granted'::text AND supersedes_assignment_id IS NULL OR status = 'revoked'::text AND |
| `operational_authority_assignments` | `oe_authority_assignments_scope_shape` | CHECK | CHECK (scope_type = 'organization'::text AND scope_id IS NULL OR scope_type <> 'organization'::text  |
| `operational_authority_assignments` | `oe_authority_assignments_scope_type_check` | CHECK | CHECK (scope_type = ANY (ARRAY['organization'::text, 'location'::text, 'business_process'::text, 'su |
| `operational_authority_assignments` | `oe_authority_assignments_status_check` | CHECK | CHECK (status = ANY (ARRAY['granted'::text, 'revoked'::text])) |
| `operational_authority_assignments` | `operational_authority_assignments_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `operational_authority_assignments` | `operational_authority_assignments_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `operational_authority_assignments` | `operational_authority_assignments_supersedes_assignment_id_fkey` | FOREIGN KEY | FOREIGN KEY (supersedes_assignment_id) REFERENCES operational_authority_assignments(id) ON DELETE RE |
| `operational_expectation_ratifications` | `oe_ratifications_new_standing_binding` | CHECK | CHECK (new_standing = 'binding'::text) |
| `operational_expectation_ratifications` | `oe_ratifications_prior_standing_check` | CHECK | CHECK (prior_standing = ANY (ARRAY['proposed'::text, 'model'::text, 'binding'::text])) |
| `operational_expectation_ratifications` | `operational_expectation_ratifications_expectation_id_fkey` | FOREIGN KEY | FOREIGN KEY (expectation_id) REFERENCES operational_expectations(id) ON DELETE RESTRICT |
| `operational_expectation_ratifications` | `operational_expectation_ratifications_lineage_root_id_fkey` | FOREIGN KEY | FOREIGN KEY (lineage_root_id) REFERENCES operational_expectations(id) ON DELETE RESTRICT |
| `operational_expectation_ratifications` | `operational_expectation_ratifications_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `operational_expectation_ratifications` | `operational_expectation_ratifications_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `operational_expectations` | `operational_expectations_author_class_check` | CHECK | CHECK (author_class = ANY (ARRAY['human'::text, 'policy'::text, 'process'::text, 'ai'::text, 'extern |
| `operational_expectations` | `operational_expectations_create_link_shape` | CHECK | CHECK (verb = 'create'::text AND supersedes_expectation_id IS NULL AND transition_type IS NULL OR ve |
| `operational_expectations` | `operational_expectations_lineage_root_id_fkey` | FOREIGN KEY | FOREIGN KEY (lineage_root_id) REFERENCES operational_expectations(id) ON DELETE RESTRICT |
| `operational_expectations` | `operational_expectations_modality_check` | CHECK | CHECK (modality = ANY (ARRAY['required'::text, 'prohibited'::text, 'intended'::text, 'committed'::te |
| `operational_expectations` | `operational_expectations_no_self_reference` | CHECK | CHECK (supersedes_expectation_id IS NULL OR supersedes_expectation_id <> id) |
| `operational_expectations` | `operational_expectations_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `operational_expectations` | `operational_expectations_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `operational_expectations` | `operational_expectations_standing_check` | CHECK | CHECK (standing = ANY (ARRAY['proposed'::text, 'binding'::text, 'model'::text])) |
| `operational_expectations` | `operational_expectations_subject_ref_present` | CHECK | CHECK (subject_ref IS NOT NULL AND subject_ref <> 'null'::jsonb) |
| `operational_expectations` | `operational_expectations_supersedes_expectation_id_fkey` | FOREIGN KEY | FOREIGN KEY (supersedes_expectation_id) REFERENCES operational_expectations(id) ON DELETE RESTRICT |
| `operational_expectations` | `operational_expectations_temporal_frame_present` | CHECK | CHECK (jsonb_typeof(temporal_frame) = 'object'::text AND temporal_frame <> '{}'::jsonb) |
| `operational_expectations` | `operational_expectations_transition_type_check` | CHECK | CHECK (transition_type IS NULL OR (transition_type = ANY (ARRAY['revision'::text, 'correction'::text |
| `operational_expectations` | `operational_expectations_valid_window` | CHECK | CHECK (valid_to IS NULL OR valid_to >= valid_from) |
| `operational_expectations` | `operational_expectations_verb_check` | CHECK | CHECK (verb = ANY (ARRAY['create'::text, 'revise'::text, 'correct'::text, 'replace'::text, 'cancel': |
| `operational_expectations` | `operational_expectations_verb_transition_map` | CHECK | CHECK (verb = 'create'::text AND transition_type IS NULL OR verb = 'revise'::text AND transition_typ |
| `operational_tasks` | `operational_tasks_entity_id_fkey` | FOREIGN KEY | FOREIGN KEY (entity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `operational_tasks` | `operational_tasks_entity_link_check` | CHECK | CHECK (entity_type IS NULL AND entity_id IS NULL OR entity_type = 'opportunities'::text AND entity_i |
| `operational_tasks` | `operational_tasks_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `operational_tasks` | `operational_tasks_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `operational_tasks` | `operational_tasks_proposal_id_fkey` | FOREIGN KEY | FOREIGN KEY (proposal_id) REFERENCES task_assist_proposals(id) ON DELETE SET NULL |
| `operational_tasks` | `operational_tasks_source_check` | CHECK | CHECK (source = ANY (ARRAY['task_assist'::text, 'manual'::text])) |
| `operational_tasks` | `operational_tasks_status_check` | CHECK | CHECK (status = ANY (ARRAY['open'::text, 'completed'::text, 'canceled'::text])) |
| `opportunities` | `opportunities_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `opportunities` | `opportunities_discount_code_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) |
| `opportunities` | `opportunities_discount_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (discount_program_id) REFERENCES discount_programs(id) ON DELETE SET NULL |
| `opportunities` | `opportunities_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `opportunities` | `opportunities_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `opportunities` | `opportunities_pipeline_id_fkey` | FOREIGN KEY | FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE SET NULL |
| `opportunities` | `opportunities_pipeline_stage_id_fkey` | FOREIGN KEY | FOREIGN KEY (pipeline_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL |
| `opportunities` | `opportunities_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `opportunities` | `opportunities_primary_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `opportunities` | `opportunities_primary_person_fk` | FOREIGN KEY | FOREIGN KEY (primary_person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `opportunities` | `opportunities_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE RESTRICT |
| `opportunities` | `opportunities_work_unit_id_fkey` | FOREIGN KEY | FOREIGN KEY (work_unit_id) REFERENCES work_units(id) |
| `opportunity_customer_members` | `opportunity_customer_members_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE CASCADE |
| `opportunity_customer_members` | `opportunity_customer_members_desired_program_category_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_category_id) REFERENCES location_program_categories(id) ON DELETE SET NULL |
| `opportunity_customer_members` | `opportunity_customer_members_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `opportunity_customer_members` | `opportunity_customer_members_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `opportunity_customer_members` | `opportunity_customer_members_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `opportunity_customer_members` | `uq_opportunity_customer_members_unique` | UNIQUE | UNIQUE (org_id, opportunity_id, customer_member_id) |
| `opportunity_persons` | `opportunity_persons_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `opportunity_persons` | `opportunity_persons_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `opportunity_persons` | `opportunity_persons_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE |
| `opportunity_persons` | `opportunity_persons_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `opportunity_persons` | `uq_opportunity_persons_opp_person` | UNIQUE | UNIQUE (opportunity_id, person_id) |
| `opportunity_tags` | `opportunity_tags_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `opportunity_tags` | `opportunity_tags_pkey` | PRIMARY KEY | PRIMARY KEY (opportunity_id, tag_id) |
| `opportunity_tags` | `opportunity_tags_tag_id_fkey` | FOREIGN KEY | FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE |
| `option_set_items` | `option_set_items_option_set_id_fkey` | FOREIGN KEY | FOREIGN KEY (option_set_id) REFERENCES option_sets(id) ON DELETE CASCADE |
| `option_set_items` | `option_set_items_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `option_set_items` | `option_set_items_set_item_key` | UNIQUE | UNIQUE (option_set_id, item_key) |
| `option_sets` | `option_sets_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `option_sets` | `option_sets_org_set_key` | UNIQUE | UNIQUE (org_id, set_key) |
| `option_sets` | `option_sets_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `org_settings` | `org_settings_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `org_settings` | `org_settings_org_id_key` | UNIQUE | UNIQUE (org_id) |
| `org_settings` | `org_settings_payout_type_check` | CHECK | CHECK (payout_type = ANY (ARRAY['percentage'::text, 'flat'::text])) |
| `org_settings` | `org_settings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `orgs` | `orgs_industry_id_fkey` | FOREIGN KEY | FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE SET NULL |
| `orgs` | `orgs_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `orgs` | `orgs_slug_key` | UNIQUE | UNIQUE (slug) |
| `payment_allocations` | `payment_allocations_allocated_amount_positive_chk` | CHECK | CHECK (allocated_amount_cents > 0) |
| `payment_allocations` | `payment_allocations_allocation_type_chk` | CHECK | CHECK (allocation_type = ANY (ARRAY['payment_application'::text])) |
| `payment_allocations` | `payment_allocations_charge_id_fkey` | FOREIGN KEY | FOREIGN KEY (charge_id) REFERENCES charges(id) ON DELETE SET NULL |
| `payment_allocations` | `payment_allocations_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `payment_allocations` | `payment_allocations_payment_id_fkey` | FOREIGN KEY | FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT |
| `payment_allocations` | `payment_allocations_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `payment_allocations` | `payment_allocations_reversal_consistency_chk` | CHECK | CHECK (status = 'reversed'::text AND reversed_at IS NOT NULL OR status = 'active'::text AND reversed |
| `payment_allocations` | `payment_allocations_status_chk` | CHECK | CHECK (status = ANY (ARRAY['active'::text, 'reversed'::text])) |
| `payment_allocations` | `payment_allocations_target_type_nonempty_chk` | CHECK | CHECK (length(TRIM(BOTH FROM target_entity_type)) > 0) |
| `payment_statuses` | `payment_statuses_key_key` | UNIQUE | UNIQUE (key) |
| `payment_statuses` | `payment_statuses_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `payments` | `payments_amount_positive_chk` | CHECK | CHECK (amount_cents > 0) |
| `payments` | `payments_currency_nonempty_chk` | CHECK | CHECK (length(TRIM(BOTH FROM currency)) > 0) |
| `payments` | `payments_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT |
| `payments` | `payments_direction_chk` | CHECK | CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text])) |
| `payments` | `payments_failed_at_status_chk` | CHECK | CHECK (failed_at IS NULL OR status = 'failed'::text) |
| `payments` | `payments_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `payments` | `payments_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `payments` | `payments_payer_pair_chk` | CHECK | CHECK (payer_entity_type IS NULL AND payer_entity_id IS NULL OR payer_entity_type IS NOT NULL AND pa |
| `payments` | `payments_payment_method_chk` | CHECK | CHECK (payment_method = ANY (ARRAY['card'::text, 'ach'::text, 'cash'::text, 'check'::text, 'manual': |
| `payments` | `payments_payment_status_id_fkey` | FOREIGN KEY | FOREIGN KEY (payment_status_id) REFERENCES payment_statuses(id) ON DELETE SET NULL |
| `payments` | `payments_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `payments` | `payments_posted_at_status_chk` | CHECK | CHECK (posted_at IS NULL OR status = 'posted'::text) |
| `payments` | `payments_status_chk` | CHECK | CHECK (status = ANY (ARRAY['pending'::text, 'posted'::text, 'failed'::text, 'voided'::text])) |
| `payments` | `payments_voided_at_status_chk` | CHECK | CHECK (voided_at IS NULL OR status = 'voided'::text) |
| `permission_definitions` | `permission_definitions_key_key` | UNIQUE | UNIQUE (key) |
| `permission_definitions` | `permission_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `permission_keys` | `permission_keys_pkey` | PRIMARY KEY | PRIMARY KEY (key) |
| `permissions` | `permissions_pkey` | PRIMARY KEY | PRIMARY KEY (key) |
| `person_child_relationship_roles` | `person_child_relationship_roles_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `person_child_relationship_roles` | `person_child_relationship_roles_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `person_child_relationship_roles` | `person_child_relationship_roles_relationship_id_fkey` | FOREIGN KEY | FOREIGN KEY (relationship_id) REFERENCES person_child_relationships(id) ON DELETE CASCADE |
| `person_child_relationship_roles` | `uq_person_child_relationship_roles` | UNIQUE | UNIQUE (org_id, relationship_id, role_key) |
| `person_child_relationships` | `person_child_relationships_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE |
| `person_child_relationships` | `person_child_relationships_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE CASCADE |
| `person_child_relationships` | `person_child_relationships_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `person_child_relationships` | `person_child_relationships_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE |
| `person_child_relationships` | `person_child_relationships_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `person_child_relationships` | `person_child_relationships_status_check` | CHECK | CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text])) |
| `person_child_relationships` | `uq_person_child_relationships_member_person` | UNIQUE | UNIQUE (org_id, customer_member_id, person_id) |
| `person_locations` | `person_locations_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `person_locations` | `person_locations_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE |
| `person_locations` | `person_locations_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `person_relationship_type_settings` | `fk_person_relationship_type_settings_industry` | FOREIGN KEY | FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE |
| `person_relationship_type_settings` | `fk_person_relationship_type_settings_vertical` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `person_relationship_type_settings` | `person_relationship_type_settings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `person_relationships` | `ck_person_relationships_not_same` | CHECK | CHECK (from_person_id <> to_person_id) |
| `person_relationships` | `fk_person_relationships_from_person` | FOREIGN KEY | FOREIGN KEY (from_person_id) REFERENCES persons(id) ON DELETE CASCADE |
| `person_relationships` | `fk_person_relationships_to_person` | FOREIGN KEY | FOREIGN KEY (to_person_id) REFERENCES persons(id) ON DELETE CASCADE |
| `person_relationships` | `person_relationships_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `person_relationships` | `uq_person_relationships_unique` | UNIQUE | UNIQUE (org_id, from_person_id, to_person_id, relationship_type) |
| `persons` | `persons_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `persons` | `persons_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pipeline_stages` | `pipeline_stages_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `pipeline_stages` | `pipeline_stages_pipeline_id_fkey` | FOREIGN KEY | FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE |
| `pipeline_stages` | `pipeline_stages_pipeline_id_ghl_stage_uuid_key` | UNIQUE | UNIQUE (pipeline_id, ghl_stage_uuid) |
| `pipeline_stages` | `pipeline_stages_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pipelines` | `pipelines_ghl_pipeline_id_key` | UNIQUE | UNIQUE (ghl_pipeline_id) |
| `pipelines` | `pipelines_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `pipelines` | `pipelines_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `placement_candidates` | `placement_candidates_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `placement_candidates` | `placement_candidates_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE SET NULL |
| `placement_candidates` | `placement_candidates_opportunity_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_customer_member_id) REFERENCES opportunity_customer_members(id) ON DELETE S |
| `placement_candidates` | `placement_candidates_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `placement_candidates` | `placement_candidates_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `placement_candidates` | `placement_candidates_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `placement_candidates` | `placement_candidates_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `placement_candidates` | `placement_candidates_program_room_cohort_key_nonempty` | CHECK | CHECK (char_length(btrim(program_room_cohort_key)) > 0) |
| `placement_candidates` | `placement_candidates_site_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_id) REFERENCES locations(id) ON DELETE SET NULL |
| `placement_candidates` | `placement_candidates_status_check` | CHECK | CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'withdrawn'::text, 'placed'::text])) |
| `placement_candidates` | `placement_candidates_synthetic_identity_check` | CHECK | CHECK (is_synthetic_fallback = true AND opportunity_customer_member_id IS NULL AND customer_member_i |
| `placement_link_group_members` | `placement_link_group_members_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `placement_link_group_members` | `placement_link_group_members_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `placement_link_group_members` | `placement_link_group_members_placement_candidate_id_fkey` | FOREIGN KEY | FOREIGN KEY (placement_candidate_id) REFERENCES placement_candidates(id) ON DELETE CASCADE |
| `placement_link_group_members` | `placement_link_group_members_placement_link_group_id_fkey` | FOREIGN KEY | FOREIGN KEY (placement_link_group_id) REFERENCES placement_link_groups(id) ON DELETE CASCADE |
| `placement_link_group_members` | `uq_placement_link_group_members_group_candidate` | UNIQUE | UNIQUE (placement_link_group_id, placement_candidate_id) |
| `placement_link_groups` | `placement_link_groups_customer_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL |
| `placement_link_groups` | `placement_link_groups_link_mode_check` | CHECK | CHECK (link_mode = ANY (ARRAY['independent'::text, 'preferred_together'::text, 'strictly_together':: |
| `placement_link_groups` | `placement_link_groups_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `placement_link_groups` | `placement_link_groups_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `placement_link_groups` | `placement_link_groups_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `placement_overrides` | `placement_overrides_cohort_key_nonempty` | CHECK | CHECK (char_length(btrim(program_room_cohort_key)) > 0) |
| `placement_overrides` | `placement_overrides_kind_check` | CHECK | CHECK (override_kind = ANY (ARRAY['pin'::text, 'tier_boost'::text, 'temporary'::text])) |
| `placement_overrides` | `placement_overrides_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `placement_overrides` | `placement_overrides_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `placement_overrides` | `placement_overrides_placement_candidate_id_fkey` | FOREIGN KEY | FOREIGN KEY (placement_candidate_id) REFERENCES placement_candidates(id) ON DELETE CASCADE |
| `placement_overrides` | `placement_overrides_reason_nonempty` | CHECK | CHECK (char_length(btrim(reason)) > 0) |
| `placement_overrides` | `placement_overrides_temporary_requires_expires` | CHECK | CHECK (override_kind <> 'temporary'::text OR expires_at IS NOT NULL) |
| `pricing_addons` | `pricing_addons_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_addons` | `pricing_addons_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `pricing_addons` | `pricing_addons_vertical_key_uniq` | UNIQUE | UNIQUE (vertical_id, addon_key) |
| `pricing_dimension_values` | `pricing_dimension_values_dimension_id_fkey` | FOREIGN KEY | FOREIGN KEY (dimension_id) REFERENCES pricing_dimensions(id) ON DELETE CASCADE |
| `pricing_dimension_values` | `pricing_dimension_values_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) |
| `pricing_dimension_values` | `pricing_dimension_values_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_dimensions` | `pricing_dimensions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) |
| `pricing_dimensions` | `pricing_dimensions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_dimensions` | `pricing_dimensions_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `pricing_first_clean_prices` | `pricing_first_clean_prices_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_first_clean_prices` | `pricing_first_clean_prices_service_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_id) REFERENCES pricing_services(id) ON DELETE CASCADE |
| `pricing_first_clean_prices` | `pricing_first_clean_prices_sqft_tier_id_fkey` | FOREIGN KEY | FOREIGN KEY (sqft_tier_id) REFERENCES pricing_square_footage_tiers(id) ON DELETE CASCADE |
| `pricing_first_clean_prices` | `pricing_first_clean_prices_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `pricing_first_clean_prices` | `pricing_first_clean_unique` | UNIQUE | UNIQUE (vertical_id, service_id, sqft_tier_id) |
| `pricing_frequencies` | `pricing_frequencies_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_frequencies` | `pricing_frequencies_service_plan_template_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_plan_template_id) REFERENCES service_plan_templates(id) ON DELETE SET NULL |
| `pricing_frequencies` | `pricing_frequencies_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `pricing_matrix` | `pricing_matrix_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `pricing_matrix` | `pricing_matrix_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_matrix` | `pricing_matrix_pricing_dimension_value_id_fkey` | FOREIGN KEY | FOREIGN KEY (pricing_dimension_value_id) REFERENCES pricing_dimension_values(id) ON DELETE SET NULL |
| `pricing_matrix` | `pricing_matrix_pricing_mode_id_fkey` | FOREIGN KEY | FOREIGN KEY (pricing_mode_id) REFERENCES pricing_modes(id) ON DELETE RESTRICT |
| `pricing_matrix` | `pricing_matrix_service_offering_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_offering_id) REFERENCES service_offerings(id) ON DELETE SET NULL |
| `pricing_matrix` | `pricing_matrix_service_plan_template_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_plan_template_id) REFERENCES service_plan_templates(id) ON DELETE SET NULL |
| `pricing_matrix` | `pricing_matrix_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `pricing_modes` | `pricing_modes_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) |
| `pricing_modes` | `pricing_modes_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_modes` | `pricing_modes_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `pricing_recurring_prices` | `pricing_recurring_prices_frequency_id_fkey` | FOREIGN KEY | FOREIGN KEY (frequency_id) REFERENCES pricing_frequencies(id) ON DELETE CASCADE |
| `pricing_recurring_prices` | `pricing_recurring_prices_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_recurring_prices` | `pricing_recurring_prices_service_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_id) REFERENCES pricing_services(id) ON DELETE CASCADE |
| `pricing_recurring_prices` | `pricing_recurring_prices_sqft_tier_id_fkey` | FOREIGN KEY | FOREIGN KEY (sqft_tier_id) REFERENCES pricing_square_footage_tiers(id) ON DELETE CASCADE |
| `pricing_recurring_prices` | `pricing_recurring_prices_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `pricing_services` | `pricing_services_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_services` | `pricing_services_service_offering_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_offering_id) REFERENCES service_offerings(id) ON DELETE SET NULL |
| `pricing_services` | `pricing_services_unique_vertical_service` | UNIQUE | UNIQUE (vertical_id, service_key) |
| `pricing_services` | `pricing_services_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `pricing_square_footage_tiers` | `pricing_square_footage_tiers_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `pricing_square_footage_tiers` | `pricing_square_footage_tiers_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE |
| `process_instances` | `process_instances_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `process_instances` | `process_instances_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_approvals` | `processing_approvals_case_id_fkey` | FOREIGN KEY | FOREIGN KEY (case_id) REFERENCES processing_cases(id) ON DELETE CASCADE |
| `processing_approvals` | `processing_approvals_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_approvals` | `processing_approvals_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_approvals` | `processing_approvals_plan_id_fkey` | FOREIGN KEY | FOREIGN KEY (plan_id) REFERENCES processing_commit_plans(id) ON DELETE CASCADE |
| `processing_case_sources` | `chk_pcs_role` | CHECK | CHECK (role = ANY (ARRAY['primary'::text, 'related'::text])) |
| `processing_case_sources` | `chk_pcs_source_kind` | CHECK | CHECK (source_kind = ANY (ARRAY['form_submission'::text, 'form_packet_session'::text, 'document'::te |
| `processing_case_sources` | `processing_case_sources_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_case_sources` | `processing_case_sources_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_case_sources` | `processing_case_sources_processing_case_id_fkey` | FOREIGN KEY | FOREIGN KEY (processing_case_id) REFERENCES processing_cases(id) ON DELETE CASCADE |
| `processing_cases` | `chk_processing_cases_status` | CHECK | CHECK (status = ANY (ARRAY['received'::text, 'processing'::text, 'needs_review'::text, 'needs_resolu |
| `processing_cases` | `processing_cases_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_cases` | `processing_cases_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_commit_attempts` | `processing_commit_attempts_case_id_fkey` | FOREIGN KEY | FOREIGN KEY (case_id) REFERENCES processing_cases(id) ON DELETE CASCADE |
| `processing_commit_attempts` | `processing_commit_attempts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_commit_attempts` | `processing_commit_attempts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_commit_attempts` | `processing_commit_attempts_plan_id_fkey` | FOREIGN KEY | FOREIGN KEY (plan_id) REFERENCES processing_commit_plans(id) ON DELETE CASCADE |
| `processing_commit_attempts` | `uq_processing_commit_attempts_plan_attempt` | UNIQUE | UNIQUE (plan_id, attempt_no) |
| `processing_commit_plans` | `processing_commit_plans_case_id_fkey` | FOREIGN KEY | FOREIGN KEY (case_id) REFERENCES processing_cases(id) ON DELETE CASCADE |
| `processing_commit_plans` | `processing_commit_plans_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_commit_plans` | `processing_commit_plans_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_commit_plans` | `processing_commit_plans_superseded_by_fkey` | FOREIGN KEY | FOREIGN KEY (superseded_by) REFERENCES processing_commit_plans(id) ON DELETE SET NULL |
| `processing_commit_plans` | `uq_processing_commit_plans_case_version` | UNIQUE | UNIQUE (case_id, version) |
| `processing_exceptions` | `processing_exceptions_case_id_fkey` | FOREIGN KEY | FOREIGN KEY (case_id) REFERENCES processing_cases(id) ON DELETE CASCADE |
| `processing_exceptions` | `processing_exceptions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_exceptions` | `processing_exceptions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_facts` | `processing_facts_case_id_fkey` | FOREIGN KEY | FOREIGN KEY (case_id) REFERENCES processing_cases(id) ON DELETE CASCADE |
| `processing_facts` | `processing_facts_corrected_from_fkey` | FOREIGN KEY | FOREIGN KEY (corrected_from) REFERENCES processing_facts(id) ON DELETE SET NULL |
| `processing_facts` | `processing_facts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_facts` | `processing_facts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_facts` | `processing_facts_source_id_fkey` | FOREIGN KEY | FOREIGN KEY (source_id) REFERENCES processing_case_sources(id) ON DELETE SET NULL |
| `processing_plan_operations` | `processing_plan_operations_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_plan_operations` | `processing_plan_operations_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_plan_operations` | `processing_plan_operations_plan_id_fkey` | FOREIGN KEY | FOREIGN KEY (plan_id) REFERENCES processing_commit_plans(id) ON DELETE CASCADE |
| `processing_plan_operations` | `uq_processing_plan_operations_plan_op` | UNIQUE | UNIQUE (plan_id, op_id) |
| `processing_resolutions` | `processing_resolutions_case_id_fkey` | FOREIGN KEY | FOREIGN KEY (case_id) REFERENCES processing_cases(id) ON DELETE CASCADE |
| `processing_resolutions` | `processing_resolutions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `processing_resolutions` | `processing_resolutions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `processing_resolutions` | `processing_resolutions_superseded_by_fkey` | FOREIGN KEY | FOREIGN KEY (superseded_by) REFERENCES processing_resolutions(id) ON DELETE SET NULL |
| `processing_resolutions` | `uq_processing_resolutions_case_subject_generation` | UNIQUE | UNIQUE (case_id, subject_ref, generation_id) |
| `program_drafts` | `program_drafts_base_revision_id_fkey` | FOREIGN KEY | FOREIGN KEY (base_revision_id) REFERENCES program_revisions(id) ON DELETE SET NULL |
| `program_drafts` | `program_drafts_created_by_fkey` | FOREIGN KEY | FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `program_drafts` | `program_drafts_draft_status_check` | CHECK | CHECK (draft_status = ANY (ARRAY['draft'::text, 'validated'::text])) |
| `program_drafts` | `program_drafts_label_nonempty` | CHECK | CHECK (char_length(btrim(label)) > 0) |
| `program_drafts` | `program_drafts_one_per_program` | UNIQUE | UNIQUE (org_id, program_id) |
| `program_drafts` | `program_drafts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `program_drafts` | `program_drafts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `program_drafts` | `program_drafts_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE |
| `program_drafts` | `program_drafts_updated_by_fkey` | FOREIGN KEY | FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `program_drafts` | `program_drafts_validated_by_fkey` | FOREIGN KEY | FOREIGN KEY (validated_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `program_drafts` | `program_drafts_validation_shape` | CHECK | CHECK (draft_status = 'draft'::text OR draft_status = 'validated'::text AND validated_at IS NOT NULL |
| `program_offering_variants` | `program_offering_variants_offering_id_fkey` | FOREIGN KEY | FOREIGN KEY (offering_id) REFERENCES program_offerings(id) ON DELETE CASCADE |
| `program_offering_variants` | `program_offering_variants_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `program_offering_variants` | `program_offering_variants_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `program_offering_variants` | `program_offering_variants_unique` | UNIQUE | UNIQUE NULLS NOT DISTINCT (org_id, offering_id, quantity_type, quantity_value) |
| `program_offerings` | `program_offerings_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `program_offerings` | `program_offerings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `program_offerings` | `program_offerings_unique` | UNIQUE | UNIQUE (org_id, program_key, attendance_type) |
| `program_revisions` | `program_revisions_checksum_nonempty` | CHECK | CHECK (char_length(btrim(payload_checksum)) > 0) |
| `program_revisions` | `program_revisions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `program_revisions` | `program_revisions_org_program_number_unique` | UNIQUE | UNIQUE (org_id, program_id, revision_number) |
| `program_revisions` | `program_revisions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `program_revisions` | `program_revisions_program_id_fkey` | FOREIGN KEY | FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT |
| `program_revisions` | `program_revisions_published_by_fkey` | FOREIGN KEY | FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `program_revisions` | `program_revisions_revision_number_check` | CHECK | CHECK (revision_number > 0) |
| `program_revisions` | `program_revisions_source_draft_id_fkey` | FOREIGN KEY | FOREIGN KEY (source_draft_id) REFERENCES program_drafts(id) ON DELETE RESTRICT |
| `programs` | `programs_created_by_fkey` | FOREIGN KEY | FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `programs` | `programs_key_nonempty` | CHECK | CHECK (char_length(btrim(program_key)) >= 2 AND char_length(btrim(program_key)) <= 64) |
| `programs` | `programs_lifecycle_status_check` | CHECK | CHECK (lifecycle_status = ANY (ARRAY['active'::text, 'retired'::text])) |
| `programs` | `programs_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `programs` | `programs_org_key_unique` | UNIQUE | UNIQUE (org_id, program_key) |
| `programs` | `programs_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `programs` | `programs_retired_by_fkey` | FOREIGN KEY | FOREIGN KEY (retired_by) REFERENCES auth.users(id) ON DELETE SET NULL |
| `programs` | `programs_retirement_shape` | CHECK | CHECK (lifecycle_status = 'active'::text AND retired_at IS NULL OR lifecycle_status = 'retired'::tex |
| `quotes` | `chk_quotes_amounts_nonnegative` | CHECK | CHECK ((subtotal_cents IS NULL OR subtotal_cents >= 0) AND discount_cents >= 0 AND tax_cents >= 0 AN |
| `quotes` | `quotes_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL |
| `quotes` | `quotes_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `quotes` | `quotes_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `quotes` | `quotes_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `record_actions` | `record_actions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `record_actions` | `record_actions_placement_check` | CHECK | CHECK (placement = ANY (ARRAY['primary'::text, 'secondary'::text])) |
| `record_drawer_layouts` | `record_drawer_layouts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `record_drawer_layouts` | `record_drawer_layouts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `record_drawer_layouts` | `ux_record_drawer_layouts_org_entity_surface_key` | UNIQUE | UNIQUE (org_id, entity_type, surface, key) |
| `record_layouts` | `record_layouts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `record_overview_layouts` | `record_overview_layouts_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `record_overview_layouts` | `record_overview_layouts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `recurrence_plans` | `recurrence_plans_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `recurrence_plans` | `recurrence_plans_job_id_key` | UNIQUE | UNIQUE (job_id) |
| `recurrence_plans` | `recurrence_plans_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `resolved_obligations` | `resolved_obligations_amount_nonneg` | CHECK | CHECK (amount_cents IS NULL OR amount_cents >= 0) |
| `resolved_obligations` | `resolved_obligations_charge_template_id_fkey` | FOREIGN KEY | FOREIGN KEY (charge_template_id) REFERENCES financial_charge_templates(id) ON DELETE SET NULL |
| `resolved_obligations` | `resolved_obligations_consumption_event_id_fkey` | FOREIGN KEY | FOREIGN KEY (consumption_event_id) REFERENCES consumption_events(id) ON DELETE CASCADE |
| `resolved_obligations` | `resolved_obligations_draft_charge_id_fkey` | FOREIGN KEY | FOREIGN KEY (draft_charge_id) REFERENCES charges(id) ON DELETE SET NULL |
| `resolved_obligations` | `resolved_obligations_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `resolved_obligations` | `resolved_obligations_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `resolved_obligations` | `resolved_obligations_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `resolved_obligations` | `resolved_obligations_review_status_check` | CHECK | CHECK (review_status = ANY (ARRAY['pending'::text, 'review_required'::text, 'reviewed'::text, 'suppr |
| `resolved_obligations` | `resolved_obligations_service_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_id) REFERENCES financial_services(id) ON DELETE SET NULL |
| `resolved_obligations` | `resolved_obligations_status_check` | CHECK | CHECK (status = ANY (ARRAY['previewed'::text, 'drafted'::text, 'no_charge'::text, 'superseded'::text |
| `resolved_obligations` | `resolved_obligations_superseded_by_event_id_fkey` | FOREIGN KEY | FOREIGN KEY (superseded_by_event_id) REFERENCES consumption_events(id) ON DELETE SET NULL |
| `role_definitions` | `role_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `role_definitions` | `role_definitions_org_role_key_uk` | UNIQUE | UNIQUE (org_id, role_key) |
| `role_definitions` | `role_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `role_permission_grants` | `role_permission_grants_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `role_permission_grants` | `role_permission_grants_org_role_perm_uk` | UNIQUE | UNIQUE (org_id, role_key, permission_key) |
| `role_permission_grants` | `role_permission_grants_permission_key_fkey` | FOREIGN KEY | FOREIGN KEY (permission_key) REFERENCES permission_keys(key) ON DELETE RESTRICT |
| `role_permission_grants` | `role_permission_grants_permissions_fkey` | FOREIGN KEY | FOREIGN KEY (permission_key) REFERENCES permissions(key) ON DELETE CASCADE |
| `role_permission_grants` | `role_permission_grants_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `role_permission_grants` | `role_permission_grants_role_definitions_fkey` | FOREIGN KEY | FOREIGN KEY (org_id, role_key) REFERENCES role_definitions(org_id, role_key) ON DELETE CASCADE |
| `role_permission_grants` | `role_permission_grants_role_fk` | FOREIGN KEY | FOREIGN KEY (org_id, role_key) REFERENCES role_definitions(org_id, role_key) ON DELETE CASCADE |
| `role_permission_grants` | `role_permission_grants_unique` | UNIQUE | UNIQUE (org_id, role_key, permission_key) |
| `schedule_assignments` | `schedule_assignments_assignment_kind_check` | CHECK | CHECK (assignment_kind = ANY (ARRAY['base'::text])) |
| `schedule_assignments` | `schedule_assignments_customer_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_member_id) REFERENCES customer_members(id) ON DELETE RESTRICT |
| `schedule_assignments` | `schedule_assignments_end_after_start` | CHECK | CHECK (end_date IS NULL OR end_date >= start_date) |
| `schedule_assignments` | `schedule_assignments_enrollment_agreement_id_fkey` | FOREIGN KEY | FOREIGN KEY (enrollment_agreement_id) REFERENCES child_enrollment_agreements(id) ON DELETE CASCADE |
| `schedule_assignments` | `schedule_assignments_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `schedule_assignments` | `schedule_assignments_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `schedule_assignments` | `schedule_assignments_schedule_pattern_id_fkey` | FOREIGN KEY | FOREIGN KEY (schedule_pattern_id) REFERENCES schedule_patterns(id) ON DELETE RESTRICT |
| `schedule_assignments` | `schedule_assignments_source_key_nonempty` | CHECK | CHECK (char_length(btrim(source_key)) > 0) |
| `schedule_assignments` | `schedule_assignments_status_check` | CHECK | CHECK (status = ANY (ARRAY['planned'::text, 'active'::text, 'ending'::text, 'ended'::text, 'supersed |
| `schedule_assignments` | `schedule_assignments_supersedes_assignment_id_fkey` | FOREIGN KEY | FOREIGN KEY (supersedes_assignment_id) REFERENCES schedule_assignments(id) ON DELETE SET NULL |
| `schedule_patterns` | `schedule_patterns_key_nonempty` | CHECK | CHECK (char_length(btrim(key)) > 0) |
| `schedule_patterns` | `schedule_patterns_label_nonempty` | CHECK | CHECK (char_length(btrim(label)) > 0) |
| `schedule_patterns` | `schedule_patterns_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `schedule_patterns` | `schedule_patterns_org_site_key_unique` | UNIQUE | UNIQUE (org_id, site_location_id, key) |
| `schedule_patterns` | `schedule_patterns_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `schedule_patterns` | `schedule_patterns_schedule_type_key_nonempty` | CHECK | CHECK (char_length(btrim(schedule_type_key)) > 0) |
| `schedule_patterns` | `schedule_patterns_site_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (site_location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `schedule_patterns` | `schedule_patterns_weekdays_nonempty` | CHECK | CHECK (cardinality(weekdays) > 0) |
| `schedule_statuses` | `schedule_statuses_key_key` | UNIQUE | UNIQUE (key) |
| `schedule_statuses` | `schedule_statuses_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `schedule_tags` | `schedule_tags_pkey` | PRIMARY KEY | PRIMARY KEY (schedule_id, tag_id) |
| `schedule_tags` | `schedule_tags_schedule_id_fkey` | FOREIGN KEY | FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE |
| `schedule_tags` | `schedule_tags_tag_id_fkey` | FOREIGN KEY | FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE |
| `schedules` | `schedules_customer_subscription_id_fkey` | FOREIGN KEY | FOREIGN KEY (customer_subscription_id) REFERENCES customer_subscriptions(id) |
| `schedules` | `schedules_job_id_fkey` | FOREIGN KEY | FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE |
| `schedules` | `schedules_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `schedules` | `schedules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `schedules` | `schedules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `schedules` | `schedules_rescheduled_from_schedule_id_fkey` | FOREIGN KEY | FOREIGN KEY (rescheduled_from_schedule_id) REFERENCES schedules(id) |
| `schedules` | `schedules_schedule_status_id_fkey` | FOREIGN KEY | FOREIGN KEY (schedule_status_id) REFERENCES schedule_statuses(id) ON DELETE SET NULL |
| `service_offerings` | `service_offerings_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `service_offerings` | `service_offerings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `service_offerings` | `service_offerings_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE SET NULL |
| `service_plan_templates` | `service_plan_templates_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `service_plan_templates` | `service_plan_templates_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `service_plan_templates` | `service_plan_templates_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE SET NULL |
| `service_price_dimensions` | `service_price_dimensions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `service_price_dimensions` | `service_price_dimensions_pricing_rule_id_fkey` | FOREIGN KEY | FOREIGN KEY (pricing_rule_id) REFERENCES service_pricing_rules(id) ON DELETE CASCADE |
| `service_pricing_rules` | `service_pricing_rules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `service_pricing_rules` | `service_pricing_rules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `service_pricing_rules` | `service_pricing_rules_service_offering_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_offering_id) REFERENCES service_offerings(id) ON DELETE CASCADE |
| `service_pricing_rules` | `service_pricing_rules_service_plan_template_id_fkey` | FOREIGN KEY | FOREIGN KEY (service_plan_template_id) REFERENCES service_plan_templates(id) ON DELETE SET NULL |
| `service_pricing_rules` | `service_pricing_rules_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE SET NULL |
| `sla_events` | `sla_events_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `sla_events` | `sla_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `sla_events` | `sla_events_thread_id_fkey` | FOREIGN KEY | FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE CASCADE |
| `sqft_bands` | `sqft_bands_key_key` | UNIQUE | UNIQUE (key) |
| `sqft_bands` | `sqft_bands_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `status_definitions` | `status_definitions_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `status_definitions` | `status_definitions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `status_transition_rules` | `status_transition_rules_department_id_fkey` | FOREIGN KEY | FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE |
| `status_transition_rules` | `status_transition_rules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `status_transition_rules` | `status_transition_rules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `status_transition_rules` | `status_transition_rules_work_unit_id_fkey` | FOREIGN KEY | FOREIGN KEY (work_unit_id) REFERENCES work_units(id) ON DELETE CASCADE |
| `tags` | `tags_name_key` | UNIQUE | UNIQUE (name) |
| `tags` | `tags_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `task_assist_proposals` | `task_assist_proposals_agent_key_check` | CHECK | CHECK (agent_key = 'task_assist'::text) |
| `task_assist_proposals` | `task_assist_proposals_entity_id_fkey` | FOREIGN KEY | FOREIGN KEY (entity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `task_assist_proposals` | `task_assist_proposals_entity_type_check` | CHECK | CHECK (entity_type = 'opportunities'::text) |
| `task_assist_proposals` | `task_assist_proposals_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `task_assist_proposals` | `task_assist_proposals_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `task_assist_proposals` | `task_assist_proposals_proposal_type_check` | CHECK | CHECK (proposal_type = ANY (ARRAY['draft_sms'::text, 'draft_email'::text, 'schedule_send'::text, 're |
| `task_assist_proposals` | `task_assist_proposals_status_check` | CHECK | CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'appl |
| `tour_availability_rules` | `chk_tour_availability_rules_buffer` | CHECK | CHECK (buffer_minutes >= 0) |
| `tour_availability_rules` | `chk_tour_availability_rules_day_of_week` | CHECK | CHECK (day_of_week >= 0 AND day_of_week <= 6) |
| `tour_availability_rules` | `chk_tour_availability_rules_max_bookings` | CHECK | CHECK (max_bookings_per_slot > 0) |
| `tour_availability_rules` | `chk_tour_availability_rules_metadata_object` | CHECK | CHECK (jsonb_typeof(metadata) = 'object'::text) |
| `tour_availability_rules` | `chk_tour_availability_rules_slot_duration` | CHECK | CHECK (slot_duration_minutes > 0) |
| `tour_availability_rules` | `chk_tour_availability_rules_time_window` | CHECK | CHECK (end_time > start_time) |
| `tour_availability_rules` | `tour_availability_rules_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL |
| `tour_availability_rules` | `tour_availability_rules_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `tour_availability_rules` | `tour_availability_rules_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `tour_bookings` | `chk_tour_bookings_metadata_object` | CHECK | CHECK (jsonb_typeof(metadata) = 'object'::text) |
| `tour_bookings` | `chk_tour_bookings_source` | CHECK | CHECK (source = ANY (ARRAY['admin'::text, 'public_link'::text, 'form_submission'::text, 'automation' |
| `tour_bookings` | `chk_tour_bookings_status_key` | CHECK | CHECK (status_key = ANY (ARRAY['requested'::text, 'pending_approval'::text, 'confirmed'::text, 'resc |
| `tour_bookings` | `chk_tour_bookings_time_window` | CHECK | CHECK (end_at > start_at) |
| `tour_bookings` | `tour_bookings_form_public_link_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_public_link_id) REFERENCES form_public_links(id) ON DELETE SET NULL |
| `tour_bookings` | `tour_bookings_form_submission_id_fkey` | FOREIGN KEY | FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id) ON DELETE SET NULL |
| `tour_bookings` | `tour_bookings_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT |
| `tour_bookings` | `tour_bookings_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `tour_bookings` | `tour_bookings_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `tour_bookings` | `tour_bookings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `tour_bookings` | `tour_bookings_primary_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `tour_bookings` | `tour_bookings_primary_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (primary_person_id) REFERENCES persons(id) ON DELETE SET NULL |
| `tour_bookings` | `tour_bookings_rescheduled_from_booking_id_fkey` | FOREIGN KEY | FOREIGN KEY (rescheduled_from_booking_id) REFERENCES tour_bookings(id) ON DELETE SET NULL |
| `tour_public_booking_links` | `chk_tour_public_booking_links_metadata_object` | CHECK | CHECK (jsonb_typeof(metadata) = 'object'::text) |
| `tour_public_booking_links` | `tour_public_booking_links_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `tour_public_booking_links` | `tour_public_booking_links_opportunity_id_fkey` | FOREIGN KEY | FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE |
| `tour_public_booking_links` | `tour_public_booking_links_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `tour_public_booking_links` | `tour_public_booking_links_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `tour_public_booking_links` | `ux_tour_public_booking_links_token_hash` | UNIQUE | UNIQUE (token_hash) |
| `user_access_profiles` | `uq_user_access_profiles_user_org` | UNIQUE | UNIQUE (user_id, org_id) |
| `user_access_profiles` | `user_access_profiles_department_scope_check` | CHECK | CHECK (department_scope = ANY (ARRAY['all'::text, 'restricted'::text])) |
| `user_access_profiles` | `user_access_profiles_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `user_access_profiles` | `user_access_profiles_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `user_access_profiles` | `user_access_profiles_site_scope_check` | CHECK | CHECK (site_scope = ANY (ARRAY['all'::text, 'restricted'::text])) |
| `user_access_profiles` | `user_access_profiles_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| `user_department_access` | `uq_user_department_access_user_org_dept` | UNIQUE | UNIQUE (user_id, org_id, department_id) |
| `user_department_access` | `user_department_access_department_id_fkey` | FOREIGN KEY | FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE |
| `user_department_access` | `user_department_access_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `user_department_access` | `user_department_access_profile_fk` | FOREIGN KEY | FOREIGN KEY (user_id, org_id) REFERENCES user_access_profiles(user_id, org_id) ON DELETE CASCADE |
| `user_profiles` | `user_profiles_id_fkey` | FOREIGN KEY | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE |
| `user_profiles` | `user_profiles_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `user_roles` | `user_roles_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `user_roles` | `user_roles_pkey` | PRIMARY KEY | PRIMARY KEY (user_id, org_id, role) |
| `user_roles` | `user_roles_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| `user_site_access` | `uq_user_site_access_user_org_location` | UNIQUE | UNIQUE (user_id, org_id, location_id) |
| `user_site_access` | `user_site_access_location_id_fkey` | FOREIGN KEY | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| `user_site_access` | `user_site_access_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `user_site_access` | `user_site_access_profile_fk` | FOREIGN KEY | FOREIGN KEY (user_id, org_id) REFERENCES user_access_profiles(user_id, org_id) ON DELETE CASCADE |
| `vendor_statuses` | `vendor_statuses_key_key` | UNIQUE | UNIQUE (key) |
| `vendor_statuses` | `vendor_statuses_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `vendor_tags` | `vendor_tags_pkey` | PRIMARY KEY | PRIMARY KEY (vendor_id, tag_id) |
| `vendor_tags` | `vendor_tags_tag_id_fkey` | FOREIGN KEY | FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE |
| `vendor_tags` | `vendor_tags_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE |
| `vendor_users` | `vendor_users_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE |
| `vendor_users` | `vendor_users_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `vendor_users` | `vendor_users_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `vendor_users` | `vendor_users_vendor_id_contact_id_key` | UNIQUE | UNIQUE (vendor_id, contact_id) |
| `vendor_users` | `vendor_users_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE |
| `vendor_verticals` | `vendor_verticals_pkey` | PRIMARY KEY | PRIMARY KEY (vendor_id, vertical_id) |
| `vendor_verticals` | `vendor_verticals_vendor_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE |
| `vendor_verticals` | `vendor_verticals_vertical_id_fkey` | FOREIGN KEY | FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE RESTRICT |
| `vendors` | `chk_vendors_operating_hours` | CHECK | CHECK (operating_hours_open IS NULL OR operating_hours_close IS NULL OR operating_hours_open < opera |
| `vendors` | `chk_vendors_payout_percent` | CHECK | CHECK (payout_percent >= 0::numeric AND payout_percent <= 1::numeric) |
| `vendors` | `vendors_drivers_license_doc_file_id_fkey` | FOREIGN KEY | FOREIGN KEY (drivers_license_doc_file_id) REFERENCES documents(id) ON DELETE SET NULL |
| `vendors` | `vendors_insurance_doc_file_id_fkey` | FOREIGN KEY | FOREIGN KEY (insurance_doc_file_id) REFERENCES documents(id) ON DELETE SET NULL |
| `vendors` | `vendors_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `vendors` | `vendors_payout_override_type_check` | CHECK | CHECK (payout_override_type = ANY (ARRAY['percentage'::text, 'flat'::text])) |
| `vendors` | `vendors_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `vendors` | `vendors_primary_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `vendors` | `vendors_primary_person_id_fkey` | FOREIGN KEY | FOREIGN KEY (primary_person_id) REFERENCES persons(id) |
| `vendors` | `vendors_vendor_status_id_fkey` | FOREIGN KEY | FOREIGN KEY (vendor_status_id) REFERENCES vendor_statuses(id) |
| `verticals` | `verticals_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `verticals` | `verticals_slug_key` | UNIQUE | UNIQUE (slug) |
| `work_units` | `uq_work_units_department_key` | UNIQUE | UNIQUE (department_id, key) |
| `work_units` | `work_units_department_id_fkey` | FOREIGN KEY | FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE |
| `work_units` | `work_units_key_nonempty` | CHECK | CHECK (btrim(key) <> ''::text) |
| `work_units` | `work_units_name_nonempty` | CHECK | CHECK (btrim(name) <> ''::text) |
| `work_units` | `work_units_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE RESTRICT |
| `work_units` | `work_units_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `workflow_action_runs` | `workflow_action_runs_action_id_fkey` | FOREIGN KEY | FOREIGN KEY (action_id) REFERENCES workflow_actions(id) ON DELETE SET NULL |
| `workflow_action_runs` | `workflow_action_runs_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `workflow_action_runs` | `workflow_action_runs_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `workflow_action_runs` | `workflow_action_runs_workflow_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE |
| `workflow_action_runs` | `workflow_action_runs_workflow_run_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE |
| `workflow_actions` | `workflow_actions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `workflow_actions` | `workflow_actions_target_entity_required_for_update` | CHECK | CHECK (action_type = 'update_entity'::text AND target_entity IS NOT NULL AND length(TRIM(BOTH FROM t |
| `workflow_actions` | `workflow_actions_workflow_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE |
| `workflow_conditions` | `workflow_conditions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `workflow_conditions` | `workflow_conditions_workflow_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE |
| `workflow_events` | `workflow_events_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `workflow_events` | `workflow_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `workflow_runs` | `workflow_runs_event_id_fkey` | FOREIGN KEY | FOREIGN KEY (event_id) REFERENCES workflow_events(id) ON DELETE SET NULL |
| `workflow_runs` | `workflow_runs_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `workflow_runs` | `workflow_runs_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `workflow_runs` | `workflow_runs_workflow_id_fkey` | FOREIGN KEY | FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE |
| `workflows` | `workflows_created_by_fkey` | FOREIGN KEY | FOREIGN KEY (created_by) REFERENCES auth.users(id) |
| `workflows` | `workflows_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `workflows` | `workflows_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `workspace_kpi_placement` | `workspace_kpi_placement_department_id_fkey` | FOREIGN KEY | FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE |
| `workspace_kpi_placement` | `workspace_kpi_placement_format_check` | CHECK | CHECK (format_override IS NULL OR (format_override = ANY (ARRAY['count'::text, 'currency'::text, 'pe |
| `workspace_kpi_placement` | `workspace_kpi_placement_lane_check` | CHECK | CHECK (lane_override IS NULL OR (lane_override = ANY (ARRAY['business'::text, 'ai'::text]))) |
| `workspace_kpi_placement` | `workspace_kpi_placement_org_id_fkey` | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE |
| `workspace_kpi_placement` | `workspace_kpi_placement_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `workspace_kpi_placement` | `workspace_kpi_placement_scope_check` | CHECK | CHECK (surface = 'workspace'::text AND department_id IS NULL AND work_unit_id IS NULL OR surface = ' |
| `workspace_kpi_placement` | `workspace_kpi_placement_surface_check` | CHECK | CHECK (surface = ANY (ARRAY['workspace'::text, 'department'::text, 'work_unit'::text])) |
| `workspace_kpi_placement` | `workspace_kpi_placement_work_unit_id_fkey` | FOREIGN KEY | FOREIGN KEY (work_unit_id) REFERENCES work_units(id) ON DELETE CASCADE |
