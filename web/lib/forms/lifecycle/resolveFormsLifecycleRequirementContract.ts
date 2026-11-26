/**
 * Card 1 — Forms-facing adapter over lifecycle field rules + action intake spec.
 * Does not duplicate requirement storage; delegates to existing resolvers.
 */

import {
    LIFECYCLE_STAGE_LABELS,
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    effectiveFieldRulesForStage,
    effectiveFieldRulesStoredForStage,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import {
    formRequirementMoment,
    splitRequiredRulesByFormMoment,
} from "@/lib/forms/lifecycle/formRequirementTiming";
import type { ActionIntakeFieldSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { OrgFieldDefinitionRow } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import {
    lifecycleFieldRequirementById,
    type LifecycleRequirementEntityKey,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    lifecycleFieldRuleBinding,
    parseCustomFieldRuleId,
} from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import {
    mergeLifecycleFieldPaletteForStage,
    type LifecycleFieldPaletteEntry,
} from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { resolveActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import type {
    FormsLifecycleEntityType,
    FormsLifecycleFieldRequirement,
    FormsLifecycleRequirementConstraint,
    FormsLifecycleRequirementContract,
    FormsLifecycleRequirementSource,
} from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";

export type ResolveFormsLifecycleRequirementContractInput = {
    orgId?: string;
    departmentId?: string;
    processId?: string | null;
    stageKey: string;
    intent: string;
    lifecycleLabel?: string;
    departmentMetadata?: Record<string, unknown> | null;
    orgFieldDefinitions?: Partial<Record<string, OrgFieldDefinitionRow[]>> | null;
    primaryRecordLabel?: string;
};

const STAGE_KEYS: readonly LifecycleOperatorStage[] = [
    "lead",
    "qualification",
    "tour",
    "waitlist",
    "enrollment",
    "enrolled",
];

/** Intents that apply create_lead action-intake policy when stage matches. */
const ACTION_INTAKE_INTENT_CONFIG: Partial<
    Record<string, { actionKey: "create_lead"; stage: LifecycleOperatorStage }>
> = {
    enrollment_lead: { actionKey: "create_lead", stage: "lead" },
};

export function parseLifecycleOperatorStage(stageKey: string): LifecycleOperatorStage | null {
    const t = stageKey.trim();
    return (STAGE_KEYS as readonly string[]).includes(t) ? (t as LifecycleOperatorStage) : null;
}

export function toFormsLifecycleEntityType(entity: LifecycleRequirementEntityKey): FormsLifecycleEntityType {
    switch (entity) {
        case "person":
            return "person";
        case "child":
            return "child";
        case "opportunity":
            return "opportunity";
        case "customer":
            return "customer";
        default:
            return "unknown";
    }
}

function humanizeFieldKey(fieldKey: string): string {
    return fieldKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ruleIdToFieldKey(ruleId: string, paletteEntry: LifecycleFieldPaletteEntry | null): string {
    const custom = parseCustomFieldRuleId(ruleId);
    if (custom) return custom.field_key;
    if (paletteEntry?.field_key) return paletteEntry.field_key;
    const binding = lifecycleFieldRuleBinding(ruleId);
    if (binding?.field_key) return binding.field_key;
    const colon = ruleId.indexOf(":");
    return colon >= 0 ? ruleId.slice(colon + 1) : ruleId;
}

function ruleIdToLabel(ruleId: string, paletteEntry: LifecycleFieldPaletteEntry | null): string {
    if (paletteEntry?.field_label) return paletteEntry.field_label;
    const catalog = lifecycleFieldRequirementById(ruleId);
    if (catalog) return catalog.field_label;
    const custom = parseCustomFieldRuleId(ruleId);
    if (custom) return humanizeFieldKey(custom.field_key);
    return humanizeFieldKey(ruleIdToFieldKey(ruleId, paletteEntry));
}

function ruleIdToEntity(ruleId: string, paletteEntry: LifecycleFieldPaletteEntry | null): FormsLifecycleEntityType {
    const custom = parseCustomFieldRuleId(ruleId);
    if (custom) return toFormsLifecycleEntityType(custom.entity);
    if (paletteEntry?.entity) return toFormsLifecycleEntityType(paletteEntry.entity);
    const catalog = lifecycleFieldRequirementById(ruleId);
    if (catalog) return toFormsLifecycleEntityType(catalog.entity);
    const binding = lifecycleFieldRuleBinding(ruleId);
    if (binding) return toFormsLifecycleEntityType(binding.entity);
    return "unknown";
}

function requirementFromRuleId(input: {
    ruleId: string;
    requiredness: "required" | "recommended";
    requirementSource: FormsLifecycleRequirementSource;
    paletteEntry: LifecycleFieldPaletteEntry | null;
}): FormsLifecycleFieldRequirement | null {
    const { ruleId } = input;
    const custom = parseCustomFieldRuleId(ruleId);
    const catalog = lifecycleFieldRequirementById(ruleId);
    const binding = lifecycleFieldRuleBinding(ruleId);
    if (!custom && !catalog && !binding) return null;

    return {
        id: ruleId,
        entityType: ruleIdToEntity(ruleId, input.paletteEntry),
        fieldKey: ruleIdToFieldKey(ruleId, input.paletteEntry),
        label: ruleIdToLabel(ruleId, input.paletteEntry),
        requiredness: input.requiredness,
        requirementSource: input.requirementSource,
    };
}

function requirementFromActionIntakeField(
    spec: ActionIntakeFieldSpec,
    requiredness: "required" | "recommended"
): FormsLifecycleFieldRequirement {
    return {
        id: spec.rule_id,
        entityType: toFormsLifecycleEntityType(spec.entity),
        fieldKey: spec.field_key ?? ruleIdToFieldKey(spec.rule_id, null),
        label: spec.field_label,
        requiredness,
        requirementSource: "action_intake",
    };
}

function dedupeRequirements(rows: FormsLifecycleFieldRequirement[]): FormsLifecycleFieldRequirement[] {
    const seen = new Set<string>();
    const out: FormsLifecycleFieldRequirement[] = [];
    for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
    }
    return out;
}

function usesActionIntakePolicy(intent: string, stage: LifecycleOperatorStage): boolean {
    const cfg = ACTION_INTAKE_INTENT_CONFIG[intent.trim()];
    if (!cfg) return false;
    return cfg.stage === stage;
}

function resolveFromActionIntakeSpec(input: {
    departmentId: string;
    processId?: string | null;
    stage: LifecycleOperatorStage;
    departmentMetadata?: Record<string, unknown> | null;
    orgFieldDefinitions?: Partial<Record<string, OrgFieldDefinitionRow[]>> | null;
    primaryRecordLabel?: string;
}): Pick<
    FormsLifecycleRequirementContract,
    "required" | "recommended" | "constraints" | "requirementsSource"
> | null {
    const spec = resolveActionIntakeSpec({
        action_key: "create_lead",
        department_id: input.departmentId,
        process_id: input.processId,
        stage_key: input.stage,
        department_metadata: input.departmentMetadata,
        org_field_definitions: input.orgFieldDefinitions,
        primary_record_label: input.primaryRecordLabel,
    });
    if (!spec) return null;

    const required = dedupeRequirements(
        spec.required.map((f) => requirementFromActionIntakeField(f, "required"))
    );
    const recommended = dedupeRequirements(
        spec.recommended.map((f) => requirementFromActionIntakeField(f, "recommended"))
    );

    const constraints: FormsLifecycleRequirementConstraint[] = spec.constraints.map((c) => ({
        kind: c.kind,
        ruleIds: [...c.rule_ids],
        message: c.message,
    }));

    return {
        required,
        recommended,
        constraints,
        requirementsSource: spec.requirements_source,
    };
}

function resolveFromLifecycleStageRules(input: {
    stage: LifecycleOperatorStage;
    intent: string;
    departmentMetadata?: Record<string, unknown> | null;
    orgFieldDefinitions?: Partial<Record<string, OrgFieldDefinitionRow[]>> | null;
}): Pick<
    FormsLifecycleRequirementContract,
    "required" | "recommended" | "constraints" | "requirementsSource"
> {
    const { rules, source } = effectiveFieldRulesForStage(input.stage, input.departmentMetadata ?? null);
    const stored = effectiveFieldRulesStoredForStage(input.stage, input.departmentMetadata ?? null);
    const palette = mergeLifecycleFieldPaletteForStage(input.stage, input.orgFieldDefinitions ?? null);
    const byRule = new Map(palette.map((p) => [p.rule_id, p]));

    // Honor configured requirement timing: a rule the process requires at a LATER moment is not a
    // gap in this form. It stays a real requirement, carried as advisory with the timing that owns
    // it, so demoting it to `recommended` in configuration is never the only escape hatch.
    const split = splitRequiredRulesByFormMoment({
        requiredRuleIds: rules.required_rule_ids,
        rules: stored,
        ruleMeta: stored.rule_meta_v1 ?? null,
        moment: formRequirementMoment(input.stage, input.intent),
    });

    const required: FormsLifecycleFieldRequirement[] = [];
    const recommended: FormsLifecycleFieldRequirement[] = [];

    for (const ruleId of split.blockingRuleIds) {
        const req = requirementFromRuleId({
            ruleId,
            requiredness: "required",
            requirementSource: "lifecycle_stage",
            paletteEntry: byRule.get(ruleId) ?? null,
        });
        if (req) required.push(req);
    }
    for (const ruleId of split.deferredRuleIds) {
        const req = requirementFromRuleId({
            ruleId,
            requiredness: "recommended",
            requirementSource: "lifecycle_stage",
            paletteEntry: byRule.get(ruleId) ?? null,
        });
        if (req) recommended.push({ ...req, deferredTiming: split.deferredTimingByRuleId[ruleId] });
    }
    for (const ruleId of rules.recommended_rule_ids) {
        const req = requirementFromRuleId({
            ruleId,
            requiredness: "recommended",
            requirementSource: "lifecycle_stage",
            paletteEntry: byRule.get(ruleId) ?? null,
        });
        if (req) recommended.push(req);
    }

    return {
        required: dedupeRequirements(required),
        recommended: dedupeRequirements(recommended),
        constraints: [],
        requirementsSource: source,
    };
}

/**
 * Resolve normalized lifecycle requirement contract for Forms coverage/readiness.
 */
export function resolveFormsLifecycleRequirementContract(
    input: ResolveFormsLifecycleRequirementContractInput
): FormsLifecycleRequirementContract {
    const stage = parseLifecycleOperatorStage(input.stageKey) ?? "lead";
    const intent = input.intent.trim() || "general";
    const departmentId = input.departmentId?.trim() || undefined;

    let resolved: Pick<
        FormsLifecycleRequirementContract,
        "required" | "recommended" | "constraints" | "requirementsSource"
    >;

    if (departmentId && usesActionIntakePolicy(intent, stage)) {
        const fromAction = resolveFromActionIntakeSpec({
            departmentId,
            processId: input.processId,
            stage,
            departmentMetadata: input.departmentMetadata,
            orgFieldDefinitions: input.orgFieldDefinitions,
            primaryRecordLabel: input.primaryRecordLabel,
        });
        resolved =
            fromAction ??
            resolveFromLifecycleStageRules({
                stage,
                intent,
                departmentMetadata: input.departmentMetadata,
                orgFieldDefinitions: input.orgFieldDefinitions,
            });
    } else {
        resolved = resolveFromLifecycleStageRules({
            stage,
            intent,
            departmentMetadata: input.departmentMetadata,
            orgFieldDefinitions: input.orgFieldDefinitions,
        });
    }

    return {
        lifecycleLabel: input.lifecycleLabel,
        stageKey: stage,
        stageLabel: LIFECYCLE_STAGE_LABELS[stage],
        intent,
        departmentId,
        processId: input.processId?.trim() || null,
        requirementsSource: resolved.requirementsSource,
        required: resolved.required,
        recommended: resolved.recommended,
        constraints: resolved.constraints,
    };
}
