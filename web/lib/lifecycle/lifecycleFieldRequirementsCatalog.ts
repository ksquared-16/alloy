/**
 * Lifecycle Builder — configurable field requirements by entity (operator labels only in UI).
 * Rule ids are internal stable keys; never shown to operators.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { platformLifecycleProgressionRequirementsForStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { lifecycleStageLabelPalette } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { isDeprecatedLifecycleFieldRule } from "@/lib/lifecycle/lifecycleConfiguration";
import { lifecycleFieldRuleBinding, parseCustomFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";

export type LifecycleRequirementEntityKey = "person" | "child" | "opportunity" | "customer";

export type LifecycleRequirementEntityDefinition = {
    key: LifecycleRequirementEntityKey;
    label: string;
    description: string;
};

export const LIFECYCLE_REQUIREMENT_ENTITIES: readonly LifecycleRequirementEntityDefinition[] = [
    {
        key: "person",
        label: "Person",
        description: "Parent or guardian on the inquiry.",
    },
    {
        key: "child",
        label: "Child",
        description: "Child row on the inquiry (program, schedule, placement).",
    },
    {
        key: "opportunity",
        label: "Opportunity",
        description: "Inquiry-level dates and tour outcomes.",
    },
    {
        key: "customer",
        label: "Customer",
        description: "Household or account on the inquiry.",
    },
] as const;

export type LifecycleFieldRequirementDefinition = {
    /** Internal stable id — not shown in Settings UI */
    rule_id: string;
    entity: LifecycleRequirementEntityKey;
    field_label: string;
    /** When true, runtime may evaluate this rule (object-level preflight still applies). */
    runtime_enforced: boolean;
    /** Stages where this field may be configured (empty = all palette stages). */
    stages?: readonly LifecycleOperatorStage[];
};

export const LIFECYCLE_FIELD_REQUIREMENT_CATALOG: readonly LifecycleFieldRequirementDefinition[] = [
    { rule_id: "person:first_name", entity: "person", field_label: "First Name", runtime_enforced: false },
    { rule_id: "person:last_name", entity: "person", field_label: "Last Name", runtime_enforced: false },
    { rule_id: "person:email", entity: "person", field_label: "Email", runtime_enforced: false },
    { rule_id: "person:phone", entity: "person", field_label: "Phone", runtime_enforced: false },
    { rule_id: "child:first_name", entity: "child", field_label: "First Name", runtime_enforced: false },
    { rule_id: "child:last_name", entity: "child", field_label: "Last Name", runtime_enforced: false },
    {
        rule_id: "child:date_of_birth",
        entity: "child",
        field_label: "Date of Birth",
        runtime_enforced: false,
    },
    {
        rule_id: "child:age_group",
        entity: "child",
        field_label: "Age Group",
        runtime_enforced: false,
    },
    {
        rule_id: "child:program_interest",
        entity: "child",
        field_label: "Program",
        runtime_enforced: true,
    },
    {
        rule_id: "child:desired_schedule",
        entity: "child",
        field_label: "Desired Schedule",
        runtime_enforced: true,
    },
    {
        rule_id: "child:start_date",
        entity: "child",
        field_label: "Desired Start Date",
        runtime_enforced: true,
        stages: ["waitlist", "enrollment"],
    },
    {
        rule_id: "child:location",
        entity: "child",
        field_label: "Site / Location",
        runtime_enforced: false,
        stages: ["waitlist"],
    },
    {
        rule_id: "opportunity:location",
        entity: "opportunity",
        field_label: "Location",
        runtime_enforced: false,
        stages: ["lead", "qualification"],
    },
    {
        rule_id: "child:waitlist_priority",
        entity: "child",
        field_label: "Priority / Waitlist Criteria",
        runtime_enforced: false,
        stages: ["waitlist"],
    },
    {
        rule_id: "child:classroom",
        entity: "child",
        field_label: "Classroom or Room",
        runtime_enforced: true,
    },
    {
        rule_id: "child:start_date",
        entity: "child",
        field_label: "Requested Start",
        runtime_enforced: true,
    },
    {
        rule_id: "child:requested_days_per_week",
        entity: "child",
        field_label: "Requested days per week",
        runtime_enforced: true,
    },
    {
        rule_id: "child:preferred_weekdays",
        entity: "child",
        field_label: "Preferred days",
        runtime_enforced: true,
    },
    {
        rule_id: "child:tuition_plan",
        entity: "child",
        field_label: "Tuition plan",
        runtime_enforced: true,
    },
    {
        rule_id: "child:quote_accepted",
        entity: "child",
        field_label: "Quote accepted",
        runtime_enforced: true,
    },
    {
        rule_id: "opportunity:tour_date",
        entity: "opportunity",
        field_label: "Tour Date",
        runtime_enforced: false,
        stages: ["tour"],
    },
    {
        rule_id: "opportunity:tour_time",
        entity: "opportunity",
        field_label: "Tour Time",
        runtime_enforced: false,
        stages: ["tour"],
    },
    {
        rule_id: "opportunity:tour_outcome",
        entity: "opportunity",
        field_label: "Tour Outcome",
        runtime_enforced: false,
        stages: ["tour"],
    },
    {
        rule_id: "opportunity:enrollment_date",
        entity: "opportunity",
        field_label: "Enrollment Date",
        runtime_enforced: false,
        stages: ["enrolled"],
    },
    {
        rule_id: "opportunity:enrollment_packet",
        entity: "opportunity",
        field_label: "Enrollment Packet Reviewed",
        runtime_enforced: false,
        stages: ["enrollment"],
    },
] as const;

