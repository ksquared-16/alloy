/**
 * Demo / example-only form (not an official state compliance form).
 * DB seed: `supabase/migrations/20260506120000_forms_medication_authorization_demo_seed.sql` (idempotent; optional org).
 * Demo option_sets/items: `supabase/migrations/20260507130000_forms_medication_demo_option_sets.sql`.
 */
export const MEDICATION_AUTHORIZATION_DEMO_FORM_KEY = "medication_authorization_demo" as const;

/** Seeded `item_key` values for `med_demo_schedule` (must stay aligned with demo option_sets migration). */
export const MEDICATION_DEMO_SCHEDULE_ITEM_KEYS = ["daily", "twice_daily", "as_needed", "other"] as const;

/** Seeded `item_key` values for `med_demo_route` (must stay aligned with demo option_sets migration). */
export const MEDICATION_DEMO_ROUTE_ITEM_KEYS = ["oral", "topical", "inhaled", "injection", "other"] as const;

/** Plaintext token for the optional public link row (hash stored in DB). */
export const MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN = "alloy_demo_medication_authorization_v1" as const;

export const MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA = {
    demo: true,
    compliance_status: "example_only",
    not_official_state_form: true,
} as const;

export const MEDICATION_AUTHORIZATION_DEMO_VERSION_METADATA = {
    demo: true,
    compliance_status: "example_only",
} as const;

export const MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING = {
    engine: "stub_v1",
    template_key: "medication_authorization_demo_v1",
    slots: {
        child_first: { path: "values.child_first_name" },
        child_last: { path: "values.child_last_name" },
        dob: { path: "values.child_dob" },
        guardian_name: { path: "values.guardian_full_name" },
        med_name: { path: "groups.medications.0.values.med_name" },
        med_schedule: { path: "groups.medications.0.values.schedule" },
        sig_line: { path: "signatures.signature_guardian.typed_full_name" },
    },
} as const;

/** Validates via `validateFormSchema` in tests and `resolve` GET for published rows. */
export const MEDICATION_AUTHORIZATION_DEMO_SCHEMA = {
    schema_version: 1 as const,
    title: "Medication Authorization — Demo",
    sections: [
        { id: "sec_child", title: "Child", field_ids: ["child_first_name", "child_last_name", "child_dob"] },
        {
            id: "sec_guardian",
            title: "Guardian",
            field_ids: ["guardian_full_name", "guardian_email", "guardian_phone"],
        },
        {
            id: "sec_instructions",
            title: "Instructions",
            field_ids: ["needs_special_instructions", "special_instructions"],
        },
        { id: "sec_meds", title: "Medications", field_ids: ["medications"] },
        {
            id: "sec_auth",
            title: "Authorization",
            field_ids: ["authorization_acknowledgement", "signature_guardian"],
        },
    ],
    fields: [
        {
            id: "child_first_name",
            type: "text",
            label: "Child first name",
            required: true,
            pdf_slot: "child_first",
        },
        {
            id: "child_last_name",
            type: "text",
            label: "Child last name",
            required: true,
            pdf_slot: "child_last",
        },
        {
            id: "child_dob",
            type: "date",
            label: "Child date of birth",
            required: true,
            pdf_slot: "dob",
        },
        {
            id: "guardian_full_name",
            type: "text",
            label: "Guardian full name",
            required: true,
            pdf_slot: "guardian_name",
        },
        {
            id: "guardian_email",
            type: "text",
            label: "Guardian email",
            required: true,
            validate: { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
        },
        {
            id: "guardian_phone",
            type: "text",
            label: "Guardian phone",
            required: false,
        },
        {
            id: "needs_special_instructions",
            type: "boolean",
            label: "Add special administration instructions?",
            required: true,
        },
        {
            id: "special_instructions",
            type: "text",
            label: "Special instructions",
            required: false,
            visibility: {
                all: [{ field_id: "needs_special_instructions", op: "eq", value: true }],
            },
            validate: { max_length: 2000 },
        },
        {
            id: "medications",
            type: "group",
            label: "Medications",
            required: true,
            repeat: { min: 1, max: 5 },
            fields: [
                {
                    id: "med_name",
                    type: "text",
                    label: "Medication name",
                    required: true,
                    pdf_slot: "med_name",
                },
                {
                    id: "dose_strength",
                    type: "text",
                    label: "Dose / strength",
                    required: true,
                },
                {
                    id: "schedule",
                    type: "select",
                    label: "Schedule",
                    option_set_key: "med_demo_schedule",
                    required: true,
                    pdf_slot: "med_schedule",
                },
                {
                    id: "route",
                    type: "multiselect",
                    label: "Route(s)",
                    option_set_key: "med_demo_route",
                    required: false,
                },
            ],
        },
        {
            id: "authorization_acknowledgement",
            type: "boolean",
            label: "I confirm this demo authorization is for testing only and is not an official state form.",
            required: true,
        },
        {
            id: "signature_guardian",
            type: "signature",
            label: "Guardian signature",
            required: true,
            pdf_slot: "sig_line",
            signature: {
                require_acknowledgment: true,
                require_typed_name: true,
                require_drawn_asset: false,
            },
            visibility: {
                all: [{ field_id: "authorization_acknowledgement", op: "eq", value: true }],
            },
        },
    ],
} as const;
