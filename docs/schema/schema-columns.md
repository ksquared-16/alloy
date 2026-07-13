# Schema — columns

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** 2026-07-13 · **Column count:** 3098

Columns for `public` schema tables, grouped alphabetically by table.

## `access_methods`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `action_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | YES | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `entity_type` | text | YES | — |
| `action_type` | text | NO | — |
| `icon` | text | YES | — |
| `style` | text | YES | — |
| `priority` | integer | NO | 100 |
| `required_permissions` | jsonb | NO | '{}'::jsonb |
| `condition_config` | jsonb | NO | '{}'::jsonb |
| `payload_schema` | jsonb | NO | '{}'::jsonb |
| `workflow_id` | uuid | YES | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `metadata` | jsonb | NO | '{}'::jsonb |

## `action_links`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `action_type` | text | NO | — |
| `entity_type` | text | NO | — |
| `entity_id` | uuid | NO | — |
| `token` | text | NO | — |
| `expires_at` | timestamp with time zone | YES | (now() + '02:00:00'::interval) |
| `consumed_at` | timestamp with time zone | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `short_code` | text | YES | — |

## `action_placements`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | YES | — |
| `action_definition_id` | uuid | NO | — |
| `surface` | text | NO | — |
| `slot` | text | NO | — |
| `entity_type` | text | YES | — |
| `department_id` | uuid | YES | — |
| `work_unit_id` | uuid | YES | — |
| `order_index` | integer | NO | 100 |
| `display_style` | text | NO | 'button'::text |
| `condition_config` | jsonb | NO | '{}'::jsonb |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `section_key` | text | YES | — |

## `activity_log`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `entity_type` | text | NO | — |
| `entity_id` | uuid | NO | — |
| `action` | text | NO | — |
| `actor_type` | text | YES | — |
| `actor_id` | uuid | YES | — |
| `summary` | text | YES | — |
| `diff` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |

## `addon_frequencies`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `addon_types`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `vertical_id` | uuid | NO | — |

## `agent_v0_apply_audit`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `result_id` | uuid | NO | — |
| `proposal_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `user_id` | uuid | NO | — |
| `work_unit_id` | uuid | NO | — |
| `terminal_status` | text | NO | — |
| `applied_queue_definition_version` | integer | NO | 0 |
| `created_at` | timestamp with time zone | NO | now() |

## `agent_v0_proposals`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `proposal_id` | uuid | NO | — |
| `request_id` | uuid | NO | — |
| `correlation_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `user_id` | uuid | NO | — |
| `work_unit_id` | uuid | NO | — |
| `intent_json` | jsonb | NO | — |
| `before_hash` | text | NO | — |
| `after_hash` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `agent_v1_record_layout_apply_audit`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `result_id` | uuid | NO | — |
| `proposal_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `user_id` | uuid | NO | — |
| `record_overview_layout_id` | uuid | NO | — |
| `terminal_status` | text | NO | — |
| `applied_config_version` | integer | NO | 0 |
| `created_at` | timestamp with time zone | NO | now() |

## `agent_v1_record_layout_proposals`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `proposal_id` | uuid | NO | — |
| `request_id` | uuid | NO | — |
| `correlation_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `user_id` | uuid | NO | — |
| `record_overview_layout_id` | uuid | NO | — |
| `intent_json` | jsonb | NO | — |
| `before_hash` | text | NO | — |
| `after_hash` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `agent_v2_field_visibility_apply_audit`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `result_id` | uuid | NO | — |
| `proposal_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `user_id` | uuid | NO | — |
| `field_definition_id` | uuid | NO | — |
| `terminal_status` | text | NO | — |
| `applied_updated_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | now() |

## `agent_v2_field_visibility_proposals`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `proposal_id` | uuid | NO | — |
| `request_id` | uuid | NO | — |
| `correlation_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `user_id` | uuid | NO | — |
| `field_definition_id` | uuid | NO | — |
| `intent_json` | jsonb | NO | — |
| `before_hash` | text | NO | — |
| `after_hash` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `announcement_deliveries`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `announcement_id` | uuid | NO | — |
| `person_id` | uuid | YES | — |
| `message_id` | uuid | YES | — |
| `status` | text | YES | — |
| `delivered_at` | timestamp with time zone | YES | — |
| `opened_at` | timestamp with time zone | YES | — |
| `clicked_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `metadata` | jsonb | NO | '{}'::jsonb |

## `announcement_recipients`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `announcement_id` | uuid | NO | — |
| `person_id` | uuid | YES | — |
| `channel` | text | NO | — |
| `address` | text | YES | — |
| `consent_state` | text | YES | — |
| `suppressed_reason` | text | YES | — |
| `status` | text | NO | 'pending'::text |
| `communication_message_id` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `communication_scheduled_send_id` | uuid | YES | — |

## `announcement_targets`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `announcement_id` | uuid | NO | — |
| `target_spec` | jsonb | NO | '{}'::jsonb |
| `resolved_count` | integer | YES | — |
| `created_at` | timestamp with time zone | NO | now() |

## `announcements`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `title` | text | NO | — |
| `channel_set` | jsonb | NO | '[]'::jsonb |
| `classification` | text | YES | — |
| `status` | text | NO | 'draft'::text |
| `template_id` | uuid | YES | — |
| `subject` | text | YES | — |
| `body` | text | YES | — |
| `scheduled_at` | timestamp with time zone | YES | — |
| `created_by_user_id` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `created_by` | uuid | YES | — |
| `channels` | ARRAY | NO | '{}'::text[] |
| `body_format` | text | NO | 'text'::text |
| `send_at` | timestamp with time zone | YES | — |
| `sent_at` | timestamp with time zone | YES | — |
| `archived_at` | timestamp with time zone | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |

## `app_users`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | — |
| `role` | text | NO | — |
| `vendor_id` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | YES | — |
| `auth_user_id` | uuid | YES | — |

## `assignment_statuses`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `assignments`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `job_id` | uuid | NO | — |
| `schedule_id` | uuid | YES | — |
| `vendor_id` | uuid | NO | — |
| `vendor_user_id` | uuid | YES | — |
| `assignment_status_id` | uuid | YES | — |
| `offered_at` | timestamp with time zone | YES | — |
| `respond_by` | timestamp with time zone | YES | — |
| `accepted_at` | timestamp with time zone | YES | — |
| `assigned_worker_at` | timestamp with time zone | YES | — |
| `payout_percent` | numeric | YES | — |
| `payout_amount_cents` | integer | YES | — |
| `external_contractor_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |
| `status_key` | text | YES | — |

## `business_process_layout_assignments`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `business_process_key` | text | NO | — |
| `stage_key` | text | YES | — |
| `status_key` | text | YES | — |
| `surface_key` | text | NO | — |
| `entity_type` | text | NO | — |
| `surface` | text | NO | — |
| `layout_key` | text | NO | — |
| `entity_layout_id` | uuid | YES | — |
| `priority` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `version` | integer | NO | 1 |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `campaigns`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `name` | text | NO | — |
| `channel` | text | YES | — |
| `status` | text | NO | 'active'::text |
| `starts_at` | date | YES | — |
| `ends_at` | date | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `charge_line_items`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `charge_id` | uuid | NO | — |
| `job_line_item_id` | uuid | YES | — |
| `description_snapshot` | text | YES | — |
| `amount_cents` | bigint | NO | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |

## `charges`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `job_id` | uuid | YES | — |
| `schedule_id` | uuid | YES | — |
| `subscription_id` | uuid | YES | — |
| `source_charge_id` | uuid | YES | — |
| `charge_type` | text | NO | — |
| `status` | text | NO | — |
| `currency_code` | text | NO | — |
| `amount_cents` | bigint | NO | — |
| `service_date` | date | YES | — |
| `due_date` | date | YES | — |
| `posted_at` | timestamp with time zone | YES | — |
| `voided_at` | timestamp with time zone | YES | — |
| `description` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `charge_category` | text | YES | — |
| `billable_source_type` | text | YES | — |
| `billable_source_id` | uuid | YES | — |
| `occurs_on` | date | YES | — |
| `billable_on` | date | YES | — |
| `charge_template_id` | uuid | YES | — |
| `service_id` | uuid | YES | — |

## `child_attendance_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `enrollment_agreement_id` | uuid | NO | — |
| `customer_member_id` | uuid | NO | — |
| `site_location_id` | uuid | NO | — |
| `event_kind` | text | NO | — |
| `entry_type` | text | NO | 'original'::text |
| `corrects_event_id` | uuid | YES | — |
| `event_at` | timestamp with time zone | NO | — |
| `service_date` | date | NO | — |
| `room_location_id` | uuid | YES | — |
| `from_room_location_id` | uuid | YES | — |
| `to_room_location_id` | uuid | YES | — |
| `actor_type` | text | NO | — |
| `actor_user_id` | uuid | YES | — |
| `actor_person_id` | uuid | YES | — |
| `actor_label` | text | YES | — |
| `source_type` | text | NO | 'operator_action'::text |
| `source_key` | text | NO | 'operator_action'::text |
| `reason_key` | text | YES | — |
| `note` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |

## `child_enrollment_agreements`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `opportunity_id` | uuid | YES | — |
| `opportunity_customer_member_id` | uuid | YES | — |
| `customer_member_id` | uuid | NO | — |
| `customer_id` | uuid | YES | — |
| `person_id` | uuid | YES | — |
| `site_location_id` | uuid | NO | — |
| `status` | text | NO | — |
| `start_date` | date | YES | — |
| `end_date` | date | YES | — |
| `activation_policy_key` | text | YES | — |
| `source_key` | text | NO | 'manual'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `child_placements`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `enrollment_agreement_id` | uuid | NO | — |
| `customer_member_id` | uuid | NO | — |
| `site_location_id` | uuid | NO | — |
| `program_category_id` | uuid | YES | — |
| `room_location_id` | uuid | YES | — |
| `start_date` | date | NO | — |
| `end_date` | date | YES | — |
| `status` | text | NO | — |
| `reason_key` | text | YES | — |
| `source_key` | text | NO | 'operator'::text |
| `supersedes_placement_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `childcare_capacity_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `scope_type` | text | NO | — |
| `site_location_id` | uuid | YES | — |
| `program_category_id` | uuid | YES | — |
| `room_location_id` | uuid | YES | — |
| `age_group_key` | text | YES | — |
| `capacity_kind` | text | NO | — |
| `capacity` | integer | NO | — |
| `effective_start` | date | NO | — |
| `effective_end` | date | YES | — |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `childcare_operating_windows`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `scope_type` | text | NO | — |
| `site_location_id` | uuid | YES | — |
| `program_category_id` | uuid | YES | — |
| `room_location_id` | uuid | YES | — |
| `weekday` | smallint | NO | — |
| `open_time` | time without time zone | NO | — |
| `close_time` | time without time zone | NO | — |
| `effective_start` | date | NO | — |
| `effective_end` | date | YES | — |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `childcare_rate_plans`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `scope_type` | text | NO | — |
| `site_location_id` | uuid | YES | — |
| `program_category_id` | uuid | YES | — |
| `room_location_id` | uuid | YES | — |
| `age_group_key` | text | YES | — |
| `plan_key` | text | NO | — |
| `label` | text | YES | — |
| `currency_code` | text | NO | 'USD'::text |
| `billing_basis` | text | NO | — |
| `calculation_strategy` | text | NO | 'scheduled'::text |
| `proration_method` | text | YES | — |
| `billing_cadence` | text | YES | — |
| `is_active` | boolean | NO | true |
| `effective_start` | date | NO | — |
| `effective_end` | date | YES | — |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `service_id` | uuid | YES | — |

