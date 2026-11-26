import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { effectiveFieldRulesForBuilderStage } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { effectiveFieldRulesStoredForBuilderStage } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { selectRulesForRecordCreation } from "@/lib/lifecycle/requirementTimingEvaluation";
import type { OrgFieldDefinitionRow } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import type {
    ActionIntakeConstraint,
    ActionIntakeEntityGroup,
    ActionIntakeFieldSpec,
    ActionIntakeFieldTier,
    ActionIntakePlacementSelect,
    ActionIntakeSpec,
    ActionIntakeValidationIssue,
    ActionIntakeValidationRule,
} from "@/lib/lifecycle/actionIntakeSpecTypes";
import {
    CREATE_LEAD_CODE_OWNED_FLOOR_RULE_IDS,
    CREATE_LEAD_CONTACT_RULE_IDS,
    CREATE_LEAD_INTAKE_ENTITIES,
    CREATE_LEAD_PLATFORM_REQUIRED_RULE_IDS,
    createLeadPayloadKeyForRule,
    inferActionIntakeValueKind,
    validationRulesForIntakeField,
} from "@/lib/lifecycle/createLeadIntakeFieldMap";
import {
    splitRequiredRulesByFormMoment,
} from "@/lib/forms/lifecycle/formRequirementTiming";
import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
} from "@/lib/admin/actions/createLeadIntakeValidation";
import {
    lifecycleEntityLabel,
    lifecycleFieldRequirementById,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    lifecycleFieldRuleBinding,
    parseCustomFieldRuleId,
} from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import {
    mergeLifecycleFieldPaletteForStage,
    type LifecycleFieldPaletteEntry,
} from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { resolveSelectFieldBinding } from "@/lib/fields/resolveSelectFieldBinding";
import { fallbackOptionSetKeyForInquiryChildField } from "@/lib/fields/inquiryChildFieldRegistry";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

export type ResolveActionIntakeSpecInput = {
    action_key: string;
    department_id: string;
    process_id?: string | null;
    /** Builder or operator stage key; defaults to lead when absent or unmappable. */
    stage_key?: string | null;
    department_metadata?: Record<string, unknown> | null;
    org_field_definitions?: Partial<Record<string, OrgFieldDefinitionRow[]>> | null;
    primary_record_label?: string;
};

function asLeadStage(stageKey: string | null | undefined): LifecycleOperatorStage {
    const t = stageKey?.trim() ?? "";
    if (
        t === "lead" ||
        t === "qualification" ||
        t === "tour" ||
        t === "waitlist" ||
        t === "enrollment" ||
        t === "enrolled"
    ) {
        return t;
    }
    return "lead";
}

function paletteByRuleId(
    palette: LifecycleFieldPaletteEntry[]
): Map<string, LifecycleFieldPaletteEntry> {
    return new Map(palette.map((p) => [p.rule_id, p]));
}

function orgFieldDefForKey(
    orgDefs: Partial<Record<LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]>> | null | undefined,
    entity: LifecycleRequirementEntityKey,
    fieldKey: string | null
): OrgFieldDefinitionRow | null {
    if (!fieldKey?.trim()) return null;
    const list = orgDefs?.[entity];
    return list?.find((d) => d.field_key === fieldKey) ?? null;
}

function placementSelectForInquiryChildField(fieldKey: string | null): ActionIntakePlacementSelect | null {
    if (fieldKey === "location_id") return "site";
    // The child:program_interest rule binds `program_category_id` (canonical program field).
    // Without this it falls through to a free-text input; map it to the location-aware program select
    // so Program renders as a dropdown like Room (matching the platform gather field's intent).
    if (fieldKey === "program_category_id") return "site_program";
    if (fieldKey === "program_room_cohort_key") return "site_room";
    return null;
}

