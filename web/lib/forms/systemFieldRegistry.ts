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
    /** Inline select rows `value|label` per line when `suggested_kind === "select"` and no default_option_set_key. */
    select_options_lines?: string;
    /** Org option set for select fields — preferred over placeholder static_options_lines. */
    default_option_set_key?: string;
    /**
     * Superseded by a canonical owner. The entry stays so existing forms keep resolving, but nothing
     * offers it for NEW authoring — deleting it would break a form that already binds it, while
     * keeping it offerable would let an operator recreate the duplicate owner it was retired for.
     */
    deprecated_reason?: string;
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
    {
        /*
         * M1 / D-H1 — RE-BOUND FROM `enrollment` TO THE CHILD.
         *
         * An allergy is a property of a CHILD, not of an enrolment episode. Bound to the episode it
         * did not follow the child into next year's re-enrolment, and two of the three Forms
         * subsystems already disagreed with the shipped grain: `canonicalBindingSuggestions`
         * suggests `customer_member` for allergy text, and `sharedValuesToFieldIds`'s canonical
         * example is literally `customer_member:allergies`.
         *
         * `crm_mapping_key` now points at the SAME destination the child profile field already uses,
         * so there is ONE durable owner rather than `health.allergy_notes` and `child.allergies`
         * both claiming to be the answer.
         */
        id: "allergy_notes",
        entity_type: "child",
        field_key: "allergy_notes",
        shared_value_key: "allergy_notes",
        crm_mapping_key: "child.allergies",
        default_label: "Allergy notes",
        default_description: "Food or environmental allergies staff should know about.",
        default_required: false,
        suggested_kind: "textarea",
        public_intake_safe: true,
    },
    {
        /*
         * M3 — DEPRECATED, NOT MIGRATED.
         *
         * "This child takes medication" is DERIVABLE from the medication facts once H1 lands, and
         * keeping both creates two answers to one question — one of which no longer updates when a
         * medication is added or ended. So the boolean is retired rather than re-bound: it is
         * re-grained to the child so any existing form keeps resolving, and marked deprecated so
         * nothing offers it for new authoring.
         */
        id: "medication_flag",
        entity_type: "child",
        field_key: "medication_flag",
        shared_value_key: "medication_flag",
        crm_mapping_key: "child.medication_flag",
        default_label: "Medication during care",
        default_description: "Whether the child takes medication while in care.",
        default_required: false,
        suggested_kind: "checkbox",
        public_intake_safe: true,
        deprecated_reason:
            "Superseded by canonical medication facts (person_health_facts, fact_kind = medication). "
            + "Derive it from the medication collection instead of storing a second answer.",
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

/**
 * The fields an operator may bind on a NEW form.
 *
 * Deprecated entries stay in `OPERATIONAL_FORM_SYSTEM_FIELDS` so a form that already binds one keeps
 * resolving — removing them would break live forms — but they are not offered again. Without this
 * split, retiring `medication_flag` would be advice rather than a rule, and the next operator would
 * recreate the second answer it was retired for.
 */
export const AUTHORABLE_FORM_SYSTEM_FIELDS: readonly SystemFieldRegistryEntry[] =
    OPERATIONAL_FORM_SYSTEM_FIELDS.filter((e) => !e.deprecated_reason);

export function isDeprecatedSystemField(id: string): boolean {
    return Boolean(SYSTEM_FIELD_BY_ID.get(id.trim())?.deprecated_reason);
}

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
