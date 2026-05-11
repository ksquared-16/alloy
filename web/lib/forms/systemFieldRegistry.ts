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
    /** Inline select rows `value|label` per line when `suggested_kind === "select"`. */
    select_options_lines?: string;
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
        id: "desired_start_date",
        entity_type: "enrollment",
        field_key: "desired_start_date",
        shared_value_key: "desired_start_date",
        crm_mapping_key: "enrollment.desired_start_date",
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
    {
        id: "allergy_notes",
        entity_type: "enrollment",
        field_key: "allergy_notes",
        shared_value_key: "allergy_notes",
        crm_mapping_key: "health.allergy_notes",
        default_label: "Allergy notes",
        default_description: "Food or environmental allergies staff should know about.",
        default_required: false,
        suggested_kind: "textarea",
        public_intake_safe: true,
    },
    {
        id: "medication_flag",
        entity_type: "enrollment",
        field_key: "medication_flag",
        shared_value_key: "medication_flag",
        crm_mapping_key: "health.medication_flag",
        default_label: "Medication during care",
        default_description: "Whether the child takes medication while in care.",
        default_required: false,
        suggested_kind: "checkbox",
        public_intake_safe: true,
    },
    {
        id: "program_room_preference",
        entity_type: "enrollment",
        field_key: "program_room_preference",
        shared_value_key: "program_room_preference",
        crm_mapping_key: "enrollment.program_room_preference",
        default_label: "Program / room preference",
        default_required: false,
        suggested_kind: "select",
        public_intake_safe: true,
        select_options_lines: "infant|Infant\ntoddler|Toddler\npreschool|Preschool\nschool_age|School age",
    },
    {
        id: "opportunity_interest_notes",
        entity_type: "opportunity",
        field_key: "opportunity_interest_notes",
        crm_mapping_key: "opportunity.interest_notes",
        default_label: "Interest / tour notes",
        default_required: false,
        suggested_kind: "textarea",
        public_intake_safe: false,
    },
    {
        id: "customer_account_name",
        entity_type: "customer",
        field_key: "customer_account_name",
        crm_mapping_key: "customer.display_name",
        default_label: "Account / household name",
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
