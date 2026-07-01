/**
 * Explicit Supabase SELECT columns for canonical CRM entities (Phase 4).
 *
 * Excludes legacy text `status` columns — use status_key + status_definitions instead.
 */

/** Full opportunity row for admin drawer hydrate (excludes legacy opportunities.status). */
export const OPPORTUNITY_CANONICAL_ADMIN_SELECT =
    "id, org_id, vertical_id, customer_id, primary_contact_id, primary_person_id, location_id, name, title, pipeline_id, pipeline_stage_id, status_key, source, lost_reason, assigned_to, job_date, job_time_window, appointment_id, customer_notes, monetary_value_cents, estimated_price_cents, recurring_price_cents, price_breakdown, external_source, external_id, metadata, created_at, updated_at, discount_code_id, discount_code, quote_subtotal, discount_amount, quote_total, discount_validated_at, discount_program_id, opportunity_number, quote_is_overridden, quote_override_total, quote_override_reason, work_unit_id";

/** Legacy-admin opportunity list (excludes legacy status text). */
export const OPPORTUNITY_CANONICAL_LEGACY_ADMIN_LIST_SELECT =
    "id, created_at, updated_at, opportunity_number, name, status_key, job_date, job_time_window, quote_total, customer_id, primary_contact_id, primary_person_id, external_id, vertical_id, source, estimated_price_cents, monetary_value_cents";

/** Customer entity GET for admin drawer (excludes legacy customers.status). */
export const CUSTOMER_CANONICAL_ADMIN_SELECT =
    "id, org_id, customer_number, created_at, updated_at, name, status_key, customer_type, primary_contact_id, vertical_id, metadata, stripe_customer_id, external_source, external_id, default_payment_method_id, payment_method_brand, payment_method_last4, setup_intent_id";

/** Customer list GET for admin (excludes legacy customers.status). */
export const CUSTOMER_CANONICAL_LIST_SELECT =
    "id, customer_number, created_at, updated_at, name, status_key, customer_type, primary_contact_id, vertical_id, org_id, metadata, stripe_customer_id, external_source, external_id, default_payment_method_id, payment_method_brand, payment_method_last4, setup_intent_id";

/** Person identity fetch — status_key only (excludes legacy persons.status). */
export const PERSON_CANONICAL_IDENTITY_SELECT =
    "id, org_id, first_name, last_name, full_name, preferred_name, email, phone, date_of_birth, status_key, archived_at, metadata, created_at, updated_at";

/** Contacts compatibility projection — NOT canonical person identity. Messaging / legacy-admin only. */
export const CONTACT_COMPAT_SELECT =
    "id, org_id, person_id, first_name, last_name, email, phone, company_name, status_key, customer_id, vendor_id, contact_type, notes, metadata, archived_at, created_at, updated_at";

/** Opportunity row for workflow/event payload enrichment (excludes legacy status). */
export const OPPORTUNITY_CANONICAL_WORKFLOW_SELECT = OPPORTUNITY_CANONICAL_ADMIN_SELECT;

/** Lightweight opportunity fetch for operational task enrichment. */
export const OPPORTUNITY_CANONICAL_TASK_ENRICHMENT_SELECT =
    "id, name, title, status_key, customer_id, primary_person_id, location_id, metadata";

/** Paths that must not use select("*") on canonical CRM entity tables. */
export const CANONICAL_CRM_ENTITY_TABLES = ["opportunities", "persons", "customers"] as const;
