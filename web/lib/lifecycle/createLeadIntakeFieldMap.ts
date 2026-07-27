import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { parseCustomFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import type {
    ActionIntakeValidationRule,
    ActionIntakeValueKind,
} from "@/lib/lifecycle/actionIntakeSpecTypes";

/** Lifecycle Builder entities + opportunity context fields collected on create_lead. */
export const CREATE_LEAD_INTAKE_ENTITIES: readonly LifecycleRequirementEntityKey[] = [
    "person",
    "child",
    "opportunity",
] as const;

/** Platform minimum for create_lead regardless of dept field_rules. */
export const CREATE_LEAD_PLATFORM_REQUIRED_RULE_IDS = [
    "person:first_name",
    "person:last_name",
] as const;

export const CREATE_LEAD_CONTACT_RULE_IDS = ["person:email", "person:phone"] as const;

/**
 * Code-owned Create Lead floor fields that must appear in the effective intake
 * even when not listed in stage required/recommended (email|phone via constraint).
 */
export const CREATE_LEAD_CODE_OWNED_FLOOR_RULE_IDS = [
    ...CREATE_LEAD_PLATFORM_REQUIRED_RULE_IDS,
    ...CREATE_LEAD_CONTACT_RULE_IDS,
] as const;

/** rule_id → execute payload key for create_lead. */
export const CREATE_LEAD_PAYLOAD_KEY_BY_RULE: Readonly<Record<string, string>> = {
    "person:first_name": "first_name",
    "person:last_name": "last_name",
    "person:email": "email",
    "person:phone": "phone",
    "child:first_name": "child_first_name",
    "child:last_name": "child_last_name",
    "child:date_of_birth": "child_date_of_birth",
    "child:age_group": "child_age_group",
    "child:location": "child_location_id",
    "child:program_interest": "child_program",
    "child:desired_schedule": "child_schedule_type",
    "child:start_date": "child_start_date",
    "child:classroom": "child_program_room_cohort_key",
    "opportunity:location": "location_id",
};

export function createLeadPayloadKeyForRule(ruleId: string): string | null {
    const known = CREATE_LEAD_PAYLOAD_KEY_BY_RULE[ruleId];
    if (known) return known;

    const custom = parseCustomFieldRuleId(ruleId);
    if (!custom) return null;

    if (custom.entity === "child") return `child_${custom.field_key}`;
    if (custom.entity === "person") return custom.field_key;
    if (custom.entity === "opportunity") {
        if (custom.field_key === "location_id") return "location_id";
        return `opportunity_${custom.field_key}`;
    }
    return null;
}

export function inferActionIntakeValueKind(
    ruleId: string,
    fieldKey: string | null,
    optionSetKey?: string | null,
    placementSelect?: "site" | "site_program" | "site_room" | null,
): ActionIntakeValueKind {
    if (placementSelect) return "select";
    if ((optionSetKey ?? "").trim()) return "select";
    if (ruleId.includes("email") || fieldKey === "email") return "email";
    if (ruleId.includes("phone") || fieldKey === "phone") return "phone";
    if (
        ruleId.includes("date") ||
        fieldKey === "date_of_birth" ||
        fieldKey === "start_date" ||
        fieldKey === "enrollment_date"
    ) {
        return "date";
    }
    return "text";
}

export function validationRulesForIntakeField(
    valueKind: ActionIntakeValueKind,
    tier: "required" | "recommended" | "optional"
): ActionIntakeValidationRule[] {
    if (tier !== "required") return [];
    if (valueKind === "email") return [{ kind: "email" }, { kind: "non_empty" }];
    if (valueKind === "phone") return [{ kind: "phone" }, { kind: "non_empty" }];
    if (valueKind === "date") return [{ kind: "date_iso" }];
    return [{ kind: "non_empty" }];
}
