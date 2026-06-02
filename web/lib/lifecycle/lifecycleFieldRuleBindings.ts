/**
 * Internal bindings from lifecycle field rule ids → runtime value paths and form capture keys.
 * Operator UI never shows rule ids or field keys.
 */

import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

export type LifecycleFieldValueSource = "primary_person" | "inquiry_child" | "opportunity" | "opportunity_metadata";

export type LifecycleFieldRuleBinding = {
    rule_id: string;
    entity: LifecycleRequirementEntityKey;
    /** Org field_definitions.field_key when applicable */
    field_key: string | null;
    value_source: LifecycleFieldValueSource;
    /** inquiry_child / OCM column when value_source is inquiry_child */
    ocm_field?:
        | "first_name"
        | "last_name"
        | "desired_program_type"
        | "program_room_cohort_key"
        | "desired_schedule_type"
        | "desired_start_date";
    /** opportunity.values or metadata key when value_source is opportunity* */
    opportunity_field?: string;
    metadata_key?: string;
    /** Shared form values keys, system field ids, and label match tokens */
    form_capture_keys: readonly string[];
    runtime_enforced: boolean;
    form_coverage_supported: boolean;
};

export const LIFECYCLE_FIELD_RULE_BINDINGS: readonly LifecycleFieldRuleBinding[] = [
    {
        rule_id: "person:first_name",
        entity: "person",
        field_key: "first_name",
        value_source: "primary_person",
        form_capture_keys: ["guardian_first_name", "first_name", "First Name", "Guardian first name"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "person:last_name",
        entity: "person",
        field_key: "last_name",
        value_source: "primary_person",
        form_capture_keys: ["guardian_last_name", "last_name", "Last Name", "Guardian last name"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "person:email",
        entity: "person",
        field_key: "email",
        value_source: "primary_person",
        form_capture_keys: ["guardian_email", "email", "Email", "Guardian email"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "person:phone",
        entity: "person",
        field_key: "phone",
        value_source: "primary_person",
        form_capture_keys: ["guardian_phone", "phone", "Phone", "Guardian phone"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:first_name",
        entity: "child",
        field_key: "first_name",
        value_source: "inquiry_child",
        ocm_field: "first_name",
        form_capture_keys: ["child_first_name", "Child first name", "First Name"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:last_name",
        entity: "child",
        field_key: "last_name",
        value_source: "inquiry_child",
        ocm_field: "last_name",
        form_capture_keys: ["child_last_name", "Child last name", "Last Name"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:date_of_birth",
        entity: "child",
        field_key: "date_of_birth",
        value_source: "inquiry_child",
        form_capture_keys: ["child_date_of_birth", "Child date of birth", "Date of Birth", "DOB"],
        runtime_enforced: false,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:age_group",
        entity: "child",
        field_key: "age_group",
        value_source: "inquiry_child",
        form_capture_keys: ["age_group", "Age Group", "Age group"],
        runtime_enforced: false,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:program_interest",
        entity: "child",
        field_key: "desired_program_type",
        value_source: "inquiry_child",
        ocm_field: "desired_program_type",
        form_capture_keys: ["desired_program_type", "Desired program", "Program Interest", "Program"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:desired_schedule",
        entity: "child",
        field_key: "desired_schedule_type",
        value_source: "inquiry_child",
        ocm_field: "desired_schedule_type",
        form_capture_keys: ["desired_schedule_type", "Desired schedule", "Schedule Type", "Desired Schedule"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:desired_start_date",
        entity: "child",
        field_key: "desired_start_date",
        value_source: "inquiry_child",
        ocm_field: "desired_start_date",
        form_capture_keys: ["desired_start_date", "Desired start date", "Start Date", "Desired Start Date"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:classroom",
        entity: "child",
        field_key: "program_room_cohort_key",
        value_source: "inquiry_child",
        ocm_field: "program_room_cohort_key",
        form_capture_keys: ["program_room_preference", "child_room_cohort", "Classroom", "Room"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "child:start_date",
        entity: "child",
        field_key: "desired_start_date",
        value_source: "inquiry_child",
        ocm_field: "desired_start_date",
        form_capture_keys: ["desired_start_date", "Start Date"],
        runtime_enforced: true,
        form_coverage_supported: true,
    },
    {
        rule_id: "opportunity:tour_date",
        entity: "opportunity",
        field_key: "tour_date",
        value_source: "opportunity_metadata",
        opportunity_field: "tour_date",
        metadata_key: "tour_date",
        form_capture_keys: ["Tour Date", "tour_date"],
        runtime_enforced: false,
        form_coverage_supported: true,
    },
    {
        rule_id: "opportunity:tour_time",
        entity: "opportunity",
        field_key: "tour_time",
        value_source: "opportunity_metadata",
        opportunity_field: "tour_time",
        metadata_key: "tour_time",
        form_capture_keys: ["Tour Time", "tour_time"],
        runtime_enforced: false,
        form_coverage_supported: true,
    },
    {
        rule_id: "opportunity:tour_outcome",
        entity: "opportunity",
        field_key: "tour_outcome",
        value_source: "opportunity",
        opportunity_field: "outcome",
        form_capture_keys: ["Tour Outcome", "outcome"],
        runtime_enforced: false,
        form_coverage_supported: false,
    },
    {
        rule_id: "opportunity:enrollment_date",
        entity: "opportunity",
        field_key: "enrollment_date",
        value_source: "opportunity_metadata",
        metadata_key: "enrollment_date",
        form_capture_keys: ["Enrollment Date"],
        runtime_enforced: false,
        form_coverage_supported: false,
    },
    {
        rule_id: "opportunity:enrollment_packet",
        entity: "opportunity",
        field_key: null,
        value_source: "opportunity",
        form_capture_keys: ["Enrollment Packet", "Packet Status"],
        runtime_enforced: false,
        form_coverage_supported: false,
    },
] as const;

const BINDINGS_BY_RULE_ID = new Map(LIFECYCLE_FIELD_RULE_BINDINGS.map((b) => [b.rule_id, b]));

export function lifecycleFieldRuleBinding(ruleId: string): LifecycleFieldRuleBinding | null {
    return BINDINGS_BY_RULE_ID.get(ruleId) ?? null;
}

export function customFieldRuleId(entity: LifecycleRequirementEntityKey, fieldKey: string): string {
    return `custom:${entity}:${fieldKey}`;
}

export function parseCustomFieldRuleId(ruleId: string): { entity: LifecycleRequirementEntityKey; field_key: string } | null {
    const m = /^custom:(person|child|opportunity|customer):(.+)$/.exec(ruleId.trim());
    if (!m) return null;
    return { entity: m[1] as LifecycleRequirementEntityKey, field_key: m[2]! };
}

/** DB entity_type → lifecycle entity key */
export function lifecycleEntityFromFieldDefinitionEntityType(entityType: string): LifecycleRequirementEntityKey | null {
    const t = entityType.trim().toLowerCase();
    if (t === "person" || t === "persons") return "person";
    if (t === "inquiry_child") return "child";
    if (t === "opportunity" || t === "opportunities") return "opportunity";
    if (t === "customer" || t === "customers") return "customer";
    return null;
}