const CATALOG_BY_ID = new Map(LIFECYCLE_FIELD_REQUIREMENT_CATALOG.map((f) => [f.rule_id, f]));

/** Expand platform object label → default field rule ids for that stage. */
export const OBJECT_LABEL_TO_FIELD_RULES: Record<string, readonly string[]> = {
    Person: ["person:first_name", "person:last_name"],
    Child: ["child:first_name", "child:last_name"],
    Program: ["child:program_interest"],
    "Desired Schedule": ["child:desired_schedule"],
    Schedule: ["child:desired_schedule"],
    "Desired Start Date": ["child:start_date"],
    "Enrollment Start Date": ["child:start_date"],
    "Requested Start": ["child:start_date"],
    "Start Date": ["child:start_date"],
    "Requested days per week": ["child:requested_days_per_week"],
    "Preferred days": ["child:preferred_weekdays"],
    "Tuition plan": ["child:tuition_plan"],
    "Quote accepted": ["child:quote_accepted"],
    Classroom: ["child:classroom"],
    Room: ["child:classroom"],
    "Tour Date and Time": ["opportunity:tour_date", "opportunity:tour_time"],
    "Tour Outcome": ["opportunity:tour_outcome"],
    "Enrollment Date": ["opportunity:enrollment_date"],
    "Enrollment Packet Reviewed": ["opportunity:enrollment_packet"],
    "Child Identity": ["child:first_name", "child:last_name"],
};

export function lifecycleFieldRequirementById(ruleId: string): LifecycleFieldRequirementDefinition | null {
    return CATALOG_BY_ID.get(ruleId) ?? null;
}

export function lifecycleEntityLabel(entity: LifecycleRequirementEntityKey): string {
    return LIFECYCLE_REQUIREMENT_ENTITIES.find((e) => e.key === entity)?.label ?? entity;
}

export function lifecycleFieldPaletteForStage(stage: LifecycleOperatorStage): LifecycleFieldRequirementDefinition[] {
    const objectLabels = new Set(lifecycleStageLabelPalette(stage));
    const entities = new Set<LifecycleRequirementEntityKey>();
    for (const label of objectLabels) {
        for (const id of OBJECT_LABEL_TO_FIELD_RULES[label] ?? []) {
            const def = CATALOG_BY_ID.get(id);
            if (def) entities.add(def.entity);
        }
    }
    return LIFECYCLE_FIELD_REQUIREMENT_CATALOG.filter((f) => {
        if (isDeprecatedLifecycleFieldRule(f.rule_id)) return false;
        if (f.stages?.length && !f.stages.includes(stage)) return false;
        if (f.stages?.includes(stage)) return true;
        if (entities.size === 0) return true;
        return entities.has(f.entity);
    });
}

export function platformFieldRulesForStage(stage: LifecycleOperatorStage): {
    required_rule_ids: string[];
    recommended_rule_ids: string[];
} {
    const platform = platformLifecycleProgressionRequirementsForStage(stage);
    const required = new Set<string>();
    const recommended = new Set<string>();
    for (const row of platform.required) {
        for (const id of OBJECT_LABEL_TO_FIELD_RULES[row.label] ?? []) {
            required.add(id);
        }
    }
    for (const row of platform.recommended) {
        for (const id of OBJECT_LABEL_TO_FIELD_RULES[row.label] ?? []) {
            if (!required.has(id)) recommended.add(id);
        }
    }
    return {
        required_rule_ids: [...required],
        recommended_rule_ids: [...recommended],
    };
}

/** Derive object-level labels from field rules (keeps legacy evaluator working). */
export function deriveObjectLabelsFromFieldRules(
    requiredRuleIds: readonly string[],
    recommendedRuleIds: readonly string[]
): { required_labels: string[]; recommended_labels: string[] } {
    const requiredSet = new Set(requiredRuleIds);
    const recommendedSet = new Set(recommendedRuleIds);
    const required_labels: string[] = [];
    const recommended_labels: string[] = [];

    for (const [label, ids] of Object.entries(OBJECT_LABEL_TO_FIELD_RULES)) {
        if (ids.some((id) => requiredSet.has(id))) {
            required_labels.push(label);
        } else if (ids.some((id) => recommendedSet.has(id))) {
            recommended_labels.push(label);
        }
    }

    return {
        required_labels: [...new Set(required_labels)],
        recommended_labels: [...new Set(recommended_labels.filter((l) => !required_labels.includes(l)))],
    };
}

export function validateFieldRuleIdsForStage(
    stage: LifecycleOperatorStage,
    ruleIds: readonly string[]
): string[] | null {
    const palette = new Set(lifecycleFieldPaletteForStage(stage).map((f) => f.rule_id));
    const out: string[] = [];
    for (const id of ruleIds) {
        if (!palette.has(id)) return null;
        if (!out.includes(id)) out.push(id);
    }
    return out;
}

export type LifecycleStageFieldRules = {
    required_rule_ids: string[];
    recommended_rule_ids: string[];
};

export function fieldRulesHaveRuntimeGaps(rules: LifecycleStageFieldRules): boolean {
    const all = [...rules.required_rule_ids, ...rules.recommended_rule_ids];
    return all.some((id) => {
        if (parseCustomFieldRuleId(id)) return true;
        const binding = lifecycleFieldRuleBinding(id);
        if (binding) return !binding.runtime_enforced;
        const def = CATALOG_BY_ID.get(id);
        return def ? !def.runtime_enforced : true;
    });
}