## `childcare_rate_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `rate_plan_id` | uuid | NO | — |
| `schedule_basis` | text | NO | — |
| `rate_basis` | text | NO | — |
| `age_group_key` | text | YES | — |
| `amount_cents` | bigint | NO | — |
| `effective_start` | date | NO | — |
| `effective_end` | date | YES | — |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `childcare_ratio_rule_tiers`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `ratio_rule_id` | uuid | NO | — |
| `max_children` | integer | NO | — |
| `required_staff` | integer | NO | — |
| `sort_order` | integer | NO | 100 |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `childcare_ratio_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `scope_type` | text | NO | — |
| `site_location_id` | uuid | YES | — |
| `program_category_id` | uuid | YES | — |
| `room_location_id` | uuid | YES | — |
| `age_group_key` | text | YES | — |
| `jurisdiction_key` | text | YES | — |
| `effective_start` | date | NO | — |
| `effective_end` | date | YES | — |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `childcare_schedule_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `scope_type` | text | NO | — |
| `site_location_id` | uuid | YES | — |
| `program_category_id` | uuid | YES | — |
| `room_location_id` | uuid | YES | — |
| `age_group_key` | text | YES | — |
| `eligible_schedule_type_keys` | ARRAY | YES | — |
| `eligible_age_group_keys` | ARRAY | YES | — |
| `min_days_per_week` | smallint | YES | — |
| `max_days_per_week` | smallint | YES | — |
| `effective_start` | date | NO | — |
| `effective_end` | date | YES | — |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `cleaning_job_addons`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `job_id` | uuid | NO | — |
| `addon_type_id` | uuid | NO | — |

## `cleaning_job_details`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `job_id` | uuid | NO | — |
| `service_type_id` | uuid | YES | — |
| `square_footage` | integer | YES | — |
| `addon_frequency_id` | uuid | YES | — |
| `preferred_service_date` | date | YES | — |
| `special_instructions` | text | YES | — |
| `estimate_photos` | text | YES | — |
| `access_notes` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `beds` | numeric | YES | — |
| `baths` | numeric | YES | — |
| `home_type_key` | text | YES | — |
| `access_method_key` | text | YES | — |
| `square_footage_tier_key` | text | YES | — |

## `cleaning_service_types`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `commercial_addons`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | YES | — |
| `program_key` | text | YES | — |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `addon_type` | text | NO | — |
| `amount_cents` | integer | NO | — |
| `cadence_key` | text | NO | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `effective_start` | date | YES | — |
| `effective_end` | date | YES | — |
| `revenue_category` | text | YES | — |
| `package_unit_count` | integer | YES | — |
| `package_unit_type` | text | YES | — |
| `package_expires_days` | integer | YES | — |

## `commercial_categories`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `sort_order` | integer | NO | 100 |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `commercial_deposits`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | YES | — |
| `program_key` | text | YES | — |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `amount_cents` | integer | NO | — |
| `is_refundable` | boolean | NO | true |
| `apply_to_balance` | boolean | NO | false |
| `due_timing` | text | NO | 'at_enrollment'::text |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `effective_start` | date | YES | — |
| `effective_end` | date | YES | — |
| `revenue_category` | text | YES | — |

## `commercial_fees`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | YES | — |
| `program_key` | text | YES | — |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `fee_type` | text | NO | — |
| `amount_cents` | integer | NO | — |
| `is_required` | boolean | NO | true |
| `cadence_key` | text | YES | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `effective_start` | date | YES | — |
| `effective_end` | date | YES | — |
| `revenue_category` | text | YES | — |

## `commercial_policies`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `scope_type` | text | NO | — |
| `location_id` | uuid | YES | — |
| `program_key` | text | YES | — |
| `offering_id` | uuid | YES | — |
| `variant_id` | uuid | YES | — |
| `policy_type` | text | NO | — |
| `label` | text | YES | — |
| `description` | text | YES | — |
| `value` | jsonb | NO | '{}'::jsonb |
| `effective_start` | date | NO | '2000-01-01'::date |
| `effective_end` | date | YES | — |
| `is_active` | boolean | NO | true |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `commercial_products`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | YES | — |
| `program_key` | text | YES | — |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `commercial_type` | text | NO | — |
| `category_id` | uuid | YES | — |
| `amount_cents` | integer | NO | — |
| `cadence_key` | text | YES | — |
| `revenue_category` | text | YES | — |
| `effective_start` | date | YES | — |
| `effective_end` | date | YES | — |
| `behavior` | jsonb | NO | '{}'::jsonb |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `source_table` | text | YES | — |
| `source_id` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `revenue_category_id` | uuid | YES | — |

## `commercial_revenue_categories`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `label` | text | NO | — |
| `gl_code` | text | YES | — |
| `sort_order` | integer | NO | 100 |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `mapped_gl_account_id` | uuid | YES | — |

## `commercial_tuition_rates`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | YES | — |
| `rate_cents` | integer | NO | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `not_offered` | boolean | NO | false |
| `cadence_key` | text | NO | — |
| `payer_type` | text | NO | 'private_pay'::text |
| `variant_id` | uuid | NO | — |
| `effective_start` | date | YES | — |
| `effective_end` | date | YES | — |
| `revenue_category_id` | uuid | YES | — |

## `communication_delivery_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `message_id` | uuid | NO | — |
| `event_type` | text | NO | — |
| `provider` | text | YES | — |
| `occurred_at` | timestamp with time zone | NO | now() |
| `payload` | jsonb | NO | '{}'::jsonb |
| `recipient_id` | uuid | YES | — |
| `channel` | text | YES | — |
| `provider_message_id` | text | YES | — |
| `provider_event_id` | text | YES | — |
| `event_status` | text | YES | — |
| `received_at` | timestamp with time zone | NO | now() |
| `raw_payload` | jsonb | NO | '{}'::jsonb |
| `metadata` | jsonb | NO | '{}'::jsonb |

## `communication_identities`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `provider_account_id` | uuid | NO | — |
| `channel` | text | NO | — |
| `identity_type` | text | NO | — |
| `canonical_address` | text | NO | — |
| `normalized_address` | text | NO | — |
| `display_name` | text | YES | — |
| `inbound_enabled` | boolean | NO | true |
| `outbound_enabled` | boolean | NO | true |
| `verification_state` | text | NO | 'unverified'::text |
| `status` | text | NO | 'active'::text |
| `health_status` | text | NO | 'unknown'::text |
| `capabilities` | jsonb | NO | '{}'::jsonb |
| `provider_resource_ref` | text | YES | — |
| `scope` | text | NO | 'tenant'::text |
| `is_default_for_scope` | boolean | NO | false |
| `legacy_binding_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `communication_identity_grants`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `identity_id` | uuid | NO | — |
| `user_id` | uuid | NO | — |
| `can_send` | boolean | NO | false |
| `can_receive` | boolean | NO | false |
| `can_configure` | boolean | NO | false |
| `can_manage` | boolean | NO | false |
| `can_override_default` | boolean | NO | false |
| `can_use_across_locations` | boolean | NO | false |
| `status` | text | NO | 'active'::text |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `communication_identity_location_bindings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `identity_id` | uuid | NO | — |
| `location_id` | uuid | NO | — |
| `channel` | text | NO | — |
| `priority` | integer | NO | 100 |
| `is_default` | boolean | NO | false |
| `inbound_routing_enabled` | boolean | NO | true |
| `outbound_sending_enabled` | boolean | NO | true |
| `status` | text | NO | 'active'::text |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `communication_message_reads`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `org_id` | uuid | NO | — |
| `message_id` | uuid | NO | — |
| `user_id` | uuid | NO | — |
| `read_at` | timestamp with time zone | NO | now() |

## `communication_message_recipients`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `message_id` | uuid | NO | — |
| `person_id` | uuid | YES | — |
| `address` | text | YES | — |
| `recipient_role` | text | NO | 'to'::text |
| `status` | text | YES | — |
| `delivered_at` | timestamp with time zone | YES | — |
| `opened_at` | timestamp with time zone | YES | — |
| `clicked_at` | timestamp with time zone | YES | — |
| `replied_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `recipient_key` | text | YES | — |
| `channel` | text | YES | — |
| `provider` | text | YES | — |
| `provider_message_id` | text | YES | — |
| `queued_at` | timestamp with time zone | YES | — |
| `sent_at` | timestamp with time zone | YES | — |
| `bounced_at` | timestamp with time zone | YES | — |
| `complained_at` | timestamp with time zone | YES | — |
| `failed_at` | timestamp with time zone | YES | — |
| `last_event_at` | timestamp with time zone | YES | — |

## `communication_messages`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `thread_id` | uuid | NO | — |
| `channel` | text | NO | — |
| `direction` | text | NO | — |
| `status` | text | NO | 'queued'::text |
| `body` | text | YES | — |
| `body_format` | text | NO | 'plain'::text |
| `from_address` | text | YES | — |
| `to_address` | text | YES | — |
| `provider` | text | YES | — |
| `provider_message_id` | text | YES | — |
| `error` | text | YES | — |
| `workflow_run_id` | uuid | YES | — |
| `communication_provider_binding_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `sent_at` | timestamp with time zone | YES | — |
| `delivered_at` | timestamp with time zone | YES | — |
| `subject` | text | YES | — |
| `opened_at` | timestamp with time zone | YES | — |
| `clicked_at` | timestamp with time zone | YES | — |
| `replied_at` | timestamp with time zone | YES | — |
| `communication_identity_id` | uuid | YES | — |
| `communication_provider_account_id` | uuid | YES | — |

## `communication_preference_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `person_id` | uuid | NO | — |
| `category` | text | NO | — |
| `from_state` | text | YES | — |
| `to_state` | text | NO | — |
| `source` | text | YES | — |
| `method` | text | YES | — |
| `actor_user_id` | uuid | YES | — |
| `occurred_at` | timestamp with time zone | NO | now() |
| `metadata` | jsonb | NO | '{}'::jsonb |

## `communication_preferences`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `person_id` | uuid | NO | — |
| `category` | text | NO | — |
| `state` | text | NO | 'unset'::text |
| `source` | text | YES | — |
| `method` | text | YES | — |
| `updated_by_user_id` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `communication_provider_accounts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `provider_type` | text | NO | — |
| `display_label` | text | YES | — |
| `status` | text | NO | 'active'::text |
| `verification_state` | text | NO | 'unverified'::text |
| `health_status` | text | NO | 'unknown'::text |
| `secret_ref` | text | NO | 'unconfigured'::text |
| `capabilities` | jsonb | NO | '{}'::jsonb |
| `config` | jsonb | NO | '{}'::jsonb |
| `provider_account_ref` | text | YES | — |
| `legacy_binding_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `communication_provider_bindings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `channel` | text | NO | — |
| `provider` | text | NO | — |
| `scope` | text | NO | 'org'::text |
| `location_id` | uuid | YES | — |
| `user_id` | uuid | YES | — |
| `inbound_to_e164` | text | YES | — |
| `display_label` | text | YES | — |
| `status` | text | NO | 'active'::text |
| `is_primary` | boolean | NO | false |
| `config` | jsonb | NO | '{}'::jsonb |
| `secret_ref` | text | NO | 'unconfigured'::text |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `communication_scheduled_sends`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `created_by` | uuid | NO | — |
| `proposal_id` | uuid | YES | — |
| `entity_type` | text | NO | 'opportunities'::text |
| `entity_id` | uuid | YES | — |
| `recipient_person_id` | uuid | NO | — |
| `channel` | text | NO | — |
| `subject_snapshot` | text | YES | — |
| `body_snapshot` | text | NO | — |
| `communication_provider_binding_id` | uuid | YES | — |
| `scheduled_for` | timestamp with time zone | NO | — |
| `status` | text | NO | 'pending'::text |
| `approved_at` | timestamp with time zone | NO | — |
| `approved_by` | uuid | NO | — |
| `communication_message_id` | uuid | YES | — |
| `source` | text | NO | 'task_assist'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `claimed_at` | timestamp with time zone | YES | — |
| `claim_token` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `announcement_id` | uuid | YES | — |

## `communication_snippets`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `name` | text | NO | — |
| `body` | text | NO | — |
| `category` | text | YES | — |
| `created_by_user_id` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `communication_template_versions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `template_id` | uuid | NO | — |
| `version` | integer | NO | — |
| `subject` | text | YES | — |
| `body` | text | YES | — |
| `body_format` | text | NO | 'html'::text |
| `variables` | jsonb | NO | '[]'::jsonb |
| `created_by_user_id` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `version_number` | integer | YES | — |
| `token_paths` | ARRAY | NO | '{}'::text[] |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |

