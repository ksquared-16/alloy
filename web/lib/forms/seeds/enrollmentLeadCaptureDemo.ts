/**
 * Demo enrollment lead capture form — guardian-only intake without child member auto-create.
 * Used to prove forms create real opportunities/leads (IC-5.6), separate from Medication Authorization.
 */
export const ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY = "enrollment_lead_capture_demo" as const;

/** Plaintext token for optional public link row (hash stored in DB). */
export const ENROLLMENT_LEAD_CAPTURE_DEMO_PUBLIC_TOKEN = "alloy_demo_enrollment_lead_capture_v1" as const;

export const ENROLLMENT_LEAD_CAPTURE_DEMO_DEFINITION_METADATA = {
    demo: true,
    intake_purpose: "enrollment_lead",
} as const;

export const ENROLLMENT_LEAD_CAPTURE_DEMO_OPERATOR_CONTEXT = {
    purpose:
        "Capture a new enrollment lead from a parent or guardian. Use this demo link to prove intake creates a real lead in the enrollment pipeline.",
    who_completes: "A parent or guardian completes this using the public link or embed you share.",
    after_submission:
        "A new lead appears in enrollment intake and the CRM pipeline when lead capture is enabled on the distribution link.",
    connected_notes: "Does not auto-create child profiles — high-confidence intake can auto-operationalize to Recent.",
} as const;

export const ENROLLMENT_LEAD_CAPTURE_DEMO_VERSION_METADATA = {
    demo: true,
} as const;

/** Validates via `validateFormSchema` in tests. */
export const ENROLLMENT_LEAD_CAPTURE_DEMO_SCHEMA = {
    schema_version: 1 as const,
    title: "Enrollment Lead — Demo",
    sections: [
        {
            id: "sec_contact",
            title: "Contact",
            field_ids: ["guardian_full_name", "guardian_email", "guardian_phone"],
        },
        {
            id: "sec_interest",
            title: "Enrollment interest",
            field_ids: ["child_first_name", "start_date", "notes"],
        },
    ],
    fields: [
        {
            id: "guardian_full_name",
            type: "text",
            label: "Parent or guardian name",
            required: true,
        },
        {
            id: "guardian_email",
            type: "text",
            label: "Email",
            required: true,
            validate: { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
        },
        {
            id: "guardian_phone",
            type: "text",
            label: "Phone",
            required: true,
        },
        {
            id: "child_first_name",
            type: "text",
            label: "Child first name (optional)",
            required: false,
        },
        {
            id: "start_date",
            type: "date",
            label: "Desired start date (optional)",
            required: false,
        },
        {
            id: "notes",
            type: "text",
            label: "Notes (optional)",
            required: false,
            multiline: true,
            validate: { max_length: 2000 },
        },
    ],
} as const;
