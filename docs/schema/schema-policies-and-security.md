# Schema — policies and security

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** 2026-06-12 · **RLS policy count:** 469

## Posture

- **Org scoping:** Most tenant tables include `org_id` or resolve org through FK chains.
- **Service role writes:** Communications V1 canonical tables and several mutation paths require `service_role` for INSERT/UPDATE.
- **Deny-by-default:** Tables with RLS enabled and zero policies deny access for subject roles.

## Policies by table

### `access_methods`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `action_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `action_definitions_all_service_role` | ALL | {service_role} | — |
| `action_definitions_select_authenticated` | SELECT | {authenticated} | — |

### `action_links`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `action_links_delete_same_org` | DELETE | {authenticated} | — |
| `action_links_insert_same_org` | INSERT | {authenticated} | — |
| `action_links_select_same_org` | SELECT | {authenticated} | — |
| `action_links_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access action_links` | ALL | {service_role} | — |

### `action_placements`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `action_placements_all_service_role` | ALL | {service_role} | — |
| `action_placements_select_authenticated` | SELECT | {authenticated} | — |

### `activity_log`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `addon_frequencies`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `addon_types`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `agent_v0_apply_audit`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `agent_v0_apply_audit_insert_by_org_admin` | INSERT | {authenticated} | — |
| `agent_v0_apply_audit_select_by_org_admin` | SELECT | {authenticated} | — |

### `agent_v0_proposals`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `agent_v0_proposals_insert_by_org_admin` | INSERT | {authenticated} | — |
| `agent_v0_proposals_select_by_org_admin` | SELECT | {authenticated} | — |

### `agent_v1_record_layout_apply_audit`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `agent_v1_rl_apply_insert_by_org_admin` | INSERT | {authenticated} | — |
| `agent_v1_rl_apply_select_by_org_role` | SELECT | {authenticated} | — |

### `agent_v1_record_layout_proposals`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `agent_v1_rl_proposals_insert_by_org_admin` | INSERT | {authenticated} | — |
| `agent_v1_rl_proposals_select_by_org_role` | SELECT | {authenticated} | — |

### `agent_v2_field_visibility_apply_audit`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `agent_v2_fv_apply_insert_by_org_admin` | INSERT | {authenticated} | — |
| `agent_v2_fv_apply_select_by_org_role` | SELECT | {authenticated} | — |

### `agent_v2_field_visibility_proposals`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `agent_v2_fv_proposals_insert_by_org_admin` | INSERT | {authenticated} | — |
| `agent_v2_fv_proposals_select_by_org_role` | SELECT | {authenticated} | — |

### `app_users`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `app_users_admin_write` | ALL | {public} | — |
| `app_users_read_self_or_admin` | SELECT | {public} | — |

### `assignment_statuses`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `assignments`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `campaigns`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `charge_line_items`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `charge_line_items_insert_same_org` | INSERT | {authenticated} | — |
| `charge_line_items_select_same_org` | SELECT | {authenticated} | — |
| `charge_line_items_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access charge_line_items` | ALL | {service_role} | — |

### `charges`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `charges_insert_same_org` | INSERT | {authenticated} | — |
| `charges_select_same_org` | SELECT | {authenticated} | — |
| `charges_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access charges` | ALL | {service_role} | — |

### `cleaning_job_addons`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `cleaning_job_details`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `cleaning_service_types`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `communication_message_reads`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `communication_reads_select_org` | SELECT | {authenticated} | — |
| `communication_reads_service_all` | ALL | {authenticated} | — |

### `communication_messages`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `communication_messages_select_org` | SELECT | {authenticated} | — |
| `communication_messages_service_all` | ALL | {authenticated} | — |

### `communication_provider_bindings`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `communication_bindings_select_org` | SELECT | {authenticated} | — |
| `communication_bindings_service_all` | ALL | {authenticated} | — |

### `communication_scheduled_sends`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `communication_scheduled_sends_mutate_crm` | INSERT | {authenticated} | — |
| `communication_scheduled_sends_select_org` | SELECT | {authenticated} | — |
| `communication_scheduled_sends_service_all` | ALL | {authenticated} | — |
| `communication_scheduled_sends_update_crm` | UPDATE | {authenticated} | — |

### `communication_threads`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `communication_threads_select_org` | SELECT | {authenticated} | — |
| `communication_threads_service_all` | ALL | {authenticated} | — |