## `communication_templates`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `name` | text | NO | — |
| `channel` | text | NO | — |
| `category` | text | YES | 'general'::text |
| `approval_status` | text | NO | 'draft'::text |
| `current_version_id` | uuid | YES | — |
| `created_by_user_id` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `description` | text | YES | — |
| `status` | text | YES | 'draft'::text |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |

## `communication_threads`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `primary_entity_type` | text | NO | — |
| `primary_entity_id` | uuid | NO | — |
| `channel` | text | NO | — |
| `recipient_key` | text | NO | ''::text |
| `location_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `archived_at` | timestamp with time zone | YES | — |
| `last_message_at` | timestamp with time zone | YES | — |
| `assigned_user_id` | uuid | YES | — |
| `assigned_team_id` | uuid | YES | — |
| `assignment_state` | text | NO | 'unassigned'::text |
| `attention_state` | text | YES | — |
| `first_response_at` | timestamp with time zone | YES | — |
| `sla_due_at` | timestamp with time zone | YES | — |
| `sla_state` | text | YES | — |
| `last_read_at` | timestamp with time zone | YES | — |

## `config_layout_assist_proposals`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `proposal_version` | integer | NO | 1 |
| `proposal_json` | jsonb | NO | — |
| `proposal_hash` | text | NO | — |
| `state` | text | NO | 'draft'::text |
| `category` | text | NO | — |
| `summary` | text | NO | — |
| `risk_level` | text | NO | — |
| `apply_mode` | text | NO | — |
| `permission_requirements` | ARRAY | NO | '{}'::text[] |
| `created_by` | uuid | YES | — |
| `reviewed_by` | uuid | YES | — |
| `approved_by` | uuid | YES | — |
| `applied_by` | uuid | YES | — |
| `rejected_by` | uuid | YES | — |
| `failed_reason` | text | YES | — |
| `rejection_reason` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `reviewed_at` | timestamp with time zone | YES | — |
| `approved_at` | timestamp with time zone | YES | — |
| `applied_at` | timestamp with time zone | YES | — |
| `rejected_at` | timestamp with time zone | YES | — |
| `failed_at` | timestamp with time zone | YES | — |
| `rolled_back_at` | timestamp with time zone | YES | — |

## `consumption_event_types`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | YES | — |
| `event_key` | text | NO | — |
| `label` | text | NO | — |
| `source_family` | text | NO | — |
| `description` | text | YES | — |
| `charge_template_key` | text | YES | — |
| `default_responsibility_key` | text | YES | — |
| `is_active` | boolean | NO | true |
| `effective_start` | date | NO | '2000-01-01'::date |
| `effective_end` | date | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `consumption_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | YES | — |
| `event_type_id` | uuid | YES | — |
| `source_family` | text | NO | — |
| `event_key` | text | NO | — |
| `source_entity_type` | text | NO | — |
| `source_entity_id` | uuid | NO | — |
| `subject_type` | text | YES | — |
| `subject_id` | uuid | YES | — |
| `occurs_on` | date | NO | — |
| `effective_on` | date | YES | — |
| `status` | text | NO | 'recorded'::text |
| `context` | jsonb | NO | '{}'::jsonb |
| `idempotency_key` | text | NO | — |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `corrects_event_id` | uuid | YES | — |

## `contact_tags`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `contact_id` | uuid | NO | — |
| `tag_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `contacts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `customer_id` | uuid | YES | — |
| `first_name` | text | YES | — |
| `last_name` | text | YES | — |
| `email` | text | YES | — |
| `phone` | text | YES | — |
| `company_name` | text | YES | — |
| `website` | text | YES | — |
| `timezone` | text | YES | — |
| `date_of_birth` | date | YES | — |
| `source` | text | YES | — |
| `contact_type` | text | YES | — |
| `status` | text | NO | 'active'::text |
| `notes` | text | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |
| `address_line1` | text | YES | — |
| `address_line2` | text | YES | — |
| `city` | text | YES | — |
| `state` | text | YES | — |
| `postal_code` | text | YES | — |
| `country` | text | YES | — |
| `address_source` | text | YES | — |
| `vendor_id` | uuid | YES | — |
| `vendor_contact_role` | text | YES | — |
| `archived_at` | timestamp with time zone | YES | — |
| `archived_by` | uuid | YES | — |
| `status_key` | text | YES | — |
| `person_id` | uuid | YES | — |

## `conversation_assignment_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `thread_id` | uuid | NO | — |
| `action` | text | NO | — |
| `from_user_id` | uuid | YES | — |
| `to_user_id` | uuid | YES | — |
| `to_team_id` | uuid | YES | — |
| `actor_user_id` | uuid | YES | — |
| `occurred_at` | timestamp with time zone | NO | now() |
| `metadata` | jsonb | NO | '{}'::jsonb |

## `customer_member_contact_roles`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `role_key` | text | NO | — |
| `role_label` | text | NO | — |
| `sort_order` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `customer_member_contacts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `customer_id` | uuid | NO | — |
| `customer_member_id` | uuid | NO | — |
| `contact_id` | uuid | NO | — |
| `role_key` | text | NO | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `customer_member_relationship_types`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `sort_order` | integer | NO | 100 |
| `is_system` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `customer_members`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `customer_id` | uuid | NO | — |
| `display_name` | text | NO | — |
| `relationship` | text | YES | — |
| `first_name` | text | YES | — |
| `last_name` | text | YES | — |
| `dob` | date | YES | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `status_key` | text | YES | — |
| `person_id` | uuid | YES | — |

## `customer_payment_methods`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `customer_id` | uuid | NO | — |
| `stripe_payment_method_id` | text | NO | — |
| `brand` | text | YES | — |
| `last4` | text | YES | — |
| `is_default` | boolean | NO | false |
| `created_at` | timestamp with time zone | NO | now() |

## `customer_person_role_types`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `sort_order` | integer | NO | 100 |
| `is_system` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `vertical_id` | uuid | YES | — |
| `industry_id` | uuid | YES | — |

## `customer_persons`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `customer_id` | uuid | NO | — |
| `person_id` | uuid | NO | — |
| `role_type` | text | NO | — |
| `is_primary` | boolean | NO | false |
| `status` | text | YES | — |
| `start_date` | date | YES | — |
| `end_date` | date | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `customer_subscriptions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `customer_id` | uuid | NO | — |
| `primary_contact_id` | uuid | YES | — |
| `vertical_id` | uuid | YES | — |
| `status` | text | NO | 'active'::text |
| `start_date` | date | NO | — |
| `end_date` | date | YES | — |
| `cadence` | text | NO | — |
| `interval` | integer | NO | 1 |
| `preferred_weekdays` | ARRAY | YES | — |
| `preferred_time_start` | time without time zone | YES | — |
| `preferred_time_end` | time without time zone | YES | — |
| `notes` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `customer_tags`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `customer_id` | uuid | NO | — |
| `tag_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `customer_vertical_job_counters`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `customer_id` | uuid | NO | — |
| `vertical_id` | uuid | NO | — |
| `completed_count` | integer | NO | 0 |
| `updated_at` | timestamp with time zone | NO | now() |

## `customers`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | YES | — |
| `name` | text | NO | — |
| `customer_type` | text | YES | — |
| `stripe_customer_id` | text | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `primary_contact_id` | uuid | YES | — |
| `org_id` | uuid | NO | — |
| `default_payment_method_id` | text | YES | — |
| `payment_method_last4` | text | YES | — |
| `payment_method_brand` | text | YES | — |
| `setup_intent_id` | text | YES | — |
| `status_key` | text | YES | — |
| `customer_number` | bigint | NO | — |

## `departments`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `sort_order` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `discount_applications`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `discount_program_id` | uuid | NO | — |
| `customer_id` | uuid | YES | — |
| `opportunity_id` | uuid | YES | — |
| `job_id` | uuid | YES | — |
| `customer_subscription_id` | uuid | YES | — |
| `discount_commitment_id` | uuid | YES | — |
| `target_entity_type` | text | NO | — |
| `target_entity_id` | uuid | NO | — |
| `status` | text | NO | 'proposed'::text |
| `source` | text | NO | 'system'::text |
| `discount_amount_cents` | integer | NO | — |
| `currency_code` | text | NO | 'USD'::text |
| `calculation_snapshot` | jsonb | NO | '{}'::jsonb |
| `reversal_reason` | text | YES | — |
| `applied_at` | timestamp with time zone | NO | now() |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `legacy_discount_redemption_id` | uuid | YES | — |
| `legacy_discount_code_id` | uuid | YES | — |

## `discount_codes`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `code` | text | NO | — |
| `is_active` | boolean | NO | true |
| `discount_type` | text | NO | — |
| `discount_value` | numeric | NO | — |
| `applies_to_vertical_slug` | text | YES | — |
| `first_job_only` | boolean | NO | true |
| `starts_at` | timestamp with time zone | YES | — |
| `ends_at` | timestamp with time zone | YES | — |
| `ghl_tag` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `discount_commitments`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `discount_program_id` | uuid | NO | — |
| `customer_id` | uuid | NO | — |
| `customer_subscription_id` | uuid | YES | — |
| `status` | text | NO | 'pending'::text |
| `required_service_count` | integer | NO | — |
| `completed_service_count` | integer | NO | 0 |
| `window_start_at` | timestamp with time zone | NO | — |
| `window_end_at` | timestamp with time zone | NO | — |
| `breach_policy` | text | NO | 'none'::text |
| `granted_discount_application_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `discount_program_benefits`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `discount_program_id` | uuid | NO | — |
| `benefit_type` | text | NO | — |
| `applies_to` | text | NO | 'order'::text |
| `service_index` | integer | YES | — |
| `amount_cents` | integer | YES | — |
| `percent_basis_points` | integer | YES | — |
| `max_discount_cents` | integer | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `discount_program_commitment_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `discount_program_id` | uuid | NO | — |
| `enrollment_mode` | text | NO | 'automatic'::text |
| `commitment_start_mode` | text | NO | 'first_service_completed'::text |
| `benefit_grant_timing` | text | NO | 'upfront'::text |
| `required_service_count` | integer | NO | — |
| `timeframe_days` | integer | NO | — |
| `qualifying_service_status` | text | NO | 'completed'::text |
| `breach_policy` | text | NO | 'manual_review'::text |
| `max_redemptions_per_customer` | integer | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `discount_program_qualifiers`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `discount_program_id` | uuid | NO | — |
| `qualifier_type` | text | NO | — |
| `operator` | text | NO | 'eq'::text |
| `value_json` | jsonb | NO | '{}'::jsonb |
| `sort_order` | integer | NO | 1 |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `discount_programs`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `name` | text | NO | — |
| `code` | text | YES | — |
| `description` | text | YES | — |
| `status` | text | NO | 'draft'::text |
| `program_type` | text | NO | 'code'::text |
| `stacking_mode` | text | NO | 'exclusive'::text |
| `priority` | integer | NO | 100 |
| `valid_from` | timestamp with time zone | YES | — |
| `valid_to` | timestamp with time zone | YES | — |
| `max_total_uses` | integer | YES | — |
| `max_uses_per_customer` | integer | YES | — |
| `first_time_customer_only` | boolean | NO | false |
| `auto_apply` | boolean | NO | false |
| `applies_to_entity_type` | text | NO | 'job'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `legacy_discount_code_id` | uuid | YES | — |

## `discount_programs_admin_v`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | YES | — |
| `org_id` | uuid | YES | — |
| `name` | text | YES | — |
| `code` | text | YES | — |
| `description` | text | YES | — |
| `status` | text | YES | — |
| `program_type` | text | YES | — |
| `stacking_mode` | text | YES | — |
| `priority` | integer | YES | — |
| `valid_from` | timestamp with time zone | YES | — |
| `valid_to` | timestamp with time zone | YES | — |
| `first_time_customer_only` | boolean | YES | — |
| `auto_apply` | boolean | YES | — |
| `applies_to_entity_type` | text | YES | — |
| `legacy_discount_code_id` | uuid | YES | — |
| `is_legacy_migrated` | boolean | YES | — |
| `metadata` | jsonb | YES | — |
| `created_at` | timestamp with time zone | YES | — |
| `updated_at` | timestamp with time zone | YES | — |
| `primary_benefit_id` | uuid | YES | — |
| `primary_benefit_type` | text | YES | — |
| `primary_benefit_applies_to` | text | YES | — |
| `primary_benefit_service_index` | integer | YES | — |
| `primary_benefit_amount_cents` | integer | YES | — |
| `primary_benefit_percent_basis_points` | integer | YES | — |
| `primary_benefit_max_discount_cents` | integer | YES | — |
| `commitment_rule_id` | uuid | YES | — |
| `enrollment_mode` | text | YES | — |
| `commitment_start_mode` | text | YES | — |
| `benefit_grant_timing` | text | YES | — |
| `required_service_count` | integer | YES | — |
| `timeframe_days` | integer | YES | — |
| `qualifying_service_status` | text | YES | — |
| `breach_policy` | text | YES | — |
| `max_redemptions_per_customer` | integer | YES | — |
| `qualifiers` | jsonb | YES | — |
| `benefits` | jsonb | YES | — |

## `discount_redemptions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `discount_code_id` | uuid | YES | — |
| `discount_code` | text | NO | — |
| `contact_id` | uuid | YES | — |
| `opportunity_id` | uuid | YES | — |
| `job_id` | uuid | YES | — |
| `quote_subtotal` | numeric | YES | — |
| `discount_amount` | numeric | YES | — |
| `quote_total` | numeric | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `customer_id` | uuid | YES | — |
| `booking_attempt_id` | uuid | YES | — |
| `discount_program_id` | uuid | YES | — |

