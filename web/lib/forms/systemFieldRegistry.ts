/**
 * V1 operational registry — maps well-known entity/person fields to form schema fields.
 * Intake/linkage layers can read `field_source` on each field (see `lib/forms/schema.ts`).
 */

export type SystemFieldEntityType =
    | "child"
    | "guardian"
    | "opportunity"
    | "customer"
    | "associate"
    | "enrollment"
    | "custom";

export type SystemFieldValueKind =
    | "text"
    | "textarea"
    | "email"
    | "phone"
    | "number"
    | "date"
    | "checkbox"
    | "select"
    | "signature";

export type SystemFieldRegistryEntry = {
    /**
     * Superseded by a canonical row elsewhere. A deprecated row still RESOLVES — existing forms keep
     * working — but nothing new should bind to it, and the pickers hide it.
     */
    deprecated?: boolean;
    /** The registry id that replaces a deprecated row. */
    superseded_by?: string;
    /** Stable id used in admin UI (`sys:<id>`) and as `form_field_id`. */
    id: string;
    entity_type: SystemFieldEntityType;
    /** Same as public `values` / `shared_values` key when applicable. */
    field_key: string;
    shared_value_key?: string;
    crm_mapping_key?: string;
    default_label: string;
    default_description?: string;
    default_required: boolean;
    suggested_kind: SystemFieldValueKind;
    /** When false, show a warning if used on a public intake form (soft guard in UI only for V1). */
    public_intake_safe: boolean;
    /** Inline select rows `value|label` per line when `suggested_kind === "select"` and no default_option_set_key. */
    select_options_lines?: string;
    /** Org option set for select fields — preferred over placeholder static_options_lines. */
    default_option_set_key?: string;
};

const EMAIL_PATTERN = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";
const PHONE_PATTERN = "^[+0-9()\\-\\s]{7,}$";