### `config_layout_assist_proposals`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `config_layout_assist_proposals_insert_admin` | INSERT | {authenticated} | — |
| `config_layout_assist_proposals_select_org` | SELECT | {authenticated} | — |
| `config_layout_assist_proposals_service_all` | ALL | {service_role} | — |
| `config_layout_assist_proposals_update_admin` | UPDATE | {authenticated} | — |

### `contact_tags`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `contacts`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |
| `contacts_insert_by_org_role` | INSERT | {public} | — |
| `contacts_select_by_org_role` | SELECT | {public} | — |
| `contacts_update_by_org_role` | UPDATE | {public} | — |

### `customer_member_contact_roles`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `customer_member_contact_roles_modify_admin_ops` | ALL | {authenticated} | — |
| `customer_member_contact_roles_select_org_members` | SELECT | {authenticated} | — |
| `customer_member_contact_roles_service_role_all` | ALL | {public} | — |

### `customer_member_contacts`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `customer_member_contacts_modify_admin_ops` | ALL | {authenticated} | — |
| `customer_member_contacts_select_org_members` | SELECT | {authenticated} | — |
| `customer_member_contacts_service_role_all` | ALL | {public} | — |

### `customer_member_relationship_types`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `cmrt_modify_admin_ops` | ALL | {authenticated} | — |
| `cmrt_select_org_members` | SELECT | {authenticated} | — |
| `cmrt_service_role_all` | ALL | {public} | — |
| `customer_member_relationship_types_modify_admin_ops` | ALL | {authenticated} | — |
| `customer_member_relationship_types_select_org_members` | SELECT | {authenticated} | — |
| `customer_member_relationship_types_service_role_all` | ALL | {public} | — |

### `customer_members`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `customer_members_modify_admin_ops` | ALL | {authenticated} | — |
| `customer_members_select_org_members` | SELECT | {authenticated} | — |
| `customer_members_service_role_all` | ALL | {public} | — |

### `customer_person_role_types`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `customer_person_role_types_delete_by_org_role` | DELETE | {authenticated} | — |
| `customer_person_role_types_insert_by_org_role` | INSERT | {public} | — |
| `customer_person_role_types_select_by_org_role` | SELECT | {public} | — |
| `customer_person_role_types_update_by_org_role` | UPDATE | {public} | — |

### `customer_persons`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `customer_persons_delete_by_org_role` | DELETE | {authenticated} | — |
| `customer_persons_insert_by_org_role` | INSERT | {public} | — |
| `customer_persons_select_by_org_role` | SELECT | {public} | — |
| `customer_persons_update_by_org_role` | UPDATE | {public} | — |

### `customer_subscriptions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `customer_subscriptions_delete_same_org` | DELETE | {authenticated} | — |
| `customer_subscriptions_insert_same_org` | INSERT | {authenticated} | — |
| `customer_subscriptions_select_same_org` | SELECT | {authenticated} | — |
| `customer_subscriptions_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access customer_subscriptions` | ALL | {service_role} | — |

### `customer_tags`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `customers`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `departments`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `departments_delete_same_org` | DELETE | {authenticated} | — |
| `departments_insert_same_org` | INSERT | {authenticated} | — |
| `departments_select_same_org` | SELECT | {authenticated} | — |
| `departments_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access departments` | ALL | {service_role} | — |

### `discount_applications`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `discount_applications_admin_ops_full_access` | ALL | {public} | — |
| `service_role_full_access_discount_applications` | ALL | {service_role} | — |

### `discount_codes`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `service_role_all_discount_codes` | ALL | {service_role} | — |

### `discount_commitments`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `discount_commitments_admin_ops_full_access` | ALL | {public} | — |
| `service_role_full_access_discount_commitments` | ALL | {service_role} | — |

### `discount_program_benefits`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `discount_program_benefits_admin_ops_full_access` | ALL | {public} | — |
| `service_role_full_access_discount_program_benefits` | ALL | {service_role} | — |

### `discount_program_commitment_rules`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `discount_program_commitment_rules_admin_ops_full_access` | ALL | {public} | — |
| `service_role_full_access_discount_program_commitment_rules` | ALL | {service_role} | — |

### `discount_program_qualifiers`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `discount_program_qualifiers_admin_ops_full_access` | ALL | {public} | — |
| `service_role_full_access_discount_program_qualifiers` | ALL | {service_role} | — |

### `discount_programs`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `discount_programs_admin_ops_full_access` | ALL | {public} | — |
| `service_role_full_access_discount_programs` | ALL | {service_role} | — |