## `discounts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `campaign_id` | uuid | YES | — |
| `code` | text | NO | — |
| `discount_type` | text | NO | — |
| `discount_value` | numeric | NO | — |
| `max_uses` | integer | YES | — |
| `uses_count` | integer | NO | 0 |
| `starts_at` | date | YES | — |
| `ends_at` | date | YES | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `document_field_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `doc_type` | text | NO | — |
| `field_key` | text | NO | — |
| `field_label` | text | NO | — |
| `field_type` | text | NO | — |
| `is_required` | boolean | NO | false |
| `is_ai_extractable` | boolean | NO | false |
| `extraction_hint` | text | YES | — |
| `sort_order` | integer | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `document_field_values`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `document_id` | uuid | NO | — |
| `field_definition_id` | uuid | YES | — |
| `field_key` | text | NO | — |
| `value_text` | text | YES | — |
| `value_number` | numeric | YES | — |
| `value_boolean` | boolean | YES | — |
| `value_date` | timestamp with time zone | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `document_versions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `document_id` | uuid | NO | — |
| `version_number` | integer | NO | — |
| `storage_path` | text | YES | — |
| `original_filename` | text | YES | — |
| `mime_type` | text | YES | — |
| `byte_size` | bigint | YES | — |
| `checksum_sha256` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |

## `documents`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `owner_contact_id` | uuid | YES | — |
| `entity_type` | text | YES | — |
| `entity_id` | uuid | YES | — |
| `doc_type` | text | YES | — |
| `title` | text | YES | — |
| `original_filename` | text | YES | — |
| `mime_type` | text | YES | — |
| `byte_size` | bigint | YES | — |
| `bucket` | text | YES | — |
| `storage_path` | text | YES | — |
| `public_url` | text | YES | — |
| `checksum_sha256` | text | YES | — |
| `status` | text | NO | 'uploaded'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `extracted_text` | text | YES | — |
| `extracted_data` | jsonb | NO | '{}'::jsonb |
| `extraction_status` | text | YES | — |
| `extraction_provider` | text | YES | — |
| `extraction_error` | text | YES | — |
| `extracted_at` | timestamp with time zone | YES | — |
| `generated_from_document_id` | uuid | YES | — |
| `template_key` | text | YES | — |

## `entity_labels`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entity_type` | text | NO | — |
| `singular` | text | NO | — |
| `plural` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `entity_layouts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | YES | — |
| `industry_key` | text | YES | — |
| `entity_type` | text | NO | — |
| `surface` | text | NO | — |
| `layout_key` | text | NO | 'default'::text |
| `name` | text | NO | 'Untitled layout'::text |
| `version` | integer | NO | 1 |
| `status` | text | NO | 'draft'::text |
| `is_system_default` | boolean | NO | false |
| `doc` | jsonb | NO | '{}'::jsonb |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `published_at` | timestamp with time zone | YES | — |

## `external_mappings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `source` | text | NO | — |
| `entity_type` | text | NO | — |
| `external_id` | text | NO | — |
| `internal_table` | text | NO | — |
| `internal_id` | uuid | NO | — |
| `last_synced_at` | timestamp with time zone | YES | — |
| `sync_hash` | text | YES | — |
| `raw` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |

## `field_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entity_type` | text | NO | — |
| `field_key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `field_type` | text | NO | — |
| `is_system` | boolean | NO | false |
| `is_required` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `is_visible_in_form` | boolean | NO | true |
| `is_visible_in_drawer` | boolean | NO | true |
| `is_visible_in_table` | boolean | NO | false |
| `is_filterable` | boolean | NO | false |
| `is_sortable` | boolean | NO | false |
| `section_key` | text | YES | — |
| `sort_order` | integer | NO | 100 |
| `placeholder` | text | YES | — |
| `help_text` | text | YES | — |
| `config` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `is_visible_in_public_booking` | boolean | NO | false |
| `requirement_policy` | jsonb | YES | — |
| `interaction_policy` | jsonb | YES | — |

## `field_section_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entity_type` | text | NO | — |
| `section_key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `sort_order` | integer | NO | 100 |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `is_archived` | boolean | NO | false |
| `section_config` | jsonb | NO | '{}'::jsonb |

## `field_values`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `field_definition_id` | uuid | NO | — |
| `entity_type` | text | NO | — |
| `entity_id` | uuid | NO | — |
| `value_text` | text | YES | — |
| `value_number` | numeric | YES | — |
| `value_boolean` | boolean | YES | — |
| `value_date` | date | YES | — |
| `value_json` | jsonb | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `financial_charge_templates`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `service_id` | uuid | YES | — |
| `template_key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `charge_category` | text | NO | — |
| `trigger_type` | text | NO | — |
| `trigger_key` | text | YES | — |
| `amount_strategy` | text | NO | — |
| `amount_cents` | bigint | YES | — |
| `currency_code` | text | NO | 'USD'::text |
| `occurs_on_strategy` | text | NO | 'now'::text |
| `billable_on_strategy` | text | NO | 'immediate'::text |
| `billable_offset_days` | integer | YES | — |
| `default_gl_mapping_key` | text | YES | — |
| `default_responsibility_key` | text | YES | — |
| `review_required` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `effective_start` | date | NO | — |
| `effective_end` | date | YES | — |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `financial_policies`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `scope_type` | text | NO | — |
| `location_id` | uuid | YES | — |
| `service_id` | uuid | YES | — |
| `rate_plan_id` | uuid | YES | — |
| `policy_type` | text | NO | — |
| `label` | text | YES | — |
| `description` | text | YES | — |
| `value` | jsonb | NO | '{}'::jsonb |
| `is_active` | boolean | NO | true |
| `effective_start` | date | NO | — |
| `effective_end` | date | YES | — |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `financial_services`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `service_key` | text | NO | — |
| `label` | text | NO | — |
| `service_type` | text | NO | — |
| `unit` | text | YES | — |
| `description` | text | YES | — |
| `is_active` | boolean | NO | true |
| `sort_order` | integer | NO | 100 |
| `source_key` | text | NO | 'config'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `form_definition_versions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `form_definition_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `version_number` | integer | NO | — |
| `status` | text | NO | — |
| `schema_json` | jsonb | NO | — |
| `pdf_mapping_json` | jsonb | YES | — |
| `published_at` | timestamp with time zone | YES | — |
| `published_by_user_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `form_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `kind` | text | NO | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `form_packet_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | YES | — |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `form_packet_items`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `packet_definition_id` | uuid | NO | — |
| `sequence_index` | integer | NO | — |
| `form_definition_id` | uuid | NO | — |
| `pinned_form_definition_version_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `form_packet_session_items`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `packet_session_id` | uuid | NO | — |
| `packet_item_id` | uuid | NO | — |
| `sequence_index` | integer | NO | — |
| `status` | text | NO | 'pending'::text |
| `form_submission_id` | uuid | YES | — |
| `submitted_at` | timestamp with time zone | YES | — |
| `skip_reason` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `form_packet_sessions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `packet_definition_id` | uuid | NO | — |
| `started_via_public_link_id` | uuid | NO | — |
| `status` | text | NO | 'in_progress'::text |
| `launch_context` | jsonb | NO | '{}'::jsonb |
| `crm_snapshot` | jsonb | NO | '{}'::jsonb |
| `shared_values` | jsonb | NO | '{}'::jsonb |
| `current_sequence_index` | integer | NO | 0 |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `completed_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `operator_review_status` | text | YES | — |
| `operator_review_warnings` | jsonb | NO | '[]'::jsonb |
| `operator_reviewed_at` | timestamp with time zone | YES | — |
| `operator_reviewed_by_user_id` | uuid | YES | — |
| `operator_review_notes` | text | YES | — |
| `packet_instance_id` | uuid | YES | — |

## `form_public_links`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `token_hash` | text | NO | — |
| `token_prefix` | text | YES | — |
| `form_definition_id` | uuid | NO | — |
| `pinned_form_definition_version_id` | uuid | YES | — |
| `is_active` | boolean | NO | true |
| `expires_at` | timestamp with time zone | YES | — |
| `allowed_embed_origins` | ARRAY | YES | — |
| `rate_limit_profile` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `last_used_at` | timestamp with time zone | YES | — |

## `form_submission_documents`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `form_submission_id` | uuid | NO | — |
| `document_id` | uuid | NO | — |
| `role` | text | NO | — |
| `sort_order` | integer | NO | 0 |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |

## `form_submission_signatures`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `form_submission_id` | uuid | NO | — |
| `field_id` | text | NO | — |
| `instance_key` | text | NO | ''::text |
| `signature_kind` | text | NO | — |
| `typed_full_name` | text | YES | — |
| `drawn_asset_document_id` | uuid | YES | — |
| `signer_acknowledged_at` | timestamp with time zone | NO | — |
| `signer_ip_hash` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `external_provider` | text | YES | — |
| `external_envelope_id` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |

## `form_submissions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `form_definition_id` | uuid | NO | — |
| `form_definition_version_id` | uuid | NO | — |
| `status` | text | NO | — |
| `payload` | jsonb | NO | '{}'::jsonb |
| `person_id` | uuid | YES | — |
| `customer_id` | uuid | YES | — |
| `customer_member_id` | uuid | YES | — |
| `opportunity_id` | uuid | YES | — |
| `created_via_public_link_id` | uuid | YES | — |
| `created_by_user_id` | uuid | YES | — |
| `submitted_by_user_id` | uuid | YES | — |
| `submitted_at` | timestamp with time zone | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `gl_account_mappings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `gl_account_id` | uuid | NO | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `gl_accounts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `code` | text | NO | — |
| `name` | text | NO | — |
| `type` | text | NO | — |
| `currency` | text | NO | 'USD'::text |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `gl_journal_entries`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entry_date` | date | NO | ((now() AT TIME ZONE 'utc'::text))::date |
| `description` | text | YES | — |
| `status` | text | NO | 'posted'::text |
| `posted_at` | timestamp with time zone | YES | now() |
| `source_type` | text | YES | — |
| `source_id` | uuid | YES | — |
| `reversal_of_entry_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `gl_journal_lines`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entry_id` | uuid | NO | — |
| `line_no` | integer | NO | 1 |
| `account_id` | uuid | NO | — |
| `description` | text | YES | — |
| `debit_cents` | bigint | NO | 0 |
| `credit_cents` | bigint | NO | 0 |
| `currency` | text | NO | 'USD'::text |
| `job_id` | uuid | YES | — |
| `schedule_id` | uuid | YES | — |
| `payment_id` | uuid | YES | — |
| `customer_id` | uuid | YES | — |
| `vendor_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `billable_source_type` | text | YES | — |
| `billable_source_id` | uuid | YES | — |

