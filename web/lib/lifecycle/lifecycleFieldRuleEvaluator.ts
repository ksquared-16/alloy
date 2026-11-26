/**
 * Runtime evaluation for lifecycle field_rules (enforced rules only).
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    effectiveFieldRulesStoredForStage,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { OBJECT_LABEL_TO_FIELD_RULES } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    lifecycleEntityLabel,
    type LifecycleStageFieldRules,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    lifecycleFieldRuleBinding,
    parseCustomFieldRuleId,
} from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import { canonicalOperatorStageForStatusKey } from "@/lib/lifecycle/enrollmentOperatorStage";
import { makeRequirementViolation } from "@/lib/completion/requirementValidationResult";
import type {
    CompletionEvaluationContext,
    InquiryChildCompletionSnapshot,
    PrimaryPersonSnapshot,
    RequirementViolation,
} from "@/lib/completion/requirementValidationTypes";
import { resolveChildProfileFieldValue } from "@/lib/fields/childProfileFieldResolution";
import { completionValueEmpty, trimOrNull } from "@/lib/completion/valueEmpty";
import type { BlockingLevel } from "@/lib/completion/requirementValidationTypes";
import {
    isLifecycleRuleEnforceable,
    resolveAllEffectivePersistedLevels,
    type LifecycleStageFieldRulesStored,
    type PersistedRequirementLevel,
    type RuleEnforceableLookup,
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";

export type { PrimaryPersonSnapshot };

function metadataValue(values: Record<string, unknown>, key: string): unknown {
    const meta = values.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        return (meta as Record<string, unknown>)[key];
    }
    return undefined;
}

function splitPersonName(full: string | null | undefined): { first_name: string | null; last_name: string | null } {
    const t = trimOrNull(full);
    if (!t) return { first_name: null, last_name: null };
    const parts = t.split(/\s+/);
    if (parts.length === 1) return { first_name: parts[0]!, last_name: null };
    return { first_name: parts[0]!, last_name: parts.slice(1).join(" ") };
}

export function extractPrimaryPersonSnapshot(ctx: CompletionEvaluationContext): PrimaryPersonSnapshot {
    const values = ctx.values;
    const relatedPerson = ctx.related?.primary_person;
    if (relatedPerson) {
        return relatedPerson;
    }

    const nameParts = splitPersonName(
        typeof values._primary_person_name === "string" ? values._primary_person_name : null
    );

    return {
        person_id:
            trimOrNull(values.primary_person_id as string | null) ??
            trimOrNull(values.primary_contact_id as string | null) ??
            trimOrNull(values._primary_person_id as string | null),
        first_name:
            trimOrNull(values.first_name as string | null) ??
            trimOrNull(values._primary_person_first_name as string | null) ??
            nameParts.first_name,
        last_name:
            trimOrNull(values.last_name as string | null) ??
            trimOrNull(values._primary_person_last_name as string | null) ??
            nameParts.last_name,
        email:
            trimOrNull(values.email as string | null) ??
            trimOrNull(values.parent_email as string | null) ??
            trimOrNull(values._primary_person_email as string | null),
        phone:
            trimOrNull(values.phone as string | null) ??
            trimOrNull(values.parent_phone as string | null) ??
            trimOrNull(values._primary_person_phone as string | null),
    };
}

function fieldViolation(
    ctx: CompletionEvaluationContext,
    input: {
        rule_id: string;
        label: string;
        missing_reason: string;
        blocking_level: BlockingLevel;
        requirement_level: PersistedRequirementLevel;
        field_key?: string;
        entity_type?: string;
        entity_id?: string;
    }
): RequirementViolation {
    return makeRequirementViolation({
        entity_type: input.entity_type ?? "opportunity",
        entity_id: input.entity_id ?? ctx.entity_id,
        field_key: input.field_key,
        label: input.label,
        requirement_type:
            input.blocking_level === "hard_block" ? "required_before_action" : "recommended_non_blocking",
        blocking_level: input.blocking_level,
        missing_reason: input.missing_reason,
        context: {
            surface: ctx.surface,
            action_key: trimOrNull(ctx.action_key) ?? undefined,
            status_to: trimOrNull(ctx.status_to) ?? undefined,
            requirement_level: input.requirement_level,
            rule_id: input.rule_id,
        },
    });
}

function blockingLevelForPersistedLevel(level: PersistedRequirementLevel): BlockingLevel {
    switch (level) {
        case "enforced":
            return "hard_block";
        case "required":
            return "soft_warning";
        case "recommended":
            return "recommendation";
    }
}

function personFieldPresent(person: PrimaryPersonSnapshot, field: "first_name" | "last_name" | "email" | "phone"): boolean {
    switch (field) {
        case "first_name":
            return !completionValueEmpty(person.first_name);
        case "last_name":
            return !completionValueEmpty(person.last_name);
        case "email":
            return !completionValueEmpty(person.email);
        case "phone":
            return !completionValueEmpty(person.phone);
    }
}

function fieldLabelForPersonRule(ruleId: string): string {
    const binding = lifecycleFieldRuleBinding(ruleId);
    if (binding?.field_key === "first_name") return "First Name";
    if (binding?.field_key === "last_name") return "Last Name";
    if (binding?.field_key === "email") return "Email";
    if (binding?.field_key === "phone") return "Phone";
    return "Field";
}

function evaluatePersonRule(
    ctx: CompletionEvaluationContext,
    ruleId: string,
    level: PersistedRequirementLevel
): RequirementViolation[] {
    const person = extractPrimaryPersonSnapshot(ctx);
    const fieldLabel = fieldLabelForPersonRule(ruleId);
    const label = `${lifecycleEntityLabel("person")} · ${fieldLabel}`;
    const blocking_level = blockingLevelForPersistedLevel(level);

    const binding = lifecycleFieldRuleBinding(ruleId);
    const field = binding?.field_key as "first_name" | "last_name" | "email" | "phone" | undefined;
    if (!field) return [];
    if (personFieldPresent(person, field)) return [];

    return [
        fieldViolation(ctx, {
            rule_id: ruleId,
            label,
            field_key: field,
            missing_reason: `${fieldLabel} is required for the primary contact.`,
            blocking_level,
            requirement_level: level,
        }),
    ];
}

function evaluateCustomerMemberProfileRule(
    ctx: CompletionEvaluationContext,
    ruleId: string,
    level: PersistedRequirementLevel
): RequirementViolation[] {
    const binding = lifecycleFieldRuleBinding(ruleId);
    const profileField = binding?.customer_member_field ?? binding?.field_key;
    if (!binding || !profileField) return [];

    // Unknown is not empty. `inquiry_children` is `undefined` when the surface never carried a
    // children binding at all, and `[]` when there genuinely are none — collapsing both with `?? []`
    // made an absent binding read as "this family has no children" and told the operator that
    // already-captured names and DOBs were missing. Reserve judgment instead, exactly as the
    // Children card does when the fact is unknowable.
    const children = ctx.related?.inquiry_children;
    if (children === undefined) return [];

    const violations: RequirementViolation[] = [];
    const blocking_level = blockingLevelForPersistedLevel(level);
    const fieldLabels: Record<string, string> = {
        first_name: "First Name",
        last_name: "Last Name",
        dob: "Date of Birth",
        date_of_birth: "Date of Birth",
    };
    const labelField = binding.field_key ?? profileField;

    if (children.length === 0) {
        return [
            fieldViolation(ctx, {
                rule_id: ruleId,
                label: `${lifecycleEntityLabel("child")} · ${fieldLabels[labelField] ?? labelField}`,
                field_key: binding.field_key ?? profileField,
                missing_reason: "Add at least one child before continuing.",
                blocking_level,
                requirement_level: level,
            }),
        ];
    }

    for (const child of children) {
        const memberId = trimOrNull(child.customer_member_id) ?? trimOrNull(child.id) ?? "unknown";
        const value = resolveChildProfileFieldValue(child, profileField);
        if (!completionValueEmpty(value)) continue;

        violations.push(
            fieldViolation(ctx, {
                rule_id: ruleId,
                label: `${lifecycleEntityLabel("child")} · ${fieldLabels[labelField] ?? labelField}`,
                field_key: binding.field_key ?? profileField,
                entity_type: "customer_member",
                entity_id: memberId,
                missing_reason: `${fieldLabels[labelField] ?? "Field"} is required for each child.`,
                blocking_level,
                requirement_level: level,
            })
        );
    }
    return violations;
}

function evaluateChildRule(
    ctx: CompletionEvaluationContext,
    ruleId: string,
    level: PersistedRequirementLevel
): RequirementViolation[] {
    const binding = lifecycleFieldRuleBinding(ruleId);
    // Prefer ocm_field; fall back to field_key for PI-overlay assignment proposal facts.
    const childField = binding?.ocm_field ?? binding?.field_key ?? null;
    if (!binding || !childField) return [];
    // Unknown is not empty — see evaluateCustomerMemberProfileRule. An absent children binding must
    // reserve judgment rather than report captured data as missing.
    const children = ctx.related?.inquiry_children;
    if (children === undefined) return [];

    const violations: RequirementViolation[] = [];
    const blocking_level = blockingLevelForPersistedLevel(level);

    const fieldLabels: Record<string, string> = {
        first_name: "First Name",
        last_name: "Last Name",
        program_category_id: "Program",
        schedule_type: "Proposed schedule",
        start_date: "Requested Start",
        program_room_cohort_key: "Room",
        requested_days_per_week: "Requested days per week",
        weekdays: "Preferred days",
        tuition_plan_id: "Tuition plan",
        quote_accepted: "Quote accepted",
        location_id: "Site / Location",
    };

    if (children.length === 0 && ruleId !== "child:first_name" && ruleId !== "child:last_name") {
        return [
            fieldViolation(ctx, {
                rule_id: ruleId,
                label: `${lifecycleEntityLabel("child")} · ${fieldLabels[childField] ?? childField}`,
                field_key: "inquiry_children",
                missing_reason: "Add at least one child before continuing.",
                blocking_level,
                requirement_level: level,
            }),
        ];
    }

    // Effective site for location: owned child location OR opportunity/family site
    // (same authority Children card / Identity display — do not require a duplicate owned write).
    const opportunityLocationId =
        trimOrNull(ctx.values.location_id as string | null)
        ?? trimOrNull(ctx.values._location_id as string | null);

    for (const child of children) {
        const childId = trimOrNull(child.person_id) ?? trimOrNull(child.id) ?? "unknown";
        const value = (child as Record<string, unknown>)[childField];
        // Preferred weekdays: non-empty array required when configured.
        if (childField === "weekdays") {
            if (Array.isArray(value) && value.length > 0) continue;
        } else if (childField === "quote_accepted") {
            if (value === true || value === "true" || value === 1) continue;
        } else if (childField === "location_id") {
            if (!completionValueEmpty(value) || !completionValueEmpty(opportunityLocationId)) continue;
        } else if (!completionValueEmpty(value)) {
            continue;
        }
        violations.push(
            fieldViolation(ctx, {
                rule_id: ruleId,
                label: `${lifecycleEntityLabel("child")} · ${fieldLabels[childField] ?? childField}`,
                field_key: childField,
                entity_type: "inquiry_child",
                entity_id: childId,
                missing_reason: `${fieldLabels[childField] ?? "Field"} is required for each child.`,
                blocking_level,
                requirement_level: level,
            })
        );
    }
    return violations;
}

function evaluateOpportunityRule(
    ctx: CompletionEvaluationContext,
    ruleId: string,
    level: PersistedRequirementLevel
): RequirementViolation[] {
    const binding = lifecycleFieldRuleBinding(ruleId);
    if (!binding) return [];
    const blocking_level = blockingLevelForPersistedLevel(level);
    const values = ctx.values;
    let present = false;
    if (binding.value_source === "opportunity_metadata" && binding.metadata_key) {
        present = !completionValueEmpty(values[binding.metadata_key] ?? metadataValue(values, binding.metadata_key));
    } else if (binding.opportunity_field) {
        present = !completionValueEmpty(values[binding.opportunity_field]);
    }
    if (present) return [];
    return [
        fieldViolation(ctx, {
            rule_id: ruleId,
            label: `${lifecycleEntityLabel("opportunity")} · ${binding.field_key ?? ruleId}`,
            field_key: binding.field_key ?? undefined,
            missing_reason: "Required opportunity information is missing.",
            blocking_level,
            requirement_level: level,
        }),
    ];
}

function evaluateSingleFieldRule(
    ctx: CompletionEvaluationContext,
    ruleId: string,
    level: PersistedRequirementLevel
): RequirementViolation[] {
    if (parseCustomFieldRuleId(ruleId)) return [];

    const binding = lifecycleFieldRuleBinding(ruleId);
    if (!binding) return [];

    switch (binding.value_source) {
        case "primary_person":
            return evaluatePersonRule(ctx, ruleId, level);
        case "customer_member_profile":
            return evaluateCustomerMemberProfileRule(ctx, ruleId, level);
        case "inquiry_child":
            return evaluateChildRule(ctx, ruleId, level);
        case "opportunity":
        case "opportunity_metadata":
            return evaluateOpportunityRule(ctx, ruleId, level);
        default:
            return [];
    }
}

export function evaluateFieldRulesForStage(
    ctx: CompletionEvaluationContext,
    stage: LifecycleOperatorStage,
    rules: LifecycleStageFieldRulesStored,
    options?: { isEnforceable?: RuleEnforceableLookup }
): RequirementViolation[] {
    const isEnforceable = options?.isEnforceable ?? ((ruleId: string) => isLifecycleRuleEnforceable(ruleId));
    const levels = resolveAllEffectivePersistedLevels({
        rules,
        rule_levels_v1: rules.rule_levels_v1,
        isEnforceable,
    });

    const violations: RequirementViolation[] = [];
    for (const [ruleId, level] of Object.entries(levels)) {
        violations.push(...evaluateSingleFieldRule(ctx, ruleId, level));
    }
    return violations;
}

/** Object labels that still need legacy object-level checks (config-only or unmapped field rules). */
export function objectLabelsNeedingLegacyFallback(
    rules: LifecycleStageFieldRules,
    requiredLabels: readonly string[],
    recommendedLabels: readonly string[],
    kind: "required" | "recommended"
): Set<string> {
    const labels = kind === "required" ? requiredLabels : recommendedLabels;
    const ruleIds = new Set(kind === "required" ? rules.required_rule_ids : rules.recommended_rule_ids);
    const labelsNeedingFallback = new Set<string>();

    for (const label of labels) {
        const mappedIds = OBJECT_LABEL_TO_FIELD_RULES[label] ?? [];
        if (mappedIds.length === 0) {
            labelsNeedingFallback.add(label);
            continue;
        }
        const activeIds = mappedIds.filter((id) => ruleIds.has(id));
        if (activeIds.length === 0) {
            labelsNeedingFallback.add(label);
            continue;
        }
        const allConfigOnly = activeIds.every((id) => !lifecycleFieldRuleBinding(id)?.runtime_enforced);
        if (allConfigOnly) labelsNeedingFallback.add(label);
    }
    return labelsNeedingFallback;
}

