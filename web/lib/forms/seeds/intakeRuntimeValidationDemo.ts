/**
 * Runtime validation fixture — schema + link metadata templates for FD-14 manual QA.
 *
 * Not a compliance form. Use with org seed script or AdminV2 publish + link mint.
 * See `docs/system/forms-intake-runtime-validation.md`.
 */

import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

export const INTAKE_RUNTIME_VALIDATION_FORM_KEY = "intake_runtime_validation_v1" as const;

export const INTAKE_RUNTIME_VALIDATION_PUBLIC_TOKEN = "alloy_intake_runtime_validation_v1" as const;

const childFirst = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === "child_first_name")!;
const childLast = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === "child_last_name")!;

/** CRM column hints for existing-record / packet prefill smoke. */
export const INTAKE_RUNTIME_VALIDATION_PREFILL_FIELD_MAP = {
    child_first_name: "customer_member.first_name",
    child_last_name: "customer_member.last_name",
    guardian_name: "customer.name",
} as const;

export const INTAKE_RUNTIME_VALIDATION_DEFINITION_METADATA = {
    demo: true,
    runtime_validation_fixture: true,
    prefill_field_map: INTAKE_RUNTIME_VALIDATION_PREFILL_FIELD_MAP,
    operator_context: {
        purpose:
            "FD-14 runtime validation fixture — exercises prefilled vs blank fields, signature capture, and configurable intake outcomes.",
        who_completes: "QA operator or scripted smoke using public link, embed, or packet step.",
        after_submission:
            "Verify submission inbox, review console, and CRM linkage match link metadata — opportunity creation is opt-in only.",
    },
} as const;

/**
 * Canonical field set for runtime validation (Part C).
 * - Child first/last: prefilled when launch context + map exist
 * - Child DOB, notes: blank/manual
 * - Guardian name: prefilled or manual
 * - Signature: required
 */
export const INTAKE_RUNTIME_VALIDATION_SCHEMA = {
    schema_version: 1 as const,
    title: "Intake Runtime Validation",
    sections: [
        {
            id: "sec_child",
            title: "Child",
            field_ids: ["child_first_name", "child_last_name", "child_dob"],
        },
        {
            id: "sec_guardian",
            title: "Guardian",
            field_ids: ["guardian_name"],
        },
        {
            id: "sec_notes",
            title: "Additional",
            field_ids: ["notes", "signature_guardian"],
        },
    ],
    fields: [
        formFieldFromRegistryEntry(childFirst, {}),
        formFieldFromRegistryEntry(childLast, {}),
        {
            id: "child_dob",
            type: "date" as const,
            label: "Child date of birth",
            required: false,
            field_source: { entity_type: "custom", field_key: "unmapped" },
        },
        {
            id: "guardian_name",
            type: "text" as const,
            label: "Guardian name",
            required: true,
            field_source: { entity_type: "custom", field_key: "unmapped" },
        },
        {
            id: "notes",
            type: "text" as const,
            label: "Notes",
            required: false,
            multiline: true,
            field_source: { entity_type: "custom", field_key: "unmapped" },
        },
        {
            id: "signature_guardian",
            type: "signature" as const,
            label: "Guardian signature",
            required: true,
            signature: {
                require_acknowledgment: false,
                require_typed_name: true,
                require_drawn_asset: false,
            },
        },
    ],
} as const;

/** Production-safe default — submission stores payload only; no CRM auto-create. */
export const INTAKE_RUNTIME_VALIDATION_LINK_METADATA_STANDARD = {
    label: "Runtime validation — standard (no auto CRM)",
    form_context_mode: "lead_capture" as const,
    lead_capture: false,
    intake: false,
    mode: "standard" as const,
    auto_create_person: false,
    auto_create_customer: false,
    auto_create_customer_member: false,
    auto_create_opportunity: false,
} as const;

/**
 * Opportunity intake outcome — only when operator explicitly enables on the link.
 * Requires `default_vertical_id` at mint time (org-specific UUID).
 */
export const INTAKE_RUNTIME_VALIDATION_LINK_METADATA_OPPORTUNITY_INTAKE = {
    label: "Runtime validation — opportunity intake",
    form_context_mode: "lead_capture" as const,
    lead_capture: true,
    intake: true,
    mode: "intake" as const,
    auto_create_person: true,
    auto_create_customer: true,
    auto_create_customer_member: true,
    auto_create_opportunity: true,
    intake_field_paths: {
        guardian_email: "values.guardian_email",
        guardian_phone: "values.guardian_phone",
        guardian_first_name: "values.guardian_name",
        child_first_name: "values.child_first_name",
        child_last_name: "values.child_last_name",
        child_dob: "values.child_dob",
    },
} as const;

/** Existing-record launch — prefill from bound entity; no cold opportunity create unless flags set. */
export const INTAKE_RUNTIME_VALIDATION_LINK_METADATA_EXISTING_RECORD = {
    label: "Runtime validation — existing record prefill",
    form_context_mode: "existing_record" as const,
    prefill_enabled: true,
    allow_auto_create: false,
    prefill_field_map: INTAKE_RUNTIME_VALIDATION_PREFILL_FIELD_MAP,
    auto_create_opportunity: false,
} as const;

/** Embed smoke — same renderer as public; origin allowlist on link row. */
export const INTAKE_RUNTIME_VALIDATION_LINK_METADATA_EMBED = {
    ...INTAKE_RUNTIME_VALIDATION_LINK_METADATA_STANDARD,
    label: "Runtime validation — embed",
    embed_mode: true,
} as const;

/** Packet step — attach to session; outcome follows packet launch + step link metadata. */
export const INTAKE_RUNTIME_VALIDATION_LINK_METADATA_PACKET_STEP = {
    form_context_mode: "packet" as const,
    prefill_enabled: true,
    allow_auto_create: false,
    auto_create_opportunity: false,
} as const;