function buildFieldSpec(
    ruleId: string,
    tier: ActionIntakeFieldTier,
    paletteEntry: LifecycleFieldPaletteEntry | null,
    org_field_definitions?: Partial<Record<LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]>> | null
): ActionIntakeFieldSpec | null {
    const payloadKey = createLeadPayloadKeyForRule(ruleId);
    if (!payloadKey) return null;

    const catalog = lifecycleFieldRequirementById(ruleId);
    const binding = lifecycleFieldRuleBinding(ruleId);
    const custom = parseCustomFieldRuleId(ruleId);
    const entity = paletteEntry?.entity ?? catalog?.entity ?? binding?.entity ?? custom?.entity;
    if (!entity || !CREATE_LEAD_INTAKE_ENTITIES.includes(entity)) return null;

    const fieldKey = paletteEntry?.field_key ?? binding?.field_key ?? custom?.field_key ?? null;
    const fieldLabel = paletteEntry?.field_label ?? catalog?.field_label ?? fieldKey ?? ruleId;
    const orgDef = orgFieldDefForKey(org_field_definitions, entity, fieldKey);
    const fallbackOptionSetKey =
        entity === "child" && fieldKey ? fallbackOptionSetKeyForInquiryChildField(fieldKey) : null;
    const placementSelect =
        entity === "child"
            ? placementSelectForInquiryChildField(fieldKey)
            : entity === "opportunity" && fieldKey === "location_id"
              ? "site"
              : null;
    const selectBinding = resolveSelectFieldBinding({
        field_type: orgDef?.field_type ?? (fallbackOptionSetKey ? "select" : "text"),
        config: orgDef?.config,
        fallbackOptionSetKey,
    });
    const optionSetKey =
        placementSelect ? null : selectBinding.option_set_key;
    const valueKind = inferActionIntakeValueKind(ruleId, fieldKey, optionSetKey, placementSelect);

    return {
        rule_id: ruleId,
        entity,
        entity_label: lifecycleEntityLabel(entity),
        field_label: fieldLabel,
        tier,
        field_key: fieldKey,
        value_kind: valueKind,
        option_set_key: optionSetKey,
        placement_select: placementSelect,
        payload_key: payloadKey,
        form_capture_keys: binding?.form_capture_keys ?? [],
        validation: validationRulesForIntakeField(valueKind, tier),
        runtime_enforced: paletteEntry?.runtime_enforced ?? binding?.runtime_enforced ?? false,
    };
}

/**
 * create_lead: only rules whose configured timing includes `record_creation` block capture.
 *
 * Delegates to the shared form/action moment resolver (`formRequirementTiming.ts`) so create_lead
 * and every stage form judge timing by one rule. This is behavior-preserving: at the
 * `record_creation` moment the shared split reaches the same verdict the hand-rolled policy did —
 * explicit `record_creation` rules stay required; child-entity rules, rules with any other explicit
 * timing, and untagged rules (which default to `stage_progress`) all become recommended.
 */
function applyCreateLeadIntakePolicy(
    fields: {
        requiredIds: string[];
        recommendedIds: string[];
    },
    stored: import("@/lib/lifecycle/lifecycleStageRequirementLevels").LifecycleStageFieldRulesStored,
): { requiredIds: string[]; recommendedIds: string[] } {
    const split = splitRequiredRulesByFormMoment({
        requiredRuleIds: fields.requiredIds,
        rules: stored,
        ruleMeta: stored.rule_meta_v1 ?? null,
        moment: { kind: "record_creation" },
    });

    const requiredIds = [...split.blockingRuleIds];
    const recommendedIds = [...fields.recommendedIds];
    for (const id of split.deferredRuleIds) {
        if (!recommendedIds.includes(id)) recommendedIds.push(id);
    }

    // Platform floor — a Lead is not a Lead without a name, whatever the tenant configured.
    for (const id of CREATE_LEAD_PLATFORM_REQUIRED_RULE_IDS) {
        if (!requiredIds.includes(id)) requiredIds.push(id);
    }

    for (const id of fields.recommendedIds) {
        if (requiredIds.includes(id)) continue;
        if (!recommendedIds.includes(id)) recommendedIds.push(id);
    }

    return { requiredIds, recommendedIds };
}

function dedupeFieldSpecs(specs: ActionIntakeFieldSpec[]): ActionIntakeFieldSpec[] {
    const seen = new Set<string>();
    const out: ActionIntakeFieldSpec[] = [];
    for (const s of specs) {
        if (seen.has(s.rule_id)) continue;
        seen.add(s.rule_id);
        out.push(s);
    }
    return out;
}

function buildGroups(fields: ActionIntakeFieldSpec[]): ActionIntakeEntityGroup[] {
    const order = CREATE_LEAD_INTAKE_ENTITIES;
    const groups: ActionIntakeEntityGroup[] = [];
    for (const entity of order) {
        const entityFields = fields.filter((f) => f.entity === entity);
        if (!entityFields.length) continue;
        groups.push({
            entity,
            entity_label: entity === "opportunity" ? "Lead" : lifecycleEntityLabel(entity),
            fields: entityFields,
        });
    }
    return groups;
}

