# Schema — triggers

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** 2026-06-28 · **Trigger count:** 193

| Table | Trigger | Event | Function |
|-------|---------|-------|----------|
| `action_definitions` | `set_action_definitions_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_action_definitions_updated_at BEFORE UPDATE ON action_definit |
| `action_placements` | `set_action_placements_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_action_placements_updated_at BEFORE UPDATE ON action_placemen |
| `app_users` | `trg_app_users_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_app_users_updated_at BEFORE UPDATE ON app_users FOR EACH ROW  |
| `assignments` | `trg_assignments_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH  |
| `campaigns` | `trg_campaigns_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW  |
| `charges` | `trg_charges_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_charges_updated_at BEFORE UPDATE ON charges FOR EACH ROW EXEC |
| `child_attendance_events` | `trg_prevent_child_attendance_events_mutation` | DELETE BEFORE | CREATE TRIGGER trg_prevent_child_attendance_events_mutation BEFORE DELETE OR UPD |
| `child_attendance_events` | `trg_prevent_child_attendance_events_mutation` | UPDATE BEFORE | CREATE TRIGGER trg_prevent_child_attendance_events_mutation BEFORE DELETE OR UPD |
| `child_attendance_events` | `trg_validate_child_attendance_events_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_child_attendance_events_consistency BEFORE INSERT ON |
| `child_enrollment_agreements` | `trg_child_enrollment_agreements_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_child_enrollment_agreements_updated_at BEFORE UPDATE ON child |
| `child_enrollment_agreements` | `trg_validate_child_enrollment_agreements_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_child_enrollment_agreements_consistency BEFORE INSER |
| `child_enrollment_agreements` | `trg_validate_child_enrollment_agreements_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_child_enrollment_agreements_consistency BEFORE INSER |
| `child_placements` | `trg_child_placements_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_child_placements_updated_at BEFORE UPDATE ON child_placements |
| `child_placements` | `trg_validate_child_placements_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_child_placements_consistency BEFORE INSERT OR UPDATE |
| `child_placements` | `trg_validate_child_placements_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_child_placements_consistency BEFORE INSERT OR UPDATE |
| `childcare_capacity_rules` | `trg_childcare_capacity_rules_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_childcare_capacity_rules_updated_at BEFORE UPDATE ON childcar |
| `childcare_capacity_rules` | `trg_validate_childcare_capacity_rules_scope` | INSERT BEFORE | CREATE TRIGGER trg_validate_childcare_capacity_rules_scope BEFORE INSERT OR UPDA |
| `childcare_capacity_rules` | `trg_validate_childcare_capacity_rules_scope` | UPDATE BEFORE | CREATE TRIGGER trg_validate_childcare_capacity_rules_scope BEFORE INSERT OR UPDA |
| `childcare_operating_windows` | `trg_childcare_operating_windows_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_childcare_operating_windows_updated_at BEFORE UPDATE ON child |
| `childcare_operating_windows` | `trg_validate_childcare_operating_windows_scope` | INSERT BEFORE | CREATE TRIGGER trg_validate_childcare_operating_windows_scope BEFORE INSERT OR U |
| `childcare_operating_windows` | `trg_validate_childcare_operating_windows_scope` | UPDATE BEFORE | CREATE TRIGGER trg_validate_childcare_operating_windows_scope BEFORE INSERT OR U |
| `childcare_ratio_rule_tiers` | `trg_childcare_ratio_rule_tiers_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_childcare_ratio_rule_tiers_updated_at BEFORE UPDATE ON childc |
| `childcare_ratio_rules` | `trg_childcare_ratio_rules_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_childcare_ratio_rules_updated_at BEFORE UPDATE ON childcare_r |
| `childcare_ratio_rules` | `trg_validate_childcare_ratio_rules_scope` | INSERT BEFORE | CREATE TRIGGER trg_validate_childcare_ratio_rules_scope BEFORE INSERT OR UPDATE  |
| `childcare_ratio_rules` | `trg_validate_childcare_ratio_rules_scope` | UPDATE BEFORE | CREATE TRIGGER trg_validate_childcare_ratio_rules_scope BEFORE INSERT OR UPDATE  |
| `childcare_schedule_rules` | `trg_childcare_schedule_rules_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_childcare_schedule_rules_updated_at BEFORE UPDATE ON childcar |
| `childcare_schedule_rules` | `trg_validate_childcare_schedule_rules_scope` | INSERT BEFORE | CREATE TRIGGER trg_validate_childcare_schedule_rules_scope BEFORE INSERT OR UPDA |
| `childcare_schedule_rules` | `trg_validate_childcare_schedule_rules_scope` | UPDATE BEFORE | CREATE TRIGGER trg_validate_childcare_schedule_rules_scope BEFORE INSERT OR UPDA |
| `communication_messages` | `trg_comm_messages_bump_thread_last_message` | INSERT AFTER | CREATE TRIGGER trg_comm_messages_bump_thread_last_message AFTER INSERT ON commun |
| `communication_scheduled_sends` | `trg_comm_sched_sends_org_scope` | INSERT BEFORE | CREATE TRIGGER trg_comm_sched_sends_org_scope BEFORE INSERT OR UPDATE OF org_id, |
| `communication_scheduled_sends` | `trg_comm_sched_sends_org_scope` | UPDATE BEFORE | CREATE TRIGGER trg_comm_sched_sends_org_scope BEFORE INSERT OR UPDATE OF org_id, |
| `communication_scheduled_sends` | `trg_comm_sched_sends_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_comm_sched_sends_updated_at BEFORE UPDATE ON communication_sc |
| `communication_template_versions` | `trg_sync_communication_template_version_legacy` | INSERT BEFORE | CREATE TRIGGER trg_sync_communication_template_version_legacy BEFORE INSERT OR U |
| `communication_template_versions` | `trg_sync_communication_template_version_legacy` | UPDATE BEFORE | CREATE TRIGGER trg_sync_communication_template_version_legacy BEFORE INSERT OR U |
| `config_layout_assist_proposals` | `trg_config_layout_assist_proposals_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_config_layout_assist_proposals_updated_at BEFORE UPDATE ON co |
| `contacts` | `trg_contacts_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EX |
| `customer_members` | `trg_customer_members_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_customer_members_updated_at BEFORE UPDATE ON customer_members |
| `customer_person_role_types` | `trg_customer_person_role_types_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_customer_person_role_types_updated_at BEFORE UPDATE ON custom |
| `customers` | `trg_assign_org_record_number_customers` | INSERT BEFORE | CREATE TRIGGER trg_assign_org_record_number_customers BEFORE INSERT ON customers |
| `customers` | `trg_customers_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW  |
| `discount_applications` | `set_discount_applications_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_discount_applications_updated_at BEFORE UPDATE ON discount_ap |
| `discount_commitments` | `set_discount_commitments_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_discount_commitments_updated_at BEFORE UPDATE ON discount_com |
| `discount_program_benefits` | `set_discount_program_benefits_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_discount_program_benefits_updated_at BEFORE UPDATE ON discoun |
| `discount_program_commitment_rules` | `set_discount_program_commitment_rules_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_discount_program_commitment_rules_updated_at BEFORE UPDATE ON |
| `discount_program_qualifiers` | `set_discount_program_qualifiers_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_discount_program_qualifiers_updated_at BEFORE UPDATE ON disco |
| `discount_programs` | `set_discount_programs_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_discount_programs_updated_at BEFORE UPDATE ON discount_progra |
| `discounts` | `trg_discounts_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_discounts_updated_at BEFORE UPDATE ON discounts FOR EACH ROW  |
| `documents` | `trg_documents_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW  |
| `entity_labels` | `trg_entity_labels_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_entity_labels_updated_at BEFORE UPDATE ON entity_labels FOR E |
| `form_definition_versions` | `trg_form_definition_versions_immutability` | UPDATE BEFORE | CREATE TRIGGER trg_form_definition_versions_immutability BEFORE UPDATE ON form_d |
| `form_definition_versions` | `trg_form_definition_versions_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_form_definition_versions_updated_at BEFORE UPDATE ON form_def |
| `form_definition_versions` | `trg_sync_form_definition_versions_org_id` | INSERT BEFORE | CREATE TRIGGER trg_sync_form_definition_versions_org_id BEFORE INSERT OR UPDATE  |
| `form_definition_versions` | `trg_sync_form_definition_versions_org_id` | UPDATE BEFORE | CREATE TRIGGER trg_sync_form_definition_versions_org_id BEFORE INSERT OR UPDATE  |
| `form_definitions` | `trg_form_definitions_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_form_definitions_updated_at BEFORE UPDATE ON form_definitions |
| `form_packet_definitions` | `trg_form_packet_definitions_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_form_packet_definitions_updated_at BEFORE UPDATE ON form_pack |
| `form_packet_items` | `trg_form_packet_items_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_form_packet_items_updated_at BEFORE UPDATE ON form_packet_ite |
| `form_packet_items` | `trg_sync_form_packet_items_org` | INSERT BEFORE | CREATE TRIGGER trg_sync_form_packet_items_org BEFORE INSERT OR UPDATE OF packet_ |
| `form_packet_items` | `trg_sync_form_packet_items_org` | UPDATE BEFORE | CREATE TRIGGER trg_sync_form_packet_items_org BEFORE INSERT OR UPDATE OF packet_ |
| `form_packet_items` | `trg_validate_form_packet_items_form` | INSERT BEFORE | CREATE TRIGGER trg_validate_form_packet_items_form BEFORE INSERT OR UPDATE ON fo |
| `form_packet_items` | `trg_validate_form_packet_items_form` | UPDATE BEFORE | CREATE TRIGGER trg_validate_form_packet_items_form BEFORE INSERT OR UPDATE ON fo |
| `form_packet_session_items` | `trg_form_packet_session_items_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_form_packet_session_items_updated_at BEFORE UPDATE ON form_pa |
| `form_packet_session_items` | `trg_sync_form_packet_session_items_org` | INSERT BEFORE | CREATE TRIGGER trg_sync_form_packet_session_items_org BEFORE INSERT OR UPDATE OF |
| `form_packet_session_items` | `trg_sync_form_packet_session_items_org` | UPDATE BEFORE | CREATE TRIGGER trg_sync_form_packet_session_items_org BEFORE INSERT OR UPDATE OF |
| `form_packet_session_items` | `trg_validate_form_packet_session_items_packet` | INSERT BEFORE | CREATE TRIGGER trg_validate_form_packet_session_items_packet BEFORE INSERT OR UP |
| `form_packet_session_items` | `trg_validate_form_packet_session_items_packet` | UPDATE BEFORE | CREATE TRIGGER trg_validate_form_packet_session_items_packet BEFORE INSERT OR UP |
| `form_packet_session_items` | `trg_validate_form_packet_session_items_sub` | INSERT BEFORE | CREATE TRIGGER trg_validate_form_packet_session_items_sub BEFORE INSERT OR UPDAT |
| `form_packet_session_items` | `trg_validate_form_packet_session_items_sub` | UPDATE BEFORE | CREATE TRIGGER trg_validate_form_packet_session_items_sub BEFORE INSERT OR UPDAT |
| `form_packet_sessions` | `trg_form_packet_sessions_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_form_packet_sessions_updated_at BEFORE UPDATE ON form_packet_ |
| `form_packet_sessions` | `trg_sync_form_packet_sessions_org` | INSERT BEFORE | CREATE TRIGGER trg_sync_form_packet_sessions_org BEFORE INSERT OR UPDATE OF pack |
| `form_packet_sessions` | `trg_sync_form_packet_sessions_org` | UPDATE BEFORE | CREATE TRIGGER trg_sync_form_packet_sessions_org BEFORE INSERT OR UPDATE OF pack |
| `form_packet_sessions` | `trg_validate_form_packet_sessions_link` | INSERT BEFORE | CREATE TRIGGER trg_validate_form_packet_sessions_link BEFORE INSERT OR UPDATE OF |
| `form_packet_sessions` | `trg_validate_form_packet_sessions_link` | UPDATE BEFORE | CREATE TRIGGER trg_validate_form_packet_sessions_link BEFORE INSERT OR UPDATE OF |
| `form_public_links` | `trg_form_public_links_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_form_public_links_updated_at BEFORE UPDATE ON form_public_lin |
| `form_public_links` | `trg_sync_form_public_links_org_from_definition` | INSERT BEFORE | CREATE TRIGGER trg_sync_form_public_links_org_from_definition BEFORE INSERT OR U |
| `form_public_links` | `trg_sync_form_public_links_org_from_definition` | UPDATE BEFORE | CREATE TRIGGER trg_sync_form_public_links_org_from_definition BEFORE INSERT OR U |
| `form_public_links` | `trg_validate_form_public_links_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_form_public_links_consistency BEFORE INSERT OR UPDAT |
| `form_public_links` | `trg_validate_form_public_links_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_form_public_links_consistency BEFORE INSERT OR UPDAT |
| `form_submission_documents` | `trg_sync_form_submission_documents_org` | INSERT BEFORE | CREATE TRIGGER trg_sync_form_submission_documents_org BEFORE INSERT OR UPDATE OF |
| `form_submission_documents` | `trg_sync_form_submission_documents_org` | UPDATE BEFORE | CREATE TRIGGER trg_sync_form_submission_documents_org BEFORE INSERT OR UPDATE OF |
| `form_submission_documents` | `trg_validate_form_submission_documents_doc_org` | INSERT BEFORE | CREATE TRIGGER trg_validate_form_submission_documents_doc_org BEFORE INSERT OR U |
| `form_submission_documents` | `trg_validate_form_submission_documents_doc_org` | UPDATE BEFORE | CREATE TRIGGER trg_validate_form_submission_documents_doc_org BEFORE INSERT OR U |
| `form_submission_signatures` | `trg_sync_form_submission_signatures_org` | INSERT BEFORE | CREATE TRIGGER trg_sync_form_submission_signatures_org BEFORE INSERT OR UPDATE O |
| `form_submission_signatures` | `trg_sync_form_submission_signatures_org` | UPDATE BEFORE | CREATE TRIGGER trg_sync_form_submission_signatures_org BEFORE INSERT OR UPDATE O |
| `form_submission_signatures` | `trg_validate_form_submission_signatures_drawn_doc` | INSERT BEFORE | CREATE TRIGGER trg_validate_form_submission_signatures_drawn_doc BEFORE INSERT O |
| `form_submission_signatures` | `trg_validate_form_submission_signatures_drawn_doc` | UPDATE BEFORE | CREATE TRIGGER trg_validate_form_submission_signatures_drawn_doc BEFORE INSERT O |
| `form_submissions` | `trg_form_submissions_submitted_immutability` | UPDATE BEFORE | CREATE TRIGGER trg_form_submissions_submitted_immutability BEFORE UPDATE ON form |
| `form_submissions` | `trg_form_submissions_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_form_submissions_updated_at BEFORE UPDATE ON form_submissions |
| `form_submissions` | `trg_sync_form_submissions_from_version` | INSERT BEFORE | CREATE TRIGGER trg_sync_form_submissions_from_version BEFORE INSERT OR UPDATE OF |
| `form_submissions` | `trg_sync_form_submissions_from_version` | UPDATE BEFORE | CREATE TRIGGER trg_sync_form_submissions_from_version BEFORE INSERT OR UPDATE OF |
| `gl_account_mappings` | `trg_gl_account_mappings_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_gl_account_mappings_updated_at BEFORE UPDATE ON gl_account_ma |
| `gl_accounts` | `trg_gl_accounts_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_gl_accounts_updated_at BEFORE UPDATE ON gl_accounts FOR EACH  |
| `gl_journal_entries` | `trg_gl_journal_entries_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_gl_journal_entries_updated_at BEFORE UPDATE ON gl_journal_ent |
| `industries` | `trg_industries_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_industries_updated_at BEFORE UPDATE ON industries FOR EACH RO |
| `industry_default_entity_labels` | `trg_industry_default_entity_labels_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_industry_default_entity_labels_updated_at BEFORE UPDATE ON in |
| `jobs` | `jobs_assign_pricing_tier` | INSERT BEFORE | CREATE TRIGGER jobs_assign_pricing_tier BEFORE INSERT ON jobs FOR EACH ROW EXECU |
| `jobs` | `jobs_increment_completed_counter` | UPDATE AFTER | CREATE TRIGGER jobs_increment_completed_counter AFTER UPDATE ON jobs FOR EACH RO |
| `jobs` | `trg_assign_org_record_number_jobs` | INSERT BEFORE | CREATE TRIGGER trg_assign_org_record_number_jobs BEFORE INSERT ON jobs FOR EACH  |
| `jobs` | `trg_jobs_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FU |
| `jobs` | `trg_jobs_work_unit_org_integrity` | INSERT BEFORE | CREATE TRIGGER trg_jobs_work_unit_org_integrity BEFORE INSERT OR UPDATE OF org_i |
| `jobs` | `trg_jobs_work_unit_org_integrity` | UPDATE BEFORE | CREATE TRIGGER trg_jobs_work_unit_org_integrity BEFORE INSERT OR UPDATE OF org_i |
| `location_types` | `trg_location_types_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_location_types_updated_at BEFORE UPDATE ON location_types FOR |
| `locations` | `trg_assign_org_record_number_locations` | INSERT BEFORE | CREATE TRIGGER trg_assign_org_record_number_locations BEFORE INSERT ON locations |
| `locations` | `trg_locations_parent_same_org` | INSERT BEFORE | CREATE TRIGGER trg_locations_parent_same_org BEFORE INSERT OR UPDATE OF parent_l |
| `locations` | `trg_locations_parent_same_org` | UPDATE BEFORE | CREATE TRIGGER trg_locations_parent_same_org BEFORE INSERT OR UPDATE OF parent_l |
| `locations` | `trg_locations_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW  |
| `operational_tasks` | `trg_operational_tasks_org_entity` | INSERT BEFORE | CREATE TRIGGER trg_operational_tasks_org_entity BEFORE INSERT OR UPDATE OF org_i |
| `operational_tasks` | `trg_operational_tasks_org_entity` | UPDATE BEFORE | CREATE TRIGGER trg_operational_tasks_org_entity BEFORE INSERT OR UPDATE OF org_i |
| `operational_tasks` | `trg_operational_tasks_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_operational_tasks_updated_at BEFORE UPDATE ON operational_tas |
| `opportunities` | `trg_assign_org_record_number_opportunities` | INSERT BEFORE | CREATE TRIGGER trg_assign_org_record_number_opportunities BEFORE INSERT ON oppor |
| `opportunities` | `trg_opportunities_work_unit_org_integrity` | INSERT BEFORE | CREATE TRIGGER trg_opportunities_work_unit_org_integrity BEFORE INSERT OR UPDATE |
| `opportunities` | `trg_opportunities_work_unit_org_integrity` | UPDATE BEFORE | CREATE TRIGGER trg_opportunities_work_unit_org_integrity BEFORE INSERT OR UPDATE |
| `opportunities` | `trg_opps_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_opps_updated_at BEFORE UPDATE ON opportunities FOR EACH ROW E |
| `opportunity_customer_members` | `trg_opportunity_customer_members_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_opportunity_customer_members_updated_at BEFORE UPDATE ON oppo |
| `opportunity_customer_members` | `trg_validate_opportunity_customer_members_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_opportunity_customer_members_consistency BEFORE INSE |
| `opportunity_customer_members` | `trg_validate_opportunity_customer_members_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_opportunity_customer_members_consistency BEFORE INSE |
| `opportunity_persons` | `trg_opportunity_persons_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_opportunity_persons_updated_at BEFORE UPDATE ON opportunity_p |
| `opportunity_persons` | `trg_validate_opportunity_persons_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_opportunity_persons_consistency BEFORE INSERT OR UPD |
| `opportunity_persons` | `trg_validate_opportunity_persons_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_opportunity_persons_consistency BEFORE INSERT OR UPD |
| `payment_allocations` | `trg_payment_allocations_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_payment_allocations_updated_at BEFORE UPDATE ON payment_alloc |
| `payments` | `payments_post_to_ledger` | UPDATE AFTER | CREATE TRIGGER payments_post_to_ledger AFTER UPDATE OF posted_at, paid_at ON pay |
| `payments` | `trg_payments_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EX |
| `person_relationship_type_settings` | `trg_person_relationship_type_settings_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_person_relationship_type_settings_updated_at BEFORE UPDATE ON |
| `persons` | `trg_assign_org_record_number_persons` | INSERT BEFORE | CREATE TRIGGER trg_assign_org_record_number_persons BEFORE INSERT ON persons FOR |
| `persons` | `trg_set_person_full_name` | INSERT BEFORE | CREATE TRIGGER trg_set_person_full_name BEFORE INSERT OR UPDATE OF first_name, l |
| `persons` | `trg_set_person_full_name` | UPDATE BEFORE | CREATE TRIGGER trg_set_person_full_name BEFORE INSERT OR UPDATE OF first_name, l |
| `placement_candidates` | `trg_placement_candidates_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_placement_candidates_updated_at BEFORE UPDATE ON placement_ca |
| `placement_candidates` | `trg_validate_placement_candidates_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_placement_candidates_consistency BEFORE INSERT OR UP |
| `placement_candidates` | `trg_validate_placement_candidates_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_placement_candidates_consistency BEFORE INSERT OR UP |
| `placement_link_group_members` | `trg_validate_placement_link_group_members_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_placement_link_group_members_consistency BEFORE INSE |
| `placement_link_group_members` | `trg_validate_placement_link_group_members_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_placement_link_group_members_consistency BEFORE INSE |
| `placement_link_groups` | `trg_placement_link_groups_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_placement_link_groups_updated_at BEFORE UPDATE ON placement_l |
| `placement_link_groups` | `trg_validate_placement_link_groups_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_placement_link_groups_consistency BEFORE INSERT OR U |
| `placement_link_groups` | `trg_validate_placement_link_groups_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_placement_link_groups_consistency BEFORE INSERT OR U |
| `placement_overrides` | `trg_placement_overrides_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_placement_overrides_updated_at BEFORE UPDATE ON placement_ove |
| `placement_overrides` | `trg_validate_placement_overrides_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_placement_overrides_consistency BEFORE INSERT OR UPD |
| `placement_overrides` | `trg_validate_placement_overrides_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_placement_overrides_consistency BEFORE INSERT OR UPD |
| `pricing_addons` | `trg_pricing_addons_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_pricing_addons_updated_at BEFORE UPDATE ON pricing_addons FOR |
| `pricing_first_clean_prices` | `trg_pricing_first_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_pricing_first_updated_at BEFORE UPDATE ON pricing_first_clean |
| `pricing_frequencies` | `trg_pricing_freq_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_pricing_freq_updated_at BEFORE UPDATE ON pricing_frequencies  |
| `pricing_recurring_prices` | `trg_pricing_rec_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_pricing_rec_updated_at BEFORE UPDATE ON pricing_recurring_pri |
| `pricing_services` | `trg_pricing_services_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_pricing_services_updated_at BEFORE UPDATE ON pricing_services |
| `pricing_square_footage_tiers` | `trg_pricing_sqft_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_pricing_sqft_updated_at BEFORE UPDATE ON pricing_square_foota |
| `processing_cases` | `trg_processing_cases_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_processing_cases_updated_at BEFORE UPDATE ON processing_cases |
| `quotes` | `trg_quotes_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUT |
| `record_drawer_layouts` | `trg_record_drawer_layouts_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_record_drawer_layouts_updated_at BEFORE UPDATE ON record_draw |
| `recurrence_plans` | `trg_recurrence_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_recurrence_updated_at BEFORE UPDATE ON recurrence_plans FOR E |
| `role_definitions` | `trg_role_definitions_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_role_definitions_updated_at BEFORE UPDATE ON role_definitions |
| `role_permission_grants` | `trg_role_permission_grants_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_role_permission_grants_updated_at BEFORE UPDATE ON role_permi |
| `schedule_assignments` | `trg_schedule_assignments_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_schedule_assignments_updated_at BEFORE UPDATE ON schedule_ass |
| `schedule_assignments` | `trg_validate_schedule_assignments_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_schedule_assignments_consistency BEFORE INSERT OR UP |
| `schedule_assignments` | `trg_validate_schedule_assignments_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_schedule_assignments_consistency BEFORE INSERT OR UP |
| `schedule_patterns` | `trg_schedule_patterns_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_schedule_patterns_updated_at BEFORE UPDATE ON schedule_patter |
| `schedule_patterns` | `trg_validate_schedule_patterns_consistency` | INSERT BEFORE | CREATE TRIGGER trg_validate_schedule_patterns_consistency BEFORE INSERT OR UPDAT |
| `schedule_patterns` | `trg_validate_schedule_patterns_consistency` | UPDATE BEFORE | CREATE TRIGGER trg_validate_schedule_patterns_consistency BEFORE INSERT OR UPDAT |
| `schedule_patterns` | `trg_validate_schedule_patterns_weekdays` | INSERT BEFORE | CREATE TRIGGER trg_validate_schedule_patterns_weekdays BEFORE INSERT OR UPDATE O |
| `schedule_patterns` | `trg_validate_schedule_patterns_weekdays` | UPDATE BEFORE | CREATE TRIGGER trg_validate_schedule_patterns_weekdays BEFORE INSERT OR UPDATE O |
| `schedules` | `trg_assign_org_record_number_schedules` | INSERT BEFORE | CREATE TRIGGER trg_assign_org_record_number_schedules BEFORE INSERT ON schedules |
| `schedules` | `trg_prevent_completed_schedule_history_rewrite` | UPDATE BEFORE | CREATE TRIGGER trg_prevent_completed_schedule_history_rewrite BEFORE UPDATE ON s |
| `schedules` | `trg_schedules_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_schedules_updated_at BEFORE UPDATE ON schedules FOR EACH ROW  |
| `service_offerings` | `trg_service_offerings_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_service_offerings_updated_at BEFORE UPDATE ON service_offerin |
| `service_plan_templates` | `trg_service_plan_templates_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_service_plan_templates_updated_at BEFORE UPDATE ON service_pl |
| `service_pricing_rules` | `trg_service_pricing_rules_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_service_pricing_rules_updated_at BEFORE UPDATE ON service_pri |
| `status_definitions` | `trg_status_definitions_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_status_definitions_updated_at BEFORE UPDATE ON status_definit |
| `status_transition_rules` | `set_status_transition_rules_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_status_transition_rules_updated_at BEFORE UPDATE ON status_tr |
| `task_assist_proposals` | `trg_task_assist_proposals_org_entity` | INSERT BEFORE | CREATE TRIGGER trg_task_assist_proposals_org_entity BEFORE INSERT OR UPDATE OF o |
| `task_assist_proposals` | `trg_task_assist_proposals_org_entity` | UPDATE BEFORE | CREATE TRIGGER trg_task_assist_proposals_org_entity BEFORE INSERT OR UPDATE OF o |
| `task_assist_proposals` | `trg_task_assist_proposals_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_task_assist_proposals_updated_at BEFORE UPDATE ON task_assist |
| `tour_availability_rules` | `trg_tour_availability_rules_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_tour_availability_rules_updated_at BEFORE UPDATE ON tour_avai |
| `tour_availability_rules` | `trg_validate_tour_availability_rules_location_org` | INSERT BEFORE | CREATE TRIGGER trg_validate_tour_availability_rules_location_org BEFORE INSERT O |
| `tour_availability_rules` | `trg_validate_tour_availability_rules_location_org` | UPDATE BEFORE | CREATE TRIGGER trg_validate_tour_availability_rules_location_org BEFORE INSERT O |
| `tour_bookings` | `trg_tour_bookings_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_tour_bookings_updated_at BEFORE UPDATE ON tour_bookings FOR E |
| `tour_bookings` | `trg_validate_tour_booking_org_integrity` | INSERT BEFORE | CREATE TRIGGER trg_validate_tour_booking_org_integrity BEFORE INSERT OR UPDATE O |
| `tour_bookings` | `trg_validate_tour_booking_org_integrity` | UPDATE BEFORE | CREATE TRIGGER trg_validate_tour_booking_org_integrity BEFORE INSERT OR UPDATE O |
| `tour_public_booking_links` | `trg_tour_public_booking_links_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_tour_public_booking_links_updated_at BEFORE UPDATE ON tour_pu |
| `tour_public_booking_links` | `trg_validate_tour_public_booking_link_scope` | INSERT BEFORE | CREATE TRIGGER trg_validate_tour_public_booking_link_scope BEFORE INSERT OR UPDA |
| `tour_public_booking_links` | `trg_validate_tour_public_booking_link_scope` | UPDATE BEFORE | CREATE TRIGGER trg_validate_tour_public_booking_link_scope BEFORE INSERT OR UPDA |
| `user_access_profiles` | `trg_user_access_profiles_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_user_access_profiles_updated_at BEFORE UPDATE ON user_access_ |
| `user_department_access` | `trg_user_department_access_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_user_department_access_updated_at BEFORE UPDATE ON user_depar |
| `user_department_access` | `trg_validate_user_department_access_org_match` | INSERT BEFORE | CREATE TRIGGER trg_validate_user_department_access_org_match BEFORE INSERT OR UP |
| `user_department_access` | `trg_validate_user_department_access_org_match` | UPDATE BEFORE | CREATE TRIGGER trg_validate_user_department_access_org_match BEFORE INSERT OR UP |
| `user_profiles` | `trg_user_profiles_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR E |
| `user_site_access` | `trg_user_site_access_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_user_site_access_updated_at BEFORE UPDATE ON user_site_access |
| `user_site_access` | `trg_validate_user_site_access_site_and_org` | INSERT BEFORE | CREATE TRIGGER trg_validate_user_site_access_site_and_org BEFORE INSERT OR UPDAT |
| `user_site_access` | `trg_validate_user_site_access_site_and_org` | UPDATE BEFORE | CREATE TRIGGER trg_validate_user_site_access_site_and_org BEFORE INSERT OR UPDAT |
| `vendor_users` | `trg_vendor_users_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_vendor_users_updated_at BEFORE UPDATE ON vendor_users FOR EAC |
| `vendors` | `trg_assign_org_record_number_vendors` | INSERT BEFORE | CREATE TRIGGER trg_assign_org_record_number_vendors BEFORE INSERT ON vendors FOR |
| `vendors` | `trg_vendor_primary_contact_link` | INSERT AFTER | CREATE TRIGGER trg_vendor_primary_contact_link AFTER INSERT OR UPDATE OF primary |
| `vendors` | `trg_vendor_primary_contact_link` | UPDATE AFTER | CREATE TRIGGER trg_vendor_primary_contact_link AFTER INSERT OR UPDATE OF primary |
| `vendors` | `trg_vendors_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXEC |
| `verticals` | `trg_verticals_updated_at` | UPDATE BEFORE | CREATE TRIGGER trg_verticals_updated_at BEFORE UPDATE ON verticals FOR EACH ROW  |
| `workflow_runs` | `trg_workflow_runs_set_org_id` | INSERT BEFORE | CREATE TRIGGER trg_workflow_runs_set_org_id BEFORE INSERT ON workflow_runs FOR E |
| `workflows` | `set_workflows_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW  |
| `workspace_kpi_placement` | `set_workspace_kpi_placement_updated_at` | UPDATE BEFORE | CREATE TRIGGER set_workspace_kpi_placement_updated_at BEFORE UPDATE ON workspace |