### `discount_redemptions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `service_role_all_discount_redemptions` | ALL | {service_role} | — |

### `discounts`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `document_field_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `document_field_definitions_delete_org` | DELETE | {authenticated} | — |
| `document_field_definitions_insert_org` | INSERT | {authenticated} | — |
| `document_field_definitions_select_org` | SELECT | {authenticated} | — |
| `document_field_definitions_update_org` | UPDATE | {authenticated} | — |

### `document_field_values`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `document_field_values_delete_org` | DELETE | {authenticated} | — |
| `document_field_values_insert_org` | INSERT | {authenticated} | — |
| `document_field_values_select_org` | SELECT | {authenticated} | — |
| `document_field_values_update_org` | UPDATE | {authenticated} | — |

### `document_versions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `document_versions_delete_org` | DELETE | {authenticated} | — |
| `document_versions_insert_org` | INSERT | {authenticated} | — |
| `document_versions_select_org` | SELECT | {authenticated} | — |
| `document_versions_update_org` | UPDATE | {authenticated} | — |

### `documents`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `documents_delete_org_admin` | DELETE | {authenticated} | — |
| `documents_select_org_admin` | SELECT | {authenticated} | — |
| `documents_update_org_admin` | UPDATE | {authenticated} | — |
| `documents_write_org_admin` | INSERT | {authenticated} | — |

### `entity_labels`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `entity_labels_modify_admin_ops` | ALL | {authenticated} | — |
| `entity_labels_select` | SELECT | {authenticated} | — |
| `entity_labels_select_org_members` | SELECT | {public} | — |
| `entity_labels_service_role` | ALL | {public} | — |

### `external_mappings`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `field_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `field_definitions_delete_by_org_role` | DELETE | {public} | — |
| `field_definitions_insert_by_org_role` | INSERT | {public} | — |
| `field_definitions_select_by_org_role` | SELECT | {public} | — |
| `field_definitions_update_by_org_role` | UPDATE | {public} | — |

### `field_section_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `field_section_definitions_delete_by_org_role` | DELETE | {authenticated} | — |
| `field_section_definitions_insert_by_org_role` | INSERT | {authenticated} | — |
| `field_section_definitions_select_by_org_role` | SELECT | {authenticated} | — |
| `field_section_definitions_update_by_org_role` | UPDATE | {authenticated} | — |

### `field_values`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `field_values_delete_by_org_role` | DELETE | {public} | — |
| `field_values_insert_by_org_role` | INSERT | {public} | — |
| `field_values_select_by_org_role` | SELECT | {public} | — |
| `field_values_update_by_org_role` | UPDATE | {public} | — |

### `form_definition_versions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_definition_versions_all_service_role` | ALL | {service_role} | — |
| `form_definition_versions_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_definition_versions_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_definition_versions_select_by_org_role` | SELECT | {authenticated} | — |
| `form_definition_versions_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_definitions_all_service_role` | ALL | {service_role} | — |
| `form_definitions_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_definitions_insert_by_org_role` | INSERT | {authenticated} | — |
| `form_definitions_select_by_org_role` | SELECT | {authenticated} | — |
| `form_definitions_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_packet_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_packet_definitions_all_service_role` | ALL | {service_role} | — |
| `form_packet_definitions_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_packet_definitions_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_packet_definitions_select_by_org_role` | SELECT | {authenticated} | — |
| `form_packet_definitions_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_packet_items`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_packet_items_all_service_role` | ALL | {service_role} | — |
| `form_packet_items_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_packet_items_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_packet_items_select_by_org_role` | SELECT | {authenticated} | — |
| `form_packet_items_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_packet_session_items`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_packet_session_items_all_service_role` | ALL | {service_role} | — |
| `form_packet_session_items_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_packet_session_items_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_packet_session_items_select_by_org_role` | SELECT | {authenticated} | — |
| `form_packet_session_items_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_packet_sessions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_packet_sessions_all_service_role` | ALL | {service_role} | — |
| `form_packet_sessions_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_packet_sessions_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_packet_sessions_select_by_org_role` | SELECT | {authenticated} | — |
| `form_packet_sessions_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_public_links`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_public_links_all_service_role` | ALL | {service_role} | — |
| `form_public_links_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_public_links_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_public_links_select_by_org_role` | SELECT | {authenticated} | — |
| `form_public_links_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_submission_documents`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_submission_documents_all_service_role` | ALL | {service_role} | — |
| `form_submission_documents_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_submission_documents_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_submission_documents_select_by_org_role` | SELECT | {authenticated} | — |
| `form_submission_documents_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_submission_signatures`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_submission_signatures_all_service_role` | ALL | {service_role} | — |
| `form_submission_signatures_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_submission_signatures_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_submission_signatures_select_by_org_role` | SELECT | {authenticated} | — |
| `form_submission_signatures_update_by_org_role` | UPDATE | {authenticated} | — |

### `form_submissions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `form_submissions_all_service_role` | ALL | {service_role} | — |
| `form_submissions_delete_by_org_role` | DELETE | {authenticated} | — |
| `form_submissions_mutate_by_org_role` | INSERT | {authenticated} | — |
| `form_submissions_select_by_org_role` | SELECT | {authenticated} | — |
| `form_submissions_update_by_org_role` | UPDATE | {authenticated} | — |