## `home_types`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `industries`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `industry_default_entity_labels`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `industry_id` | uuid | NO | — |
| `entity_type` | text | NO | — |
| `singular` | text | NO | — |
| `plural` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `job_line_items`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `job_id` | uuid | NO | — |
| `sort_order` | integer | YES | — |
| `line_type` | text | NO | — |
| `category_key` | text | YES | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `quantity` | numeric | NO | 1 |
| `unit_amount_cents` | integer | NO | — |
| `amount_cents` | integer | NO | — |
| `currency_code` | text | NO | 'USD'::text |
| `is_taxable` | boolean | YES | false |
| `tax_category_key` | text | YES | — |
| `pricing_source` | text | YES | — |
| `source_entity_type` | text | YES | — |
| `source_entity_id` | uuid | YES | — |
| `locked_at` | timestamp with time zone | YES | — |
| `is_system_generated` | boolean | YES | true |
| `is_manual_override` | boolean | YES | false |
| `manual_override_reason` | text | YES | — |
| `replaced_line_item_id` | uuid | YES | — |
| `is_active` | boolean | YES | true |
| `metadata` | jsonb | YES | '{}'::jsonb |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |

## `job_pricing_snapshots`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `job_id` | uuid | NO | — |
| `snapshot_type` | text | NO | — |
| `version_number` | integer | NO | — |
| `summary` | jsonb | NO | — |
| `line_items` | jsonb | NO | — |
| `reason` | text | YES | — |
| `created_at` | timestamp with time zone | YES | now() |
| `created_by` | uuid | YES | — |

## `job_statuses`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `org_id` | uuid | YES | — |

## `job_tags`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `job_id` | uuid | NO | — |
| `tag_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `jobs`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | YES | — |
| `customer_id` | uuid | NO | — |
| `primary_contact_id` | uuid | YES | — |
| `location_id` | uuid | YES | — |
| `opportunity_id` | uuid | YES | — |
| `title` | text | YES | — |
| `is_recurring` | boolean | NO | false |
| `job_status_id` | uuid | YES | '6c699cac-8981-4200-93f0-2bf166cff36c'::uuid |
| `service_frequency_key` | text | YES | — |
| `estimated_total_cents` | integer | YES | — |
| `recurring_total_cents` | integer | YES | — |
| `offer_code` | text | YES | — |
| `offer_expires_at` | timestamp with time zone | YES | — |
| `internal_notes` | text | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `description` | text | YES | — |
| `job_number_for_customer` | integer | YES | — |
| `contractor_split_bps` | integer | YES | — |
| `alloy_split_bps` | integer | YES | — |
| `gross_price_cents` | integer | YES | — |
| `contractor_payout_cents` | integer | YES | — |
| `alloy_fee_cents` | integer | YES | — |
| `scheduled_at` | timestamp with time zone | YES | — |
| `completed_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |
| `service_key` | text | YES | — |
| `job_type` | text | YES | — |
| `discount_code_id` | uuid | YES | — |
| `discount_code` | text | YES | — |
| `discount_amount` | numeric | YES | — |
| `discounted` | boolean | NO | false |
| `assigned_vendor_id` | uuid | YES | — |
| `archived_at` | timestamp with time zone | YES | — |
| `status_key` | text | YES | — |
| `primary_person_id` | uuid | YES | — |
| `discount_program_id` | uuid | YES | — |
| `work_unit_id` | uuid | YES | — |
| `subtotal_cents` | integer | YES | 0 |
| `discount_total_cents` | integer | YES | 0 |
| `fee_total_cents` | integer | YES | 0 |
| `adjustment_total_cents` | integer | YES | 0 |
| `tax_total_cents` | integer | YES | 0 |
| `total_cents` | integer | YES | 0 |
| `amount_paid_cents` | integer | YES | 0 |
| `amount_due_cents` | integer | YES | 0 |
| `pricing_status` | text | YES | 'draft'::text |
| `pricing_locked_at` | timestamp with time zone | YES | — |
| `pricing_version` | integer | YES | 1 |
| `job_number` | bigint | NO | — |

## `ledger_transactions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `occurred_at` | timestamp with time zone | NO | now() |
| `status` | text | NO | 'confirmed'::text |
| `type` | text | NO | — |
| `direction` | text | NO | — |
| `amount_cents` | bigint | NO | — |
| `currency` | text | NO | 'USD'::text |
| `provider` | text | YES | — |
| `provider_ref` | text | YES | — |
| `job_id` | uuid | YES | — |
| `schedule_id` | uuid | YES | — |
| `payment_id` | uuid | YES | — |
| `customer_id` | uuid | YES | — |
| `vendor_id` | uuid | YES | — |
| `journal_entry_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `billable_source_type` | text | YES | — |
| `billable_source_id` | uuid | YES | — |

## `location_program_categories`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `sort_order` | integer | NO | 100 |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `location_tags`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `location_id` | uuid | NO | — |
| `tag_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `location_types`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `locations`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `customer_id` | uuid | YES | — |
| `label` | text | YES | — |
| `is_primary` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `address1` | text | YES | — |
| `address2` | text | YES | — |
| `city` | text | YES | — |
| `state` | text | YES | — |
| `postal_code` | text | YES | — |
| `country` | text | YES | — |
| `lat` | numeric | YES | — |
| `lng` | numeric | YES | — |
| `access_method_id` | uuid | YES | — |
| `access_notes` | text | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |
| `vendor_id` | uuid | YES | — |
| `location_type` | text | NO | 'address'::text |
| `parent_location_id` | uuid | YES | — |
| `location_type_id` | uuid | YES | — |
| `status_key` | text | YES | — |
| `access_code` | text | YES | — |
| `has_pets` | boolean | YES | — |
| `location_number` | bigint | NO | — |
| `beds` | numeric | YES | — |
| `baths` | numeric | YES | — |
| `home_type_key` | text | YES | — |
| `access_method_key` | text | YES | — |
| `square_footage_tier_key` | text | YES | — |

## `messages`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `customer_id` | uuid | YES | — |
| `contact_id` | uuid | YES | — |
| `job_id` | uuid | YES | — |
| `opportunity_id` | uuid | YES | — |
| `channel` | text | YES | — |
| `direction` | text | YES | — |
| `from_value` | text | YES | — |
| `to_value` | text | YES | — |
| `body` | text | YES | — |
| `status` | text | YES | 'queued'::text |
| `sent_at` | timestamp with time zone | YES | — |
| `provider` | text | YES | — |
| `provider_message_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `related_entity_type` | text | YES | — |
| `related_entity_id` | uuid | YES | — |
| `workflow_run_id` | uuid | YES | — |
| `error` | text | YES | — |
| `external_id` | text | YES | — |

## `messages_outbox`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `workflow_run_id` | uuid | YES | — |
| `workflow_id` | uuid | YES | — |
| `channel` | text | NO | 'sms'::text |
| `to_number` | text | YES | — |
| `to_email` | text | YES | — |
| `template_key` | text | YES | — |
| `body` | text | YES | — |
| `payload` | jsonb | NO | '{}'::jsonb |
| `status` | text | NO | 'queued'::text |
| `error` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `sent_at` | timestamp with time zone | YES | — |
| `dedupe_key` | text | YES | — |
| `to_contact_id` | uuid | YES | — |
| `to_phone` | text | YES | — |

## `metric_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | YES | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | NO | ''::text |
| `category` | text | NO | 'general'::text |
| `entity_scope` | text | NO | 'org'::text |
| `source_type` | text | NO | — |
| `source_key` | text | NO | — |
| `aggregation` | text | NO | — |
| `numerator_config` | jsonb | YES | — |
| `denominator_config` | jsonb | YES | — |
| `filter_config` | jsonb | NO | '{}'::jsonb |
| `dimension_config` | jsonb | NO | '{}'::jsonb |
| `default_period_config` | jsonb | NO | '{"days": 30, "kind": "rolling", "version": 1}'::jsonb |
| `unit` | text | NO | 'none'::text |
| `precision` | integer | NO | 0 |
| `is_kpi` | boolean | NO | false |
| `target_config` | jsonb | YES | — |
| `threshold_config` | jsonb | YES | — |
| `status` | text | NO | 'draft'::text |
| `version` | integer | NO | 1 |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |

## `metric_placements`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `visualization_id` | uuid | NO | — |
| `surface` | text | NO | — |
| `surface_key` | text | NO | 'default'::text |
| `placement_zone` | text | NO | 'overview'::text |
| `context_config` | jsonb | NO | '{"version": 1}'::jsonb |
| `visibility_config` | jsonb | NO | '{"version": 1, "visible": true}'::jsonb |
| `sort_order` | integer | NO | 0 |
| `status` | text | NO | 'draft'::text |
| `version` | integer | NO | 1 |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `metric_platform_snapshots`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `metric_definition_id` | uuid | NO | — |
| `context_type` | text | NO | 'org'::text |
| `context_id` | uuid | YES | — |
| `period_start` | timestamp with time zone | NO | — |
| `period_end` | timestamp with time zone | NO | — |
| `granularity` | text | NO | 'day'::text |
| `value` | double precision | YES | — |
| `numerator_value` | double precision | YES | — |
| `denominator_value` | double precision | YES | — |
| `dimension_values` | jsonb | YES | — |
| `health_state` | text | NO | 'unknown'::text |
| `computed_at` | timestamp with time zone | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `metric_rollups`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `rollup_type` | text | NO | — |
| `child_metric_config` | jsonb | NO | '{"metrics": [], "version": 1}'::jsonb |
| `context_scope` | text | NO | 'org'::text |
| `weight_config` | jsonb | YES | — |
| `threshold_config` | jsonb | YES | — |
| `status` | text | NO | 'draft'::text |
| `version` | integer | NO | 1 |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `metric_snapshots`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `metric_key` | text | NO | — |
| `window_key` | text | NO | — |
| `scope_type` | text | NO | 'org'::text |
| `scope_id` | uuid | YES | — |
| `dimension_key` | text | YES | — |
| `dimension_value` | text | YES | — |
| `value_numeric` | double precision | YES | — |
| `value_json` | jsonb | NO | '{}'::jsonb |
| `computed_at` | timestamp with time zone | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `metric_visualizations`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | YES | — |
| `metric_definition_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `visualization_type` | text | NO | — |
| `style_config` | jsonb | NO | '{"version": 1}'::jsonb |
| `display_config` | jsonb | NO | '{"version": 1}'::jsonb |
| `version` | integer | NO | 1 |
| `status` | text | NO | 'draft'::text |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `mutation_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `mutation_id` | uuid | NO | gen_random_uuid() |
| `command_key` | text | NO | — |
| `domain` | text | NO | — |
| `subject_id` | uuid | NO | — |
| `subject_type` | text | NO | — |
| `previous_state` | text | YES | — |
| `new_state` | text | NO | — |
| `operator_id` | text | YES | — |
| `origin` | text | NO | 'operator'::text |
| `override_reason` | text | YES | — |
| `context_payload` | jsonb | YES | — |
| `committed_at` | timestamp with time zone | NO | now() |
| `effective_at` | timestamp with time zone | NO | now() |