function buildCreateLeadContactConstraints(requiredIds: string[]): ActionIntakeConstraint[] {
    const emailRequired = requiredIds.includes("person:email");
    const phoneRequired = requiredIds.includes("person:phone");
    if (emailRequired || phoneRequired) return [];
    // Code-owned floor: email|phone regardless of platform vs department source.
    return [
        {
            kind: "at_least_one",
            rule_ids: CREATE_LEAD_CONTACT_RULE_IDS,
            message: "Phone or email is required.",
        },
    ];
}

export function resolveCreateLeadActionIntakeSpec(input: {
    department_id: string;
    process_id?: string | null;
    operator_stage: LifecycleOperatorStage;
    /** Builder stage key — defaults to operator_stage when absent. */
    builder_stage_key?: string | null;
    department_metadata?: Record<string, unknown> | null;
    org_field_definitions?: Partial<Record<string, OrgFieldDefinitionRow[]>> | null;
    primary_record_label?: string;
}): ActionIntakeSpec {
    const builderStageKey = input.builder_stage_key?.trim() || input.operator_stage;
    const stored = effectiveFieldRulesStoredForBuilderStage(
        builderStageKey,
        input.department_metadata ?? null,
        input.operator_stage,
    );
    const { rules, source: rulesSource } = effectiveFieldRulesForBuilderStage(
        builderStageKey,
        input.department_metadata ?? null,
        input.operator_stage,
    );
    const requirementsSource: "platform" | "department" =
        rulesSource === "platform" || rulesSource === "none" ? "platform" : "department";
    const palette = mergeLifecycleFieldPaletteForStage(
        input.operator_stage,
        input.org_field_definitions ?? null
    );
    const byRule = paletteByRuleId(palette);

    const policy = applyCreateLeadIntakePolicy(
        {
            requiredIds: rules.required_rule_ids,
            recommendedIds: rules.recommended_rule_ids,
        },
        stored,
    );

    // Merge explicit record_creation rules that may only exist in rule_meta.
    for (const row of selectRulesForRecordCreation(stored, stored.rule_meta_v1 ?? null)) {
        if (!policy.requiredIds.includes(row.ruleId)) {
            policy.requiredIds.push(row.ruleId);
        }
    }

    const required: ActionIntakeFieldSpec[] = [];
    const recommended: ActionIntakeFieldSpec[] = [];
    const optional: ActionIntakeFieldSpec[] = [];

    for (const ruleId of policy.requiredIds) {
        const spec = buildFieldSpec(ruleId, "required", byRule.get(ruleId) ?? null, input.org_field_definitions);
        if (spec) required.push(spec);
    }
    for (const ruleId of policy.recommendedIds) {
        if (policy.requiredIds.includes(ruleId)) continue;
        const spec = buildFieldSpec(ruleId, "recommended", byRule.get(ruleId) ?? null, input.org_field_definitions);
        if (spec) recommended.push(spec);
    }

    // Do NOT dump unused palette fields as optional. The palette is the catalog of
    // fields available for configuration — not the effective Create Lead intake.
    // Code-owned contact (email|phone) must still be present for Form + constraint.
    const includedRuleIds = new Set([
        ...policy.requiredIds,
        ...policy.recommendedIds,
    ]);
    for (const ruleId of CREATE_LEAD_CONTACT_RULE_IDS) {
        if (includedRuleIds.has(ruleId)) continue;
        if (policy.requiredIds.includes(ruleId)) continue;
        const spec = buildFieldSpec(ruleId, "optional", byRule.get(ruleId) ?? null, input.org_field_definitions);
        if (spec) {
            optional.push(spec);
            includedRuleIds.add(ruleId);
        }
    }
    // Ensure code-owned name floor specs exist even if palette lookup missed them.
    for (const ruleId of CREATE_LEAD_CODE_OWNED_FLOOR_RULE_IDS) {
        if (includedRuleIds.has(ruleId)) continue;
        if (CREATE_LEAD_PLATFORM_REQUIRED_RULE_IDS.includes(ruleId as (typeof CREATE_LEAD_PLATFORM_REQUIRED_RULE_IDS)[number])) {
            const spec = buildFieldSpec(ruleId, "required", byRule.get(ruleId) ?? null, input.org_field_definitions);
            if (spec) {
                required.push(spec);
                includedRuleIds.add(ruleId);
            }
        }
    }

    const constraints = buildCreateLeadContactConstraints(policy.requiredIds);

    const leadLabel = input.primary_record_label?.trim() || "Lead";
    const allFields = dedupeFieldSpecs([...required, ...recommended, ...optional]);

    return {
        action_key: "create_lead",
        department_id: input.department_id,
        process_id: input.process_id?.trim() || null,
        operator_stage: input.operator_stage,
        mode: "hybrid",
        requirements_source: requirementsSource,
        groups: buildGroups(allFields),
        required: dedupeFieldSpecs(required),
        recommended: dedupeFieldSpecs(recommended),
        optional: dedupeFieldSpecs(optional),
        constraints,
        copy: {
            title: `Create ${leadLabel}`,
            help: "Paste inquiry details or enter manually. Required fields follow your Lead stage configuration.",
        },
    };
}