### `gl_account_mappings`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `gl_account_mappings_delete_same_org` | DELETE | {authenticated} | — |
| `gl_account_mappings_insert_same_org` | INSERT | {authenticated} | — |
| `gl_account_mappings_select_same_org` | SELECT | {authenticated} | — |
| `gl_account_mappings_update_same_org` | UPDATE | {authenticated} | — |
| `service_role_full_access_gl_account_mappings` | ALL | {service_role} | — |

### `gl_accounts`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `gl_accounts_delete_same_org` | DELETE | {authenticated} | — |
| `gl_accounts_insert_same_org` | INSERT | {authenticated} | — |
| `gl_accounts_select_same_org` | SELECT | {authenticated} | — |
| `gl_accounts_update_same_org` | UPDATE | {authenticated} | — |
| `service_role_full_access_gl_accounts` | ALL | {service_role} | — |

### `gl_journal_entries`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `gl_journal_entries_delete_same_org` | DELETE | {authenticated} | — |
| `gl_journal_entries_insert_same_org` | INSERT | {authenticated} | — |
| `gl_journal_entries_select_same_org` | SELECT | {authenticated} | — |
| `gl_journal_entries_update_same_org` | UPDATE | {authenticated} | — |
| `service_role_full_access_gl_journal_entries` | ALL | {service_role} | — |

### `gl_journal_lines`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `gl_journal_lines_delete_same_org` | DELETE | {authenticated} | — |
| `gl_journal_lines_insert_same_org` | INSERT | {authenticated} | — |
| `gl_journal_lines_select_same_org` | SELECT | {authenticated} | — |
| `gl_journal_lines_update_same_org` | UPDATE | {authenticated} | — |
| `service_role_full_access_gl_journal_lines` | ALL | {service_role} | — |

### `home_types`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `industries`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `industries_select` | SELECT | {authenticated} | — |

### `industry_default_entity_labels`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `industry_default_entity_labels_select` | SELECT | {authenticated} | — |

### `job_line_items`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `job_line_items_delete_same_org` | DELETE | {authenticated} | — |
| `job_line_items_insert_same_org` | INSERT | {authenticated} | — |
| `job_line_items_select_same_org` | SELECT | {authenticated} | — |
| `job_line_items_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access job_line_items` | ALL | {service_role} | — |

### `job_pricing_snapshots`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `job_pricing_snapshots_delete_same_org` | DELETE | {authenticated} | — |
| `job_pricing_snapshots_insert_same_org` | INSERT | {authenticated} | — |
| `job_pricing_snapshots_select_same_org` | SELECT | {authenticated} | — |
| `job_pricing_snapshots_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access job_pricing_snapshots` | ALL | {service_role} | — |

### `job_statuses`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `job_tags`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `jobs`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `ledger_transactions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `ledger_transactions_delete_same_org` | DELETE | {authenticated} | — |
| `ledger_transactions_insert_same_org` | INSERT | {authenticated} | — |
| `ledger_transactions_select_same_org` | SELECT | {authenticated} | — |
| `ledger_transactions_update_same_org` | UPDATE | {authenticated} | — |
| `service_role_full_access_ledger_transactions` | ALL | {service_role} | — |

### `location_tags`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `location_types`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `location_types_modify` | ALL | {authenticated} | — |
| `location_types_select` | SELECT | {authenticated} | — |