## `operational_tasks`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entity_type` | text | YES | — |
| `entity_id` | uuid | YES | — |
| `assigned_to_user_id` | uuid | YES | — |
| `created_by` | uuid | NO | — |
| `title` | text | NO | — |
| `description` | text | YES | — |
| `due_at` | timestamp with time zone | NO | — |
| `status` | text | NO | 'open'::text |
| `source` | text | NO | 'task_assist'::text |
| `proposal_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `opportunities`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | YES | — |
| `customer_id` | uuid | YES | — |
| `primary_contact_id` | uuid | YES | — |
| `location_id` | uuid | YES | — |
| `name` | text | YES | — |
| `pipeline_id` | uuid | YES | — |
| `pipeline_stage_id` | uuid | YES | — |
| `source` | text | YES | — |
| `lost_reason` | text | YES | — |
| `assigned_to` | text | YES | — |
| `job_date` | date | YES | — |
| `job_time_window` | text | YES | — |
| `appointment_id` | text | YES | — |
| `customer_notes` | text | YES | — |
| `monetary_value_cents` | integer | YES | — |
| `estimated_price_cents` | integer | YES | — |
| `recurring_price_cents` | integer | YES | — |
| `price_breakdown` | text | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `title` | text | YES | — |
| `org_id` | uuid | YES | — |
| `discount_code_id` | uuid | YES | — |
| `discount_code` | text | YES | — |
| `quote_subtotal` | numeric | YES | — |
| `discount_amount` | numeric | YES | — |
| `quote_total` | numeric | YES | — |
| `discount_validated_at` | timestamp with time zone | YES | — |
| `status_key` | text | YES | — |
| `primary_person_id` | uuid | YES | — |
| `discount_program_id` | uuid | YES | — |
| `opportunity_number` | bigint | NO | — |
| `quote_is_overridden` | boolean | NO | false |
| `quote_override_total` | numeric | YES | — |
| `quote_override_reason` | text | YES | — |
| `work_unit_id` | uuid | YES | — |
| `stage_key` | text | YES | — |
| `close_reason_key` | text | YES | — |

## `opportunity_customer_members`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `opportunity_id` | uuid | NO | — |
| `customer_member_id` | uuid | NO | — |
| `schedule_type` | text | YES | — |
| `fit_status` | text | YES | — |
| `notes` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `outcome_status_key` | text | YES | — |
| `start_date` | date | YES | — |
| `location_id` | uuid | YES | — |
| `program_room_cohort_key` | text | YES | — |
| `program_category_id` | uuid | YES | — |
| `stage_key` | text | YES | — |
| `close_reason_key` | text | YES | — |

## `opportunity_persons`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `opportunity_id` | uuid | NO | — |
| `person_id` | uuid | NO | — |
| `role_type` | text | NO | 'family_member'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `opportunity_tags`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `opportunity_id` | uuid | NO | — |
| `tag_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `option_set_items`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `option_set_id` | uuid | NO | — |
| `item_key` | text | NO | — |
| `label` | text | NO | — |
| `sort_order` | integer | NO | 0 |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `option_sets`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `set_key` | text | NO | — |
| `label` | text | NO | — |
| `sort_order` | integer | NO | 0 |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `config` | jsonb | NO | '{}'::jsonb |

## `org_settings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `payout_type` | text | NO | 'percentage'::text |
| `payout_value` | numeric | NO | 0 |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `orgs`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `name` | text | NO | — |
| `slug` | text | NO | — |
| `status` | text | NO | 'active'::text |
| `created_at` | timestamp with time zone | NO | now() |
| `industry_id` | uuid | YES | — |

## `payment_allocations`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `payment_id` | uuid | NO | — |
| `target_entity_type` | text | NO | — |
| `target_entity_id` | uuid | NO | — |
| `allocated_amount_cents` | bigint | NO | — |
| `status` | text | NO | — |
| `allocation_type` | text | NO | — |
| `allocated_at` | timestamp with time zone | NO | now() |
| `reversed_at` | timestamp with time zone | YES | — |
| `reversal_reason` | text | YES | — |
| `notes` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `charge_id` | uuid | YES | — |

## `payment_statuses`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `payments`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `job_id` | uuid | YES | — |
| `customer_id` | uuid | YES | — |
| `amount_cents` | bigint | NO | — |
| `currency` | text | NO | 'USD'::text |
| `payment_status_id` | uuid | YES | — |
| `provider` | text | YES | — |
| `provider_payment_id` | text | YES | — |
| `paid_at` | timestamp with time zone | YES | — |
| `notes` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `org_id` | uuid | NO | — |
| `posted_to_ledger_at` | timestamp with time zone | YES | — |
| `status_key` | text | YES | — |
| `status` | text | NO | — |
| `direction` | text | NO | — |
| `received_at` | timestamp with time zone | NO | — |
| `effective_at` | timestamp with time zone | YES | — |
| `posted_at` | timestamp with time zone | YES | — |
| `failed_at` | timestamp with time zone | YES | — |
| `voided_at` | timestamp with time zone | YES | — |
| `payer_entity_type` | text | YES | — |
| `payer_entity_id` | uuid | YES | — |
| `payment_method` | text | NO | — |
| `processor` | text | YES | — |
| `processor_transaction_id` | text | YES | — |
| `reference_number` | text | YES | — |
| `deposit_batch_id` | uuid | YES | — |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |

## `permission_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `group_key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `permission_keys`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `key` | text | NO | — |
| `label` | text | NO | — |
| `group_key` | text | NO | 'general'::text |
| `description` | text | YES | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |

## `permissions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `key` | text | NO | — |
| `group_key` | text | NO | — |
| `label` | text | NO | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |

## `person_child_relationship_roles`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `relationship_id` | uuid | NO | — |
| `role_key` | text | NO | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `person_child_relationships`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `customer_id` | uuid | NO | — |
| `customer_member_id` | uuid | NO | — |
| `person_id` | uuid | NO | — |
| `relationship_type` | text | YES | — |
| `priority` | integer | YES | — |
| `status` | text | NO | 'active'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `person_locations`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `person_id` | uuid | NO | — |
| `location_id` | uuid | NO | — |
| `relationship_type` | text | NO | 'associated'::text |
| `is_primary` | boolean | NO | false |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `person_relationship_type_settings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `description` | text | YES | — |
| `sort_order` | integer | NO | 100 |
| `is_system` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `vertical_id` | uuid | YES | — |
| `industry_id` | uuid | YES | — |

## `person_relationships`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `from_person_id` | uuid | NO | — |
| `to_person_id` | uuid | NO | — |
| `relationship_type` | text | NO | — |
| `is_primary` | boolean | NO | false |
| `status` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `persons`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `first_name` | text | YES | — |
| `last_name` | text | YES | — |
| `full_name` | text | YES | — |
| `preferred_name` | text | YES | — |
| `email` | text | YES | — |
| `phone` | text | YES | — |
| `date_of_birth` | date | YES | — |
| `status_key` | text | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `archived_at` | timestamp with time zone | YES | — |
| `archived_by` | uuid | YES | — |
| `person_number` | bigint | NO | — |
| `is_employee` | boolean | YES | — |
| `employee_id` | text | YES | — |
| `employee_source` | text | YES | — |

## `pipeline_stages`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `pipeline_id` | uuid | NO | — |
| `ghl_stage_uuid` | uuid | YES | — |
| `name` | text | NO | — |
| `position` | integer | NO | 0 |
| `show_in_funnel` | boolean | NO | true |
| `show_in_pie_chart` | boolean | NO | true |
| `org_id` | uuid | YES | — |
| `key` | text | YES | — |

## `pipelines`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `name` | text | NO | — |
| `ghl_pipeline_id` | text | YES | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `org_id` | uuid | YES | — |

## `placement_candidates`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `opportunity_id` | uuid | NO | — |
| `customer_id` | uuid | YES | — |
| `opportunity_customer_member_id` | uuid | YES | — |
| `customer_member_id` | uuid | YES | — |
| `person_id` | uuid | YES | — |
| `site_id` | uuid | YES | — |
| `is_synthetic_fallback` | boolean | NO | false |
| `program_room_cohort_key` | text | NO | — |
| `program_room_group_label` | text | YES | — |
| `wait_since` | timestamp with time zone | YES | — |
| `start_date` | date | YES | — |
| `status` | text | NO | 'active'::text |
| `seed_key` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `placement_link_group_members`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `placement_link_group_id` | uuid | NO | — |
| `placement_candidate_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `placement_link_groups`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `opportunity_id` | uuid | NO | — |
| `customer_id` | uuid | YES | — |
| `link_mode` | text | NO | 'independent'::text |
| `notes` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `placement_overrides`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `placement_candidate_id` | uuid | NO | — |
| `program_room_cohort_key` | text | NO | — |
| `override_kind` | text | NO | — |
| `reason` | text | NO | — |
| `payload` | jsonb | NO | '{}'::jsonb |
| `is_active` | boolean | NO | true |
| `expires_at` | timestamp with time zone | YES | — |
| `created_by` | uuid | NO | — |
| `released_by` | uuid | YES | — |
| `released_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `pricing_addons`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | NO | — |
| `addon_key` | text | NO | — |
| `addon_name` | text | NO | — |
| `amount_cents` | integer | NO | — |
| `sort_order` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `pricing_dimension_values`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `dimension_id` | uuid | YES | — |
| `value_key` | text | NO | — |
| `value_label` | text | NO | — |
| `sort_order` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |

## `pricing_dimensions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | YES | — |
| `dimension_key` | text | NO | — |
| `dimension_name` | text | NO | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |
| `source_option_set_key` | text | YES | — |

## `pricing_first_clean_prices`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | NO | — |
| `sqft_tier_id` | uuid | NO | — |
| `amount_cents` | integer | NO | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `service_id` | uuid | NO | — |

## `pricing_frequencies`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | NO | — |
| `frequency_key` | text | NO | — |
| `frequency_label` | text | NO | — |
| `discount_label` | text | YES | — |
| `sort_order` | integer | NO | 0 |
| `is_recurring` | boolean | NO | true |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `recurrence_unit` | text | YES | — |
| `recurrence_interval` | integer | YES | — |
| `service_plan_template_id` | uuid | YES | — |

## `pricing_matrix`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `vertical_id` | uuid | NO | — |
| `service_offering_id` | uuid | YES | — |
| `service_plan_template_id` | uuid | YES | — |
| `pricing_mode_id` | uuid | NO | — |
| `pricing_dimension_value_id` | uuid | YES | — |
| `amount_cents` | integer | NO | — |
| `currency` | text | NO | 'USD'::text |
| `is_active` | boolean | NO | true |
| `sort_order` | integer | NO | 0 |
| `effective_start_at` | timestamp with time zone | YES | — |
| `effective_end_at` | timestamp with time zone | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `source_table` | text | YES | — |
| `source_id` | uuid | YES | — |

## `pricing_modes`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | YES | — |
| `mode_key` | text | NO | — |
| `mode_name` | text | NO | — |
| `sort_order` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |

## `pricing_recurring_prices`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | NO | — |
| `frequency_id` | uuid | NO | — |
| `sqft_tier_id` | uuid | NO | — |
| `amount_cents` | integer | NO | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `service_id` | uuid | NO | — |

## `pricing_services`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | NO | — |
| `service_key` | text | NO | — |
| `service_name` | text | NO | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `is_manual_quote` | boolean | NO | false |
| `service_offering_id` | uuid | YES | — |

## `pricing_square_footage_tiers`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vertical_id` | uuid | NO | — |
| `sort_order` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `dimension_value_id` | uuid | YES | — |
| `tier_key` | text | NO | — |