export function resolveActionIntakeSpec(input: ResolveActionIntakeSpecInput): ActionIntakeSpec | null {
    const actionKey = input.action_key.trim();
    if (actionKey !== "create_lead") return null;

    return resolveCreateLeadActionIntakeSpec({
        department_id: input.department_id,
        process_id: input.process_id,
        operator_stage: asLeadStage(input.stage_key),
        builder_stage_key: input.stage_key,
        department_metadata: input.department_metadata,
        org_field_definitions: input.org_field_definitions,
        primary_record_label: input.primary_record_label,
    });
}

function valueForRule(values: Record<string, string>, spec: ActionIntakeFieldSpec): string {
    return (values[spec.payload_key] ?? values[spec.rule_id] ?? "").trim();
}

function passesValidationRule(value: string, rule: ActionIntakeValidationRule): boolean {
    switch (rule.kind) {
        case "non_empty":
            return value.length > 0;
        case "email":
            return value.length === 0 || isValidCreateLeadEmail(value);
        case "phone":
            return value.length === 0 || isValidCreateLeadPhone(value);
        case "date_iso":
            return value.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(value);
        default:
            return true;
    }
}

export function validateActionIntakePayload(
    spec: ActionIntakeSpec,
    values: Record<string, string>
): { ok: true } | { ok: false; issues: ActionIntakeValidationIssue[] } {
    const issues: ActionIntakeValidationIssue[] = [];

    for (const field of spec.required) {
        const value = valueForRule(values, field);
        for (const rule of field.validation) {
            if (rule.kind === "non_empty" && !passesValidationRule(value, rule)) {
                issues.push({
                    rule_id: field.rule_id,
                    field_label: field.field_label,
                    message: `${field.field_label} is required.`,
                });
                break;
            }
            if (rule.kind !== "non_empty" && value && !passesValidationRule(value, rule)) {
                issues.push({
                    rule_id: field.rule_id,
                    field_label: field.field_label,
                    message: `Enter a valid ${field.field_label.toLowerCase()}.`,
                });
            }
        }
    }

    for (const constraint of spec.constraints) {
        if (constraint.kind !== "at_least_one") continue;
        const anyFilled = constraint.rule_ids.some((ruleId) => {
            const field = spec.required.find((f) => f.rule_id === ruleId) ??
                spec.recommended.find((f) => f.rule_id === ruleId) ??
                spec.optional.find((f) => f.rule_id === ruleId);
            if (!field) return false;
            return valueForRule(values, field).length > 0;
        });
        if (!anyFilled) {
            issues.push({
                rule_id: constraint.rule_ids[0] ?? "contact",
                field_label: "Contact",
                message: constraint.message,
            });
        }
    }

    if (issues.length) return { ok: false, issues };
    return { ok: true };
}

export function mapActionIntakeValuesToCreateLeadPayload(
    spec: ActionIntakeSpec,
    values: Record<string, string>
): Record<string, string> {
    const out: Record<string, string> = {};
    const all = [...spec.required, ...spec.recommended, ...spec.optional];
    for (const field of all) {
        const v = valueForRule(values, field);
        if (v) out[field.payload_key] = v;
    }
    if (out.child_location_id) {
        out.location_id = out.child_location_id;
        delete out.child_location_id;
    }
    return out;
}

export function missingRequiredFieldLabels(
    spec: ActionIntakeSpec,
    values: Record<string, string>
): string[] {
    const result = validateActionIntakePayload(spec, values);
    if (result.ok) return [];
    return result.issues.map((i) => i.field_label);
}