### `locations`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `messages`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `messages_outbox`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `messages_outbox_delete_service_role` | DELETE | {authenticated} | — |
| `messages_outbox_insert_service_role` | INSERT | {authenticated} | — |
| `messages_outbox_select_org_members` | SELECT | {authenticated} | — |
| `messages_outbox_update_service_role` | UPDATE | {authenticated} | — |

### `operational_tasks`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `operational_tasks_insert_crm` | INSERT | {authenticated} | — |
| `operational_tasks_select_org` | SELECT | {authenticated} | — |
| `operational_tasks_service_all` | ALL | {authenticated} | — |
| `operational_tasks_update_crm` | UPDATE | {authenticated} | — |

### `opportunities`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `opportunity_customer_members`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `opportunity_persons`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `opportunity_tags`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `option_set_items`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `option_set_items_delete_by_org` | DELETE | {authenticated} | — |
| `option_set_items_insert_by_org` | INSERT | {authenticated} | — |
| `option_set_items_select_by_org` | SELECT | {authenticated} | — |
| `option_set_items_update_by_org` | UPDATE | {authenticated} | — |

### `option_sets`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `option_sets_delete_by_org_role` | DELETE | {authenticated} | — |
| `option_sets_insert_by_org_role` | INSERT | {authenticated} | — |
| `option_sets_select_by_org_role` | SELECT | {authenticated} | — |
| `option_sets_update_by_org_role` | UPDATE | {authenticated} | — |

### `org_settings`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `org_settings_delete_org` | DELETE | {authenticated} | — |
| `org_settings_insert_org` | INSERT | {authenticated} | — |
| `org_settings_select_org` | SELECT | {authenticated} | — |
| `org_settings_update_org` | UPDATE | {authenticated} | — |

### `payment_allocations`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `payment_allocations_insert_same_org` | INSERT | {authenticated} | — |
| `payment_allocations_select_same_org` | SELECT | {authenticated} | — |
| `payment_allocations_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access payment_allocations` | ALL | {service_role} | — |

### `payment_statuses`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `payments`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |
| `payments_insert_same_org` | INSERT | {authenticated} | — |
| `payments_select_same_org` | SELECT | {authenticated} | — |
| `payments_update_same_org` | UPDATE | {authenticated} | — |
| `service role full access payments` | ALL | {service_role} | — |

### `permission_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `permission_definitions_delete_service_role` | DELETE | {authenticated} | — |
| `permission_definitions_insert_service_role` | INSERT | {authenticated} | — |
| `permission_definitions_select` | SELECT | {authenticated} | — |
| `permission_definitions_update_service_role` | UPDATE | {authenticated} | — |

### `permission_keys`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `permission_keys_select` | SELECT | {public} | — |
| `permission_keys_service_role_all` | ALL | {public} | — |

### `permissions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `permissions_all_service_role` | ALL | {public} | — |
| `permissions_select_authenticated` | SELECT | {authenticated} | — |

### `person_locations`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `person_locations_delete_org` | DELETE | {authenticated} | — |
| `person_locations_insert_org` | INSERT | {authenticated} | — |
| `person_locations_select_org` | SELECT | {authenticated} | — |
| `person_locations_update_org` | UPDATE | {authenticated} | — |

### `person_relationship_type_settings`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `person_relationship_type_settings_delete_by_org_role` | DELETE | {authenticated} | — |
| `person_relationship_type_settings_insert_by_org_role` | INSERT | {public} | — |
| `person_relationship_type_settings_select_by_org_role` | SELECT | {public} | — |
| `person_relationship_type_settings_update_by_org_role` | UPDATE | {public} | — |

### `person_relationships`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `person_relationships_delete_by_org_role` | DELETE | {authenticated} | — |
| `person_relationships_insert_by_org_role` | INSERT | {public} | — |
| `person_relationships_select_by_org_role` | SELECT | {public} | — |
| `person_relationships_update_by_org_role` | UPDATE | {public} | — |

### `persons`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `persons_delete_by_org_role` | DELETE | {authenticated} | — |
| `persons_insert_by_org_role` | INSERT | {public} | — |
| `persons_select_by_org_role` | SELECT | {public} | — |
| `persons_update_by_org_role` | UPDATE | {public} | — |

### `pipeline_stages`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `pipelines`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `placement_candidates`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `placement_candidates_mutate_crm` | ALL | {authenticated} | — |
| `placement_candidates_select_org` | SELECT | {authenticated} | — |
| `placement_candidates_service_all` | ALL | {authenticated} | — |