export function lifecyclePreflightStagesForAction(
    ctx: CompletionEvaluationContext,
    actionKey: string
): LifecycleOperatorStage[] {
    const stages = new Set<LifecycleOperatorStage>();
    const fromStatus = trimOrNull(ctx.status_from);
    if (fromStatus) {
        const fromStage = canonicalOperatorStageForStatusKey(fromStatus);
        if (fromStage) stages.add(fromStage);
    }

    switch (actionKey.trim()) {
        case "move_to_waitlist":
            stages.add("waitlist");
            break;
        case "schedule_tour":
            if (fromStatus) {
                const fromStage = canonicalOperatorStageForStatusKey(fromStatus);
                if (fromStage) stages.add(fromStage);
            }
            stages.add("tour");
            break;
        case "approve_enrollment":
            stages.add("enrollment");
            break;
        case "record_tour_outcome":
            stages.add("tour");
            break;
    }
    return [...stages];
}

export function evaluateLifecycleFieldRulesForPreflight(
    ctx: CompletionEvaluationContext,
    actionKey: string
): RequirementViolation[] {
    const metadata = ctx.related?.department_metadata ?? null;
    const stages = lifecyclePreflightStagesForAction(ctx, actionKey);
    const violations: RequirementViolation[] = [];
    const seen = new Set<string>();

    for (const stage of stages) {
        const stored = effectiveFieldRulesStoredForStage(stage, metadata);
        for (const v of evaluateFieldRulesForStage(ctx, stage, stored)) {
            const key = `${v.label}:${v.blocking_level}`;
            if (seen.has(key)) continue;
            seen.add(key);
            violations.push(v);
        }
    }
    return violations;
}