## `process_instances`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `process_key` | text | NO | — |
| `subject_type` | text | NO | — |
| `subject_id` | uuid | NO | — |
| `context_type` | text | YES | — |
| `context_id` | uuid | YES | — |
| `stage_key` | text | YES | — |
| `state` | text | YES | — |
| `close_reason_key` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `processing_approvals`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `case_id` | uuid | NO | — |
| `plan_id` | uuid | NO | — |
| `plan_version` | integer | NO | — |
| `plan_content_hash` | text | NO | — |
| `approving_actor` | uuid | NO | — |
| `approval_authority` | text | NO | 'standard'::text |
| `decision` | text | NO | 'approved'::text |
| `included_operation_ids` | jsonb | NO | '[]'::jsonb |
| `approved_at` | timestamp with time zone | NO | now() |
| `invalidated_at` | timestamp with time zone | YES | — |
| `invalidation_reason` | text | YES | — |
| `retention_class` | text | NO | 'audit_authoritative'::text |
| `created_at` | timestamp with time zone | NO | now() |

## `processing_case_sources`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `processing_case_id` | uuid | NO | — |
| `source_kind` | text | NO | — |
| `source_id` | uuid | NO | — |
| `role` | text | NO | 'related'::text |
| `linked_at` | timestamp with time zone | NO | now() |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `idempotency_key` | text | YES | — |
| `trust_context` | jsonb | NO | '{}'::jsonb |
| `envelope_snapshot` | jsonb | YES | — |

## `processing_cases`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `status` | text | NO | 'received'::text |
| `case_type` | text | YES | — |
| `status_changed_at` | timestamp with time zone | NO | now() |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `archived_at` | timestamp with time zone | YES | — |
| `retention_class` | text | NO | 'uncommitted_submission'::text |
| `case_subject_kind` | text | YES | — |
| `primary_customer_id` | uuid | YES | — |
| `primary_opportunity_id` | uuid | YES | — |

## `processing_commit_attempts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `case_id` | uuid | NO | — |
| `plan_id` | uuid | NO | — |
| `plan_version` | integer | NO | — |
| `plan_content_hash` | text | NO | — |
| `attempt_no` | integer | NO | — |
| `execution_idempotency_key` | text | NO | — |
| `actor_id` | uuid | NO | — |
| `outcome` | text | NO | — |
| `operations` | jsonb | NO | '[]'::jsonb |
| `compensation` | jsonb | NO | '[]'::jsonb |
| `events` | jsonb | NO | '[]'::jsonb |
| `preflight_failures` | jsonb | NO | '[]'::jsonb |
| `retention_class` | text | NO | 'audit_authoritative'::text |
| `started_at` | timestamp with time zone | NO | now() |
| `finished_at` | timestamp with time zone | NO | now() |
| `created_at` | timestamp with time zone | NO | now() |

## `processing_commit_plans`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `case_id` | uuid | NO | — |
| `version` | integer | NO | — |
| `content_hash` | text | NO | — |
| `source_resolution_versions` | jsonb | NO | '[]'::jsonb |
| `preconditions` | jsonb | NO | '[]'::jsonb |
| `atomic_groups` | jsonb | NO | '[]'::jsonb |
| `downstream_effect_preview` | jsonb | NO | '[]'::jsonb |
| `requires_approval` | boolean | NO | true |
| `requires_privileged_approval` | boolean | NO | false |
| `reversible` | boolean | NO | true |
| `status` | text | NO | 'draft'::text |
| `built_at` | timestamp with time zone | NO | now() |
| `superseded_by` | uuid | YES | — |
| `superseded_at` | timestamp with time zone | YES | — |
| `retention_class` | text | NO | 'audit_authoritative'::text |
| `created_at` | timestamp with time zone | NO | now() |

## `processing_exceptions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `case_id` | uuid | NO | — |
| `exception_type` | text | NO | — |
| `severity` | text | NO | 'warning'::text |
| `code` | text | NO | — |
| `message` | text | NO | — |
| `subject_ref` | jsonb | YES | — |
| `evidence_ids` | jsonb | NO | '[]'::jsonb |
| `resolved_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | now() |

## `processing_facts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `case_id` | uuid | NO | — |
| `source_id` | uuid | YES | — |
| `subject_ref` | text | YES | — |
| `fact_type` | text | NO | — |
| `semantic_key` | text | YES | — |
| `raw_value` | text | YES | — |
| `normalized_value` | text | YES | — |
| `data_type` | text | YES | — |
| `extraction_method` | text | YES | — |
| `evidence` | jsonb | NO | '{}'::jsonb |
| `extraction_confidence` | numeric | YES | — |
| `validation_state` | text | YES | — |
| `mapping_state` | text | YES | — |
| `role_hint` | text | YES | — |
| `produced_by` | text | YES | — |
| `extractor_version` | text | YES | — |
| `generation_id` | uuid | NO | — |
| `corrected_from` | uuid | YES | — |
| `retention_class` | text | NO | 'uncommitted_submission'::text |
| `created_at` | timestamp with time zone | NO | now() |

## `processing_plan_operations`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `plan_id` | uuid | NO | — |
| `op_id` | text | NO | — |
| `op_order` | integer | NO | — |
| `op_kind` | text | NO | — |
| `command_key` | text | NO | — |
| `command_version` | text | NO | — |
| `target_type` | text | NO | — |
| `target_id` | uuid | YES | — |
| `payload` | jsonb | NO | '{}'::jsonb |
| `before_snapshot` | jsonb | YES | — |
| `after_values` | jsonb | YES | — |
| `reason` | text | YES | — |
| `evidence_refs` | jsonb | NO | '[]'::jsonb |
| `resolution_refs` | jsonb | NO | '[]'::jsonb |
| `risk` | text | NO | 'low'::text |
| `depends_on` | jsonb | NO | '[]'::jsonb |
| `atomic_group` | text | YES | — |
| `precondition_record_version` | text | YES | — |
| `included` | boolean | NO | true |
| `optional` | boolean | NO | false |
| `reversibility` | text | NO | 'reversible'::text |
| `expected_side_effects` | jsonb | NO | '[]'::jsonb |
| `mapping` | jsonb | YES | — |
| `created_at` | timestamp with time zone | NO | now() |

## `processing_resolutions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `case_id` | uuid | NO | — |
| `generation_id` | uuid | NO | — |
| `input_facts_hash` | text | NO | — |
| `subject_ref` | text | NO | — |
| `subject_role` | text | NO | — |
| `provisional` | jsonb | NO | '{}'::jsonb |
| `candidates` | jsonb | NO | '[]'::jsonb |
| `decision_action` | text | YES | — |
| `selected_candidate_id` | text | YES | — |
| `decided_by` | text | NO | 'engine'::text |
| `operator_id` | uuid | YES | — |
| `policy_version` | text | YES | — |
| `resolver_version` | text | NO | — |
| `stale_at` | timestamp with time zone | YES | — |
| `superseded_by` | uuid | YES | — |
| `retention_class` | text | NO | 'uncommitted_submission'::text |
| `created_at` | timestamp with time zone | NO | now() |

## `program_offering_variants`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `offering_id` | uuid | NO | — |
| `label` | text | YES | — |
| `quantity_type` | text | YES | — |
| `quantity_value` | numeric | YES | — |
| `sort_order` | integer | NO | 100 |
| `is_active` | boolean | NO | true |
| `status` | text | NO | 'active'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `program_offerings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `program_key` | text | NO | — |
| `label` | text | NO | — |
| `attendance_type` | text | NO | — |
| `status` | text | NO | 'active'::text |
| `effective_start` | date | YES | — |
| `effective_end` | date | YES | — |
| `sort_order` | integer | NO | 100 |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `quotes`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `opportunity_id` | uuid | YES | — |
| `job_id` | uuid | YES | — |
| `pricing_version` | integer | NO | 1 |
| `subtotal_cents` | integer | YES | — |
| `discount_cents` | integer | NO | 0 |
| `tax_cents` | integer | NO | 0 |
| `total_cents` | integer | YES | — |
| `recurring_total_cents` | integer | YES | — |
| `currency` | text | NO | 'USD'::text |
| `price_breakdown` | text | YES | — |
| `status` | text | NO | 'draft'::text |
| `expires_at` | timestamp with time zone | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | YES | — |

## `record_actions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `entity_type` | text | NO | — |
| `action_key` | text | NO | — |
| `label` | text | NO | — |
| `event_key` | text | NO | — |
| `placement` | text | NO | 'secondary'::text |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |

## `record_drawer_layouts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entity_type` | text | NO | — |
| `surface` | text | NO | 'drawer'::text |
| `key` | text | NO | 'default'::text |
| `config_json` | jsonb | NO | '{}'::jsonb |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `record_layouts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `entity_type` | text | NO | — |
| `key` | text | NO | — |
| `config_json` | jsonb | NO | '{}'::jsonb |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |

## `record_overview_layouts`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entity_type` | text | NO | — |
| `surface` | text | NO | 'overview'::text |
| `template_key` | text | NO | 'default'::text |
| `config` | jsonb | NO | '{}'::jsonb |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `recurrence_plans`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `job_id` | uuid | NO | — |
| `frequency_key` | text | NO | — |
| `interval` | integer | NO | 1 |
| `day_of_week` | integer | YES | — |
| `start_date` | date | NO | — |
| `end_date` | date | YES | — |
| `next_run_at` | timestamp with time zone | YES | — |
| `status` | text | NO | 'active'::text |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `resolved_obligations`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | YES | — |
| `consumption_event_id` | uuid | NO | — |
| `charge_template_id` | uuid | YES | — |
| `service_id` | uuid | YES | — |
| `amount_cents` | bigint | YES | — |
| `currency_code` | text | NO | 'USD'::text |
| `responsibility_key` | text | YES | — |
| `occurs_on` | date | YES | — |
| `billable_on` | date | YES | — |
| `status` | text | NO | 'previewed'::text |
| `review_required` | boolean | NO | false |
| `explanation` | jsonb | NO | '{}'::jsonb |
| `draft_charge_id` | uuid | YES | — |
| `resolution_key` | text | YES | — |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `obligation_kind` | text | YES | — |
| `period_start` | date | YES | — |
| `period_end` | date | YES | — |
| `review_status` | text | NO | 'pending'::text |
| `reviewed_at` | timestamp with time zone | YES | — |
| `reviewed_by` | uuid | YES | — |
| `suppression_reason` | text | YES | — |
| `superseded_by_event_id` | uuid | YES | — |