### `placement_link_group_members`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `placement_link_group_members_mutate_crm` | ALL | {authenticated} | — |
| `placement_link_group_members_select_org` | SELECT | {authenticated} | — |
| `placement_link_group_members_service_all` | ALL | {authenticated} | — |

### `placement_link_groups`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `placement_link_groups_mutate_crm` | ALL | {authenticated} | — |
| `placement_link_groups_select_org` | SELECT | {authenticated} | — |
| `placement_link_groups_service_all` | ALL | {authenticated} | — |

### `placement_overrides`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `placement_overrides_mutate_crm` | ALL | {authenticated} | — |
| `placement_overrides_select_org` | SELECT | {authenticated} | — |
| `placement_overrides_service_all` | ALL | {authenticated} | — |

### `pricing_addons`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_addons_read` | SELECT | {public} | — |
| `pricing_addons_write` | ALL | {public} | — |
| `pricing_admin_delete_addons` | DELETE | {authenticated} | — |
| `pricing_admin_insert_addons` | INSERT | {authenticated} | — |
| `pricing_admin_update_addons` | UPDATE | {authenticated} | — |
| `pricing_read_addons` | SELECT | {authenticated} | — |

### `pricing_dimension_values`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_dimension_values_delete_org` | DELETE | {authenticated} | — |
| `pricing_dimension_values_insert_org` | INSERT | {authenticated} | — |
| `pricing_dimension_values_select_org` | SELECT | {authenticated} | — |
| `pricing_dimension_values_update_org` | UPDATE | {authenticated} | — |

### `pricing_dimensions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_dimensions_delete_org` | DELETE | {authenticated} | — |
| `pricing_dimensions_insert_org` | INSERT | {authenticated} | — |
| `pricing_dimensions_select_org` | SELECT | {authenticated} | — |
| `pricing_dimensions_update_org` | UPDATE | {authenticated} | — |

### `pricing_first_clean_prices`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_admin_delete_first_clean` | DELETE | {authenticated} | — |
| `pricing_admin_insert_first_clean` | INSERT | {authenticated} | — |
| `pricing_admin_update_first_clean` | UPDATE | {authenticated} | — |
| `pricing_first_read` | SELECT | {public} | — |
| `pricing_first_write` | ALL | {public} | — |
| `pricing_read_first_clean` | SELECT | {authenticated} | — |

### `pricing_frequencies`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_admin_delete_frequencies` | DELETE | {authenticated} | — |
| `pricing_admin_insert_frequencies` | INSERT | {authenticated} | — |
| `pricing_admin_update_frequencies` | UPDATE | {authenticated} | — |
| `pricing_freq_read` | SELECT | {public} | — |
| `pricing_freq_write` | ALL | {public} | — |
| `pricing_read_frequencies` | SELECT | {authenticated} | — |

### `pricing_matrix`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_matrix_delete_org` | DELETE | {authenticated} | — |
| `pricing_matrix_insert_org` | INSERT | {authenticated} | — |
| `pricing_matrix_select_org` | SELECT | {authenticated} | — |
| `pricing_matrix_update_org` | UPDATE | {authenticated} | — |

### `pricing_modes`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_modes_delete_org` | DELETE | {authenticated} | — |
| `pricing_modes_insert_org` | INSERT | {authenticated} | — |
| `pricing_modes_select_org` | SELECT | {authenticated} | — |
| `pricing_modes_update_org` | UPDATE | {authenticated} | — |

### `pricing_recurring_prices`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_admin_delete_recurring` | DELETE | {authenticated} | — |
| `pricing_admin_insert_recurring` | INSERT | {authenticated} | — |
| `pricing_admin_update_recurring` | UPDATE | {authenticated} | — |
| `pricing_read_recurring` | SELECT | {authenticated} | — |
| `pricing_recurring_read` | SELECT | {public} | — |
| `pricing_recurring_write` | ALL | {public} | — |

### `pricing_services`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_admin_delete_services` | DELETE | {authenticated} | — |
| `pricing_admin_insert_services` | INSERT | {authenticated} | — |
| `pricing_admin_update_services` | UPDATE | {authenticated} | — |
| `pricing_read_services` | SELECT | {authenticated} | — |
| `pricing_services_read` | SELECT | {public} | — |
| `pricing_services_write` | ALL | {public} | — |