export const OPERATIONAL_FORM_SYSTEM_FIELDS: readonly SystemFieldRegistryEntry[] = [
    {
        id: "child_first_name",
        entity_type: "child",
        field_key: "child_first_name",
        shared_value_key: "child_first_name",
        crm_mapping_key: "child.first_name",
        default_label: "Child first name",
        default_description: "Legal or preferred first name for the child.",
        default_required: true,
        suggested_kind: "text",
        public_intake_safe: true,
    },
    {
        id: "child_last_name",
        entity_type: "child",
        field_key: "child_last_name",
        shared_value_key: "child_last_name",
        crm_mapping_key: "child.last_name",
        default_label: "Child last name",
        default_required: true,
        suggested_kind: "text",
        public_intake_safe: true,
    },
    {
        id: "child_date_of_birth",
        entity_type: "child",
        field_key: "child_date_of_birth",
        shared_value_key: "child_date_of_birth",
        crm_mapping_key: "child.date_of_birth",
        default_label: "Child date of birth",
        default_required: true,
        suggested_kind: "date",
        public_intake_safe: true,
    },
    {
        id: "start_date",
        entity_type: "enrollment",
        field_key: "start_date",
        shared_value_key: "start_date",
        crm_mapping_key: "enrollment.start_date",
        default_label: "Desired start date",
        default_required: true,
        suggested_kind: "date",
        public_intake_safe: true,
    },
    {
        id: "guardian_first_name",
        entity_type: "guardian",
        field_key: "guardian_first_name",
        shared_value_key: "guardian_first_name",
        crm_mapping_key: "guardian.first_name",
        default_label: "Guardian first name",
        default_required: true,
        suggested_kind: "text",
        public_intake_safe: true,
    },
    {
        id: "guardian_last_name",
        entity_type: "guardian",
        field_key: "guardian_last_name",
        shared_value_key: "guardian_last_name",
        crm_mapping_key: "guardian.last_name",
        default_label: "Guardian last name",
        default_required: true,
        suggested_kind: "text",
        public_intake_safe: true,
    },
    {
        id: "guardian_email",
        entity_type: "guardian",
        field_key: "guardian_email",
        shared_value_key: "guardian_email",
        crm_mapping_key: "guardian.email",
        default_label: "Guardian email",
        default_required: true,
        suggested_kind: "email",
        public_intake_safe: true,
    },
    {
        id: "guardian_phone",
        entity_type: "guardian",
        field_key: "guardian_phone",
        shared_value_key: "guardian_phone",
        crm_mapping_key: "guardian.phone",
        default_label: "Guardian phone",
        default_required: false,
        suggested_kind: "phone",
        public_intake_safe: true,
    },
    /**
     * M1 — durable child-health truth is CHILD grain, not Enrollment grain (D-H1).
     *
     * `allergy_notes` was registered at `enrollment` grain, which says an allergy is a fact about an
     * admission. It is a fact about a child, and it outlives every admission. The canonical
     * destination is the child's own `allergies` field, which already exists.
     *
     * The correction is ADDITIVE and reversible: the child-grain row below is the canonical one, and
     * the enrollment-grain row stays, deprecated, sharing the SAME `shared_value_key`. That shared
     * identity is the no-silent-loss mechanism — ask-once dedupes on `shared_value_key` FIRST, so a
     * packet asking for allergies at either grain collects the value once and both destinations
     * receive it. Nothing is deleted, and published forms keep the binding they were stamped with.
     *
     * `medication_flag` is NOT given a child-grain replacement. Medication is a Health-foundation
     * kind (D-H5) and Enrollment must not create a competing destination for it — so the legacy row
     * stays legacy, marked deprecated, and does not become the new truth.
     */
    {
        id: "child_allergies",
        entity_type: "child",
        field_key: "allergies",
        shared_value_key: "child_allergies",
        crm_mapping_key: "child.allergies",
        default_label: "Allergies",
        default_description: "Food or environmental allergies staff should know about.",
        default_required: false,
        suggested_kind: "textarea",
        public_intake_safe: true,
    },
    {
        id: "allergy_notes",
        entity_type: "enrollment",
        field_key: "allergy_notes",
        // Shares the child-grain identity so the two never collect twice or diverge.
        shared_value_key: "child_allergies",
        crm_mapping_key: "health.allergy_notes",
        default_label: "Allergy notes",
        default_description: "Deprecated — superseded by the child-grain Allergies field.",
        default_required: false,
        suggested_kind: "textarea",
        public_intake_safe: true,
        deprecated: true,
        superseded_by: "child_allergies",
    },
    {
        id: "medication_flag",
        entity_type: "enrollment",
        field_key: "medication_flag",
        shared_value_key: "medication_flag",
        crm_mapping_key: "health.medication_flag",
        default_label: "Medication during care",
        // Legacy by direction: medication becomes a Health-foundation fact kind, not this boolean.
        default_description: "Deprecated — medication becomes a Health fact; this flag is not the new truth.",
        default_required: false,
        suggested_kind: "checkbox",
        public_intake_safe: true,
        deprecated: true,
    },
    {
        id: "program_room_preference",
        entity_type: "enrollment",
        field_key: "program_room_preference",
        shared_value_key: "program_room_preference",
        crm_mapping_key: "enrollment.program_room_cohort_key",
        default_label: "Program / room preference",
        default_required: false,
        suggested_kind: "select",
        public_intake_safe: true,
        select_options_lines: "",
    },
    {
        id: "child_site",
        entity_type: "enrollment",
        field_key: "child_site",
        shared_value_key: "child_site",
        crm_mapping_key: "enrollment.child_site",
        default_label: "Preferred school / site",
        default_description: "Preferred center or campus for this inquiry (maps to opportunity location when configured on the share link).",
        default_required: false,
        suggested_kind: "select",
        public_intake_safe: true,
    },
    {
        id: "child_room_cohort",
        entity_type: "enrollment",
        field_key: "child_room_cohort",
        shared_value_key: "child_room_cohort",
        crm_mapping_key: "enrollment.child_room_cohort",
        default_label: "Child room / cohort",
        default_description: "Waitlist room or cohort for this child.",
        default_required: false,
        suggested_kind: "select",
        public_intake_safe: true,
    },
    {
        // Canonical program field (OCM program_category_id). Forms capture the stable
        // program key from the option set; intake resolves key → category FK.
        id: "program_category_id",
        entity_type: "enrollment",
        field_key: "program_category_id",
        shared_value_key: "program_category_id",
        crm_mapping_key: "enrollment.program_category_id",
        default_label: "Desired program",
        default_required: false,
        suggested_kind: "select",
        public_intake_safe: true,
        default_option_set_key: "childcare_program_type",
    },
    {
        id: "schedule_type",
        entity_type: "enrollment",
        field_key: "schedule_type",
        shared_value_key: "schedule_type",
        crm_mapping_key: "enrollment.schedule_type",
        default_label: "Desired schedule",
        default_required: false,
        suggested_kind: "select",
        public_intake_safe: true,
        default_option_set_key: "childcare_schedule_type",
    },
    {
        id: "lead_site",
        entity_type: "opportunity",
        field_key: "lead_site",
        shared_value_key: "lead_site",
        crm_mapping_key: "opportunity.location_id",
        default_label: "Lead location",
        default_description: "Site or campus for this lead (opportunities.location_id).",
        default_required: false,
        suggested_kind: "select",
        public_intake_safe: true,
    },
    {
        id: "opportunity_interest_notes",
        entity_type: "opportunity",
        field_key: "opportunity_interest_notes",
        crm_mapping_key: "opportunity.interest_notes",
        default_label: "Inquiry message",
        default_description: "Optional message from the family about their interest or questions.",
        default_required: false,
        suggested_kind: "textarea",
        public_intake_safe: true,
    },
    {
        id: "customer_account_name",
        entity_type: "customer",
        field_key: "customer_account_name",
        crm_mapping_key: "customer.display_name",
        default_label: "Account name",
        default_required: false,
        suggested_kind: "text",
        public_intake_safe: false,
    },
    {
        id: "enrollment_acknowledgement_signature",
        entity_type: "enrollment",
        field_key: "enrollment_acknowledgement_signature",
        shared_value_key: "enrollment_acknowledgement_signature",
        default_label: "Policies acknowledgement",
        default_description: "Typed or drawn acknowledgement as required by your policy.",
        default_required: true,
        suggested_kind: "signature",
        public_intake_safe: true,
    },
] as const;

export const SYSTEM_FIELD_BY_ID: ReadonlyMap<string, SystemFieldRegistryEntry> = new Map(
    OPERATIONAL_FORM_SYSTEM_FIELDS.map((e) => [e.id, e])
);

export function linesToStaticOptions(raw: string): { value: string; label: string }[] {
    const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const out: { value: string; label: string }[] = [];
    for (const line of lines) {
        const pipe = line.indexOf("|");
        if (pipe === -1) out.push({ value: line, label: line });
        else
            out.push({
                value: line.slice(0, pipe).trim(),
                label: line.slice(pipe + 1).trim() || line.slice(0, pipe).trim(),
            });
    }
    return out.length ? out : [{ value: "a", label: "Option A" }];
}

export { EMAIL_PATTERN, PHONE_PATTERN };