## `role_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `role_key` | text | NO | — |
| `role_label` | text | NO | — |
| `description` | text | YES | — |
| `is_system` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `role_permission_grants`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `role_key` | text | NO | — |
| `permission_key` | text | NO | — |
| `allowed` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `schedule_assignments`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `enrollment_agreement_id` | uuid | NO | — |
| `schedule_pattern_id` | uuid | NO | — |
| `customer_member_id` | uuid | NO | — |
| `start_date` | date | NO | — |
| `end_date` | date | YES | — |
| `status` | text | NO | — |
| `assignment_kind` | text | NO | 'base'::text |
| `source_key` | text | NO | 'operator'::text |
| `supersedes_assignment_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_by` | uuid | YES | — |
| `updated_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `schedule_patterns`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `site_location_id` | uuid | NO | — |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `schedule_type_key` | text | NO | — |
| `weekdays` | ARRAY | NO | — |
| `sort_order` | integer | NO | 100 |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `schedule_statuses`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `schedule_tags`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `schedule_id` | uuid | NO | — |
| `tag_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `schedules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `job_id` | uuid | NO | — |
| `visit_type` | text | YES | — |
| `start_at` | timestamp with time zone | YES | — |
| `end_at` | timestamp with time zone | YES | — |
| `duration_minutes` | integer | YES | — |
| `timezone` | text | YES | — |
| `schedule_status_id` | uuid | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |
| `customer_subscription_id` | uuid | YES | — |
| `subscription_sequence` | integer | YES | — |
| `canceled_at` | timestamp with time zone | YES | — |
| `canceled_by` | text | YES | — |
| `cancel_reason` | text | YES | — |
| `rescheduled_from_schedule_id` | uuid | YES | — |
| `reschedule_reason` | text | YES | — |
| `location_id` | uuid | YES | — |
| `status_key` | text | YES | 'scheduled'::text |
| `assigned_vendor_id` | uuid | YES | — |
| `price_cents` | integer | YES | — |
| `schedule_number` | bigint | NO | — |

## `service_offerings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `vertical_id` | uuid | YES | — |
| `offering_key` | text | NO | — |
| `offering_name` | text | NO | — |
| `description` | text | YES | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `service_plan_templates`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `vertical_id` | uuid | YES | — |
| `plan_key` | text | NO | — |
| `plan_name` | text | NO | — |
| `is_recurring` | boolean | NO | false |
| `recurrence_unit` | text | YES | — |
| `recurrence_interval` | integer | YES | — |
| `sort_order` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `service_price_dimensions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `pricing_rule_id` | uuid | NO | — |
| `dimension_type` | text | NO | — |
| `dimension_key` | text | NO | — |
| `dimension_label` | text | YES | — |
| `sort_order` | integer | NO | 0 |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |

## `service_pricing_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `vertical_id` | uuid | YES | — |
| `service_offering_id` | uuid | NO | — |
| `service_plan_template_id` | uuid | YES | — |
| `pricing_model` | text | NO | 'flat'::text |
| `base_price` | numeric | YES | — |
| `currency` | text | NO | 'USD'::text |
| `is_active` | boolean | NO | true |
| `effective_start_at` | timestamp with time zone | YES | — |
| `effective_end_at` | timestamp with time zone | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `sla_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `thread_id` | uuid | NO | — |
| `sla_type` | text | NO | — |
| `state` | text | NO | — |
| `occurred_at` | timestamp with time zone | NO | now() |
| `metadata` | jsonb | NO | '{}'::jsonb |

## `sqft_bands`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `status_definitions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | YES | — |
| `entity_type` | text | NO | — |
| `status_key` | text | NO | — |
| `status_label` | text | NO | — |
| `sort_order` | integer | NO | 100 |
| `is_active` | boolean | NO | true |
| `is_system` | boolean | NO | false |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `industry_key` | text | YES | — |
| `is_default` | boolean | NO | false |

## `status_transition_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `entity_type` | text | NO | — |
| `department_id` | uuid | YES | — |
| `work_unit_id` | uuid | YES | — |
| `action_key` | text | YES | — |
| `from_status_key` | text | YES | — |
| `to_status_key` | text | NO | — |
| `required_metadata_fields` | jsonb | NO | '[]'::jsonb |
| `required_payload_fields` | jsonb | NO | '[]'::jsonb |
| `blocked` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `message` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `tags`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `name` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `task_assist_proposals`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `actor_user_id` | uuid | NO | — |
| `created_by` | uuid | NO | — |
| `agent_key` | text | NO | 'task_assist'::text |
| `proposal_type` | text | NO | — |
| `entity_type` | text | NO | 'opportunities'::text |
| `entity_id` | uuid | NO | — |
| `status` | text | NO | 'draft'::text |
| `payload` | jsonb | NO | '{}'::jsonb |
| `validation_errors` | jsonb | NO | '[]'::jsonb |
| `warnings` | jsonb | NO | '[]'::jsonb |
| `expires_at` | timestamp with time zone | YES | — |
| `approved_at` | timestamp with time zone | YES | — |
| `approved_by` | uuid | YES | — |
| `rejected_at` | timestamp with time zone | YES | — |
| `rejected_by` | uuid | YES | — |
| `applied_at` | timestamp with time zone | YES | — |
| `applied_by` | uuid | YES | — |
| `applied_result` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `tour_availability_rules`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | YES | — |
| `user_id` | uuid | YES | — |
| `day_of_week` | smallint | NO | — |
| `start_time` | time without time zone | NO | — |
| `end_time` | time without time zone | NO | — |
| `timezone` | text | NO | — |
| `slot_duration_minutes` | integer | NO | — |
| `buffer_minutes` | integer | NO | 0 |
| `max_bookings_per_slot` | integer | NO | 1 |
| `approval_required` | boolean | NO | false |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `tour_bookings`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `opportunity_id` | uuid | NO | — |
| `location_id` | uuid | NO | — |
| `primary_person_id` | uuid | YES | — |
| `primary_contact_id` | uuid | YES | — |
| `requested_by_user_id` | uuid | YES | — |
| `start_at` | timestamp with time zone | NO | — |
| `end_at` | timestamp with time zone | NO | — |
| `timezone` | text | NO | — |
| `status_key` | text | NO | — |
| `source` | text | NO | — |
| `form_submission_id` | uuid | YES | — |
| `form_public_link_id` | uuid | YES | — |
| `canceled_at` | timestamp with time zone | YES | — |
| `canceled_by` | text | YES | — |
| `cancel_reason` | text | YES | — |
| `rescheduled_from_booking_id` | uuid | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `tour_public_booking_links`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `token_hash` | text | NO | — |
| `token_prefix` | text | NO | — |
| `opportunity_id` | uuid | NO | — |
| `location_id` | uuid | NO | — |
| `expires_at` | timestamp with time zone | YES | — |
| `is_active` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

## `user_access_profiles`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `user_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `department_scope` | text | NO | — |
| `site_scope` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `user_department_access`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `user_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `department_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `user_profiles`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | — |
| `role` | USER-DEFINED | NO | 'ops'::app_role |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `timezone` | text | YES | — |

## `user_roles`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `user_id` | uuid | NO | — |
| `role` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `org_id` | uuid | NO | — |

## `user_site_access`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `user_id` | uuid | NO | — |
| `org_id` | uuid | NO | — |
| `location_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `vendor_statuses`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `key` | text | NO | — |
| `label` | text | NO | — |
| `position` | integer | NO | 0 |
| `is_active` | boolean | NO | true |

## `vendor_tags`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `vendor_id` | uuid | NO | — |
| `tag_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `vendor_users`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `vendor_id` | uuid | NO | — |
| `contact_id` | uuid | NO | — |
| `role` | text | YES | — |
| `is_active` | boolean | NO | true |
| `availability_days` | ARRAY | YES | — |
| `availability_timeblocks` | ARRAY | YES | — |
| `drivers_license_file_id` | uuid | YES | — |
| `agreements` | jsonb | NO | '{}'::jsonb |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | YES | — |

## `vendor_verticals`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `vendor_id` | uuid | NO | — |
| `vertical_id` | uuid | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

## `vendors`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `name` | text | NO | — |
| `status` | text | NO | 'pending'::text |
| `email` | text | YES | — |
| `phone` | text | YES | — |
| `payout_percent` | numeric | NO | 0.70 |
| `max_daily_jobs` | integer | YES | — |
| `insurance_doc_file_id` | uuid | YES | — |
| `w9_received` | boolean | NO | false |
| `ach_verified` | boolean | NO | false |
| `primary_contact_id` | uuid | YES | — |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |
| `org_id` | uuid | NO | — |
| `service_area_zip_codes` | ARRAY | YES | — |
| `owns_supplies` | boolean | YES | — |
| `days_available` | ARRAY | YES | — |
| `operating_hours_open` | time without time zone | YES | — |
| `operating_hours_close` | time without time zone | YES | — |
| `address_line1` | text | YES | — |
| `city` | text | YES | — |
| `state` | text | YES | — |
| `postal_code` | text | YES | — |
| `drivers_license_doc_file_id` | uuid | YES | — |
| `consent_contractor_agreement` | boolean | NO | false |
| `consent_marketing` | boolean | NO | false |
| `consent_legal` | boolean | NO | false |
| `submitted_at` | timestamp with time zone | YES | — |
| `vendor_status_id` | uuid | NO | — |
| `company_name` | text | YES | — |
| `insurance_doc_path` | text | YES | — |
| `drivers_license_doc_path` | text | YES | — |
| `status_key` | text | YES | — |
| `payout_override_type` | text | YES | — |
| `payout_override_value` | numeric | YES | — |
| `primary_person_id` | uuid | YES | — |
| `vendor_number` | bigint | NO | — |

## `verticals`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `name` | text | NO | — |
| `slug` | text | NO | — |
| `is_active` | boolean | NO | true |
| `settings` | jsonb | NO | '{}'::jsonb |
| `external_source` | text | YES | — |
| `external_id` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `work_units`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `department_id` | uuid | NO | — |
| `key` | text | NO | — |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `sort_order` | integer | NO | 0 |
| `is_active` | boolean | NO | true |
| `queue_definition` | jsonb | NO | '{}'::jsonb |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | YES | — |

## `workflow_action_runs`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `workflow_run_id` | uuid | NO | — |
| `workflow_id` | uuid | NO | — |
| `action_id` | uuid | YES | — |
| `action_order` | integer | YES | — |
| `action_type` | text | YES | — |
| `status` | text | NO | 'started'::text |
| `error` | text | YES | — |
| `started_at` | timestamp with time zone | NO | now() |
| `completed_at` | timestamp with time zone | YES | — |
| `inputs` | jsonb | NO | '{}'::jsonb |
| `outputs` | jsonb | NO | '{}'::jsonb |
| `meta` | jsonb | NO | '{}'::jsonb |

## `workflow_actions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `workflow_id` | uuid | NO | — |
| `action_order` | integer | NO | — |
| `action_type` | text | NO | — |
| `target_entity` | text | YES | — |
| `payload` | jsonb | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `org_id` | uuid | YES | — |

## `workflow_conditions`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `workflow_id` | uuid | NO | — |
| `field` | text | NO | — |
| `operator` | text | NO | — |
| `value` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `org_id` | uuid | YES | — |

## `workflow_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `event_type` | text | NO | — |
| `entity_type` | text | YES | — |
| `entity_id` | uuid | YES | — |
| `action_type` | text | YES | — |
| `payload` | jsonb | NO | '{}'::jsonb |
| `occurred_at` | timestamp with time zone | NO | now() |
| `created_at` | timestamp with time zone | NO | now() |

## `workflow_run_events`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `run_id` | uuid | YES | — |
| `workflow_id` | uuid | YES | — |
| `status` | text | YES | — |
| `error` | text | YES | — |
| `started_at` | timestamp with time zone | YES | — |
| `completed_at` | timestamp with time zone | YES | — |
| `run_org_id` | uuid | YES | — |
| `event_id` | uuid | YES | — |
| `event_org_id` | uuid | YES | — |
| `event_type` | text | YES | — |
| `entity_type` | text | YES | — |
| `entity_id` | uuid | YES | — |
| `action_type` | text | YES | — |
| `occurred_at` | timestamp with time zone | YES | — |

## `workflow_runs`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `workflow_id` | uuid | NO | — |
| `event_id` | uuid | YES | — |
| `status` | text | NO | 'pending'::text |
| `error` | text | YES | — |
| `started_at` | timestamp with time zone | NO | now() |
| `completed_at` | timestamp with time zone | YES | — |
| `event_payload` | jsonb | NO | '{}'::jsonb |
| `org_id` | uuid | YES | — |

## `workflows`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `event_type` | text | NO | — |
| `entity_type` | text | NO | — |
| `enabled` | boolean | NO | true |
| `created_by` | uuid | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `org_id` | uuid | NO | — |
| `metadata` | jsonb | NO | '{}'::jsonb |

## `workspace_kpi_placement`

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | uuid | NO | gen_random_uuid() |
| `org_id` | uuid | NO | — |
| `surface` | text | NO | — |
| `department_id` | uuid | YES | — |
| `work_unit_id` | uuid | YES | — |
| `metric_key` | text | NO | — |
| `display_order` | integer | NO | 0 |
| `is_visible` | boolean | NO | true |
| `label_override` | text | YES | — |
| `format_override` | text | YES | — |
| `lane_override` | text | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