### `pricing_square_footage_tiers`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `pricing_admin_delete_sqft` | DELETE | {authenticated} | — |
| `pricing_admin_insert_sqft` | INSERT | {authenticated} | — |
| `pricing_admin_update_sqft` | UPDATE | {authenticated} | — |
| `pricing_read_sqft` | SELECT | {public} | — |
| `pricing_sqft_read` | SELECT | {public} | — |
| `pricing_sqft_write` | ALL | {public} | — |

### `quotes`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `record_actions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `record_actions_all_service_role` | ALL | {service_role} | — |
| `record_actions_select_authenticated` | SELECT | {authenticated} | — |

### `record_drawer_layouts`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `record_drawer_layouts_delete_by_org_role` | DELETE | {authenticated} | — |
| `record_drawer_layouts_insert_by_org_role` | INSERT | {authenticated} | — |
| `record_drawer_layouts_select_by_org_role` | SELECT | {authenticated} | — |
| `record_drawer_layouts_update_by_org_role` | UPDATE | {authenticated} | — |
| `service role full access record_drawer_layouts` | ALL | {service_role} | — |

### `record_layouts`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `record_layouts_all_service_role` | ALL | {service_role} | — |
| `record_layouts_select_authenticated` | SELECT | {authenticated} | — |

### `record_overview_layouts`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `record_overview_layouts_delete_by_org_role` | DELETE | {authenticated} | — |
| `record_overview_layouts_insert_by_org_role` | INSERT | {authenticated} | — |
| `record_overview_layouts_select_by_org_role` | SELECT | {authenticated} | — |
| `record_overview_layouts_update_by_org_role` | UPDATE | {authenticated} | — |
| `service role full access record_overview_layouts` | ALL | {service_role} | — |

### `recurrence_plans`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `role_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `role_definitions_modify_admin_ops` | ALL | {public} | — |
| `role_definitions_select_org_members` | SELECT | {public} | — |
| `role_definitions_service_role_all` | ALL | {public} | — |

### `role_permission_grants`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `role_permission_grants_modify_admin_ops` | ALL | {authenticated} | — |
| `role_permission_grants_select_org_members` | SELECT | {authenticated} | — |
| `role_permission_grants_service_role_all` | ALL | {public} | — |

### `schedule_statuses`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `schedule_tags`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `schedules`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `service_offerings`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `service_offerings_delete_org` | DELETE | {authenticated} | — |
| `service_offerings_insert_org` | INSERT | {authenticated} | — |
| `service_offerings_select_org` | SELECT | {authenticated} | — |
| `service_offerings_update_org` | UPDATE | {authenticated} | — |

### `service_plan_templates`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `service_plan_templates_delete_org` | DELETE | {authenticated} | — |
| `service_plan_templates_insert_org` | INSERT | {authenticated} | — |
| `service_plan_templates_select_org` | SELECT | {authenticated} | — |
| `service_plan_templates_update_org` | UPDATE | {authenticated} | — |

### `service_price_dimensions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `service_price_dimensions_delete_org` | DELETE | {authenticated} | — |
| `service_price_dimensions_insert_org` | INSERT | {authenticated} | — |
| `service_price_dimensions_select_org` | SELECT | {authenticated} | — |
| `service_price_dimensions_update_org` | UPDATE | {authenticated} | — |

### `service_pricing_rules`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `service_pricing_rules_delete_org` | DELETE | {authenticated} | — |
| `service_pricing_rules_insert_org` | INSERT | {authenticated} | — |
| `service_pricing_rules_select_org` | SELECT | {authenticated} | — |
| `service_pricing_rules_update_org` | UPDATE | {authenticated} | — |

### `sqft_bands`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `status_definitions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `status_definitions_modify_admin_only` | ALL | {authenticated} | — |
| `status_definitions_select_org_members` | SELECT | {authenticated} | — |
| `status_definitions_service_role_all` | ALL | {public} | — |

### `status_transition_rules`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `status_transition_rules_all_service_role` | ALL | {service_role} | — |
| `status_transition_rules_select_authenticated` | SELECT | {authenticated} | — |

### `tags`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `task_assist_proposals`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `task_assist_proposals_insert_crm` | INSERT | {authenticated} | — |
| `task_assist_proposals_select_org` | SELECT | {authenticated} | — |
| `task_assist_proposals_service_all` | ALL | {authenticated} | — |
| `task_assist_proposals_update_crm` | UPDATE | {authenticated} | — |

### `tour_availability_rules`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `tour_availability_rules_all_service_role` | ALL | {service_role} | — |
| `tour_availability_rules_delete_by_org_role` | DELETE | {authenticated} | — |
| `tour_availability_rules_insert_by_org_role` | INSERT | {authenticated} | — |
| `tour_availability_rules_select_by_org_role` | SELECT | {authenticated} | — |
| `tour_availability_rules_update_by_org_role` | UPDATE | {authenticated} | — |

### `tour_bookings`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `tour_bookings_all_service_role` | ALL | {service_role} | — |
| `tour_bookings_delete_by_org_role` | DELETE | {authenticated} | — |
| `tour_bookings_insert_by_org_role` | INSERT | {authenticated} | — |
| `tour_bookings_select_by_org_role` | SELECT | {authenticated} | — |
| `tour_bookings_update_by_org_role` | UPDATE | {authenticated} | — |

### `tour_public_booking_links`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `tour_public_booking_links_all_service_role` | ALL | {service_role} | — |
| `tour_public_booking_links_delete_by_org_role` | DELETE | {authenticated} | — |
| `tour_public_booking_links_insert_by_org_role` | INSERT | {authenticated} | — |
| `tour_public_booking_links_select_by_org_role` | SELECT | {authenticated} | — |
| `tour_public_booking_links_update_by_org_role` | UPDATE | {authenticated} | — |

### `user_access_profiles`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `user_access_profiles_all_service_role` | ALL | {service_role} | — |

### `user_department_access`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `user_department_access_all_service_role` | ALL | {service_role} | — |

### `user_profiles`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `profiles_insert_none` | INSERT | {authenticated} | — |
| `profiles_select_own` | SELECT | {authenticated} | — |
| `profiles_update_none` | UPDATE | {authenticated} | — |

### `user_roles`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `user_roles_select_org_admin` | SELECT | {authenticated} | — |
| `user_roles_write_org_owner` | ALL | {authenticated} | — |

### `user_site_access`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `user_site_access_all_service_role` | ALL | {service_role} | — |

### `vendor_statuses`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `vendor_statuses_select_authenticated` | SELECT | {authenticated} | — |

### `vendor_tags`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `vendor_users`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `vendor_verticals`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `vendor_verticals_select_org_admin` | SELECT | {authenticated} | — |
| `vendor_verticals_write_org_admin` | ALL | {authenticated} | — |

### `vendors`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |
| `vendors_delete_org_admin` | DELETE | {authenticated} | — |
| `vendors_select_org_admin` | SELECT | {authenticated} | — |
| `vendors_update_org_admin` | UPDATE | {authenticated} | — |
| `vendors_write_org_admin` | INSERT | {authenticated} | — |

### `verticals`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_ops_full_access` | ALL | {public} | — |

### `work_units`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `service role full access work_units` | ALL | {service_role} | — |
| `work_units_delete_same_org` | DELETE | {authenticated} | — |
| `work_units_insert_same_org` | INSERT | {authenticated} | — |
| `work_units_select_same_org` | SELECT | {authenticated} | — |
| `work_units_update_same_org` | UPDATE | {authenticated} | — |

### `workflow_action_runs`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `workflow_action_runs_delete_service_role` | DELETE | {authenticated} | — |
| `workflow_action_runs_insert_service_role` | INSERT | {authenticated} | — |
| `workflow_action_runs_select_org_members` | SELECT | {authenticated} | — |
| `workflow_action_runs_update_service_role` | UPDATE | {authenticated} | — |

### `workflow_actions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_full_access_workflow_actions` | ALL | {public} | — |

### `workflow_conditions`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_full_access_workflow_conditions` | ALL | {public} | — |

### `workflow_events`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `workflow_events_select` | SELECT | {authenticated} | — |
| `workflow_events_select_org` | SELECT | {authenticated} | — |

### `workflow_runs`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `workflow_runs_modify` | ALL | {authenticated} | — |
| `workflow_runs_select` | SELECT | {authenticated} | — |

### `workflows`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `admin_full_access_workflows` | ALL | {public} | — |

### `workspace_kpi_placement`

| Policy | Command | Roles | USING / WITH CHECK (truncated) |
|--------|---------|-------|--------------------------------|
| `workspace_kpi_placement_all_service_role` | ALL | {service_role} | — |
| `workspace_kpi_placement_select_authenticated` | SELECT | {authenticated} | — |


## Living audit

See `docs/audits/supabase-schema-alignment-audit.md` for risk classification and migration proposals.
