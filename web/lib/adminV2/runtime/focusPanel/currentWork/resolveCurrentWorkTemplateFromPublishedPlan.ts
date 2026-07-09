/**
 * Production adapter: published operating plan + action catalog → Current Work overlay.
 *
 * Keeps presentation components free of domain keys; maps builder configuration into
 * `CurrentWorkTemplateConfigOverlay` consumed by `buildCurrentWorkSurfaceVM`.
 */

import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { lifecycleFieldRuleBinding } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import type { StageActionCatalogV1, StageActionRecommendation } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import {
    lifecycleFieldRequirementById,
    type LifecycleStageFieldRules,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { getPlatformAction } from "@/lib/platform/actions/platformActionCatalog";

import { actionCompetesWithCurrentWorkCompletion } from "./currentWorkActionSurfacePolicy";
import type {
    CurrentWorkActionRefLookup,
    CurrentWorkTemplateChecklistConfig,
    CurrentWorkTemplateConfigOverlay,
} from "./currentWorkTemplateConfig";
import type { PublishedStageInputsForCurrentWork } from "./resolvePublishedStageInputsForCurrentWork";

export type ResolveCurrentWorkTemplateFromPublishedPlanInput = PublishedStageInputsForCurrentWork & {
    stageWorkRuntime: StageWorkRuntimeProjection | null;
    recordHeaderActions?: ResolvedActionsBySlot | null;
};

export type ResolvedCurrentWorkPublishedConfig = {
    templateConfig: CurrentWorkTemplateConfigOverlay;
    actionRegistry: CurrentWorkActionRefLookup;
    completedChecklistKeys: ReadonlySet<string>;
};

function entityScope(entity: string | undefined): CurrentWorkTemplateChecklistConfig["scope"] {
    switch (entity) {
        case "child":
            return "child";
        case "person":
            return "person";
        default:
            return "record";
    }
}

function actionLabel(actionKey: string, overrideLabel?: string | null): string {
    const override = overrideLabel?.trim();
    if (override) return override;
    const canonical = canonicalActionDefinition(actionKey);
    if (canonical?.label) return canonical.label;
    const platform = getPlatformAction(actionKey);
    if (platform?.defaultLabel) return platform.defaultLabel;
    return actionKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function catalogActionBucket(
    actionKey: string,
    recommendation: StageActionRecommendation,
): "supporting" | "alternate_path" | "communication" | null {
    const canonicalCategory = canonicalActionDefinition(actionKey)?.category;
    const platformCategory = getPlatformAction(actionKey)?.category;
    const category = canonicalCategory ?? platformCategory;

    if (category === "communication") return "communication";
    if (actionCompetesWithCurrentWorkCompletion(actionKey)) return "alternate_path";
    if (recommendation === "context_dependent") return "alternate_path";
    if (recommendation === "recommended" || recommendation === "ready") return "supporting";
    return "supporting";
}

function activeWorkTemplate(
    plan: StageOperatingPlanV1,
    runtime: StageWorkRuntimeProjection | null,
): StageWorkTemplateV1 | null {
    const openKey =
        runtime?.primary?.state === "open"
            ? runtime.primary.template_key
            : [runtime?.primary, ...(runtime?.additional ?? [])]
                  .filter(Boolean)
                  .find((item) => item!.state === "open")
                  ?.template_key ?? null;

    if (openKey) {
        const match = plan.work_templates.find((t) => t.template_key === openKey);
        if (match) return match;
    }

    const primaryFromPlan = plan.work_templates.find((t) => t.primary) ?? plan.work_templates[0] ?? null;
    if (primaryFromPlan) return primaryFromPlan;

    const runtimePrimaryKey = runtime?.primary?.template_key?.trim();
    if (runtimePrimaryKey) {
        return plan.work_templates.find((t) => t.template_key === runtimePrimaryKey) ?? null;
    }

    return null;
}

function checklistFromWorkTemplates(plan: StageOperatingPlanV1): CurrentWorkTemplateChecklistConfig[] {
    return plan.work_templates.map((template) => ({
        key: template.template_key,
        label: template.label,
        required: template.required,
        scope: "record",
    }));
}

function checklistFromFieldRules(fieldRules: LifecycleStageFieldRules | null): CurrentWorkTemplateChecklistConfig[] {
    if (!fieldRules) return [];
    const required = new Set(fieldRules.required_rule_ids);
    const items: CurrentWorkTemplateChecklistConfig[] = [];
    const seen = new Set<string>();

    for (const ruleId of [...fieldRules.required_rule_ids, ...fieldRules.recommended_rule_ids]) {
        if (!ruleId || seen.has(ruleId)) continue;
        seen.add(ruleId);
        const binding = lifecycleFieldRuleBinding(ruleId);
        const catalog = lifecycleFieldRequirementById(ruleId);
        items.push({
            key: ruleId,
            label: catalog?.field_label ?? ruleId,
            required: required.has(ruleId),
            scope: entityScope(binding?.entity ?? catalog?.entity),
        });
    }

    return items;
}

function mergeChecklistConfigs(
    primary: CurrentWorkTemplateChecklistConfig[],
    secondary: CurrentWorkTemplateChecklistConfig[],
): CurrentWorkTemplateChecklistConfig[] {
    const byKey = new Map<string, CurrentWorkTemplateChecklistConfig>();
    for (const row of primary) byKey.set(row.key, row);
    for (const row of secondary) {
        if (!byKey.has(row.key)) byKey.set(row.key, row);
    }
    return [...byKey.values()];
}

function completedTemplateKeys(runtime: StageWorkRuntimeProjection | null): ReadonlySet<string> {
    const keys = new Set<string>();
    if (!runtime) return keys;
    const items = [runtime.primary, ...runtime.additional].filter(Boolean);
    for (const item of items) {
        if (item!.state === "completed") keys.add(item!.template_key);
    }
    return keys;
}

function buildActionRegistry(args: {
    actionCatalog: StageActionCatalogV1 | null;
    recordHeaderActions?: ResolvedActionsBySlot | null;
}): CurrentWorkActionRefLookup {
    const registry = new Map<string, { key: string; label: string; description?: string | null }>();

    for (const candidate of args.actionCatalog?.candidate_actions ?? []) {
        const key = candidate.action_key.trim();
        if (!key || registry.has(key)) continue;
        registry.set(key, {
            key,
            label: actionLabel(key, candidate.override_label),
        });
    }

    const slots = args.recordHeaderActions;
    if (slots) {
        for (const action of [
            ...(slots.primary ?? []),
            ...(slots.secondary ?? []),
            ...(slots.header ?? []),
            ...(slots.overflow ?? []),
        ]) {
            const key = action.key.trim();
            if (!key || registry.has(key)) continue;
            registry.set(key, {
                key,
                label: action.label,
                description: action.description,
            });
        }
    }

    return registry;
}

function actionsFromCatalog(actionCatalog: StageActionCatalogV1 | null): {
    supporting: Array<{ action_ref: string }>;
    alternate_paths: Array<{ action_ref: string }>;
    communication_actions: Array<{ action_ref: string }>;
} {
    const supporting: Array<{ action_ref: string }> = [];
    const alternate_paths: Array<{ action_ref: string }> = [];
    const communication_actions: Array<{ action_ref: string }> = [];
    const seen = new Set<string>();

    for (const candidate of actionCatalog?.candidate_actions ?? []) {
        const key = candidate.action_key.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const bucket = catalogActionBucket(key, candidate.recommendation);
        if (bucket === "communication") {
            communication_actions.push({ action_ref: key });
        } else if (bucket === "alternate_path") {
            alternate_paths.push({ action_ref: key });
        } else if (bucket === "supporting") {
            supporting.push({ action_ref: key });
        }
    }

    return { supporting, alternate_paths, communication_actions };
}

/**
 * Adapt published builder configuration into a Current Work template overlay.
 * Returns null when no operating plan is available.
 */
export function resolveCurrentWorkTemplateFromPublishedPlan(
    input: ResolveCurrentWorkTemplateFromPublishedPlanInput,
): ResolvedCurrentWorkPublishedConfig | null {
    const { operatingPlan, actionCatalog, fieldRules, stageWorkRuntime, recordHeaderActions } = input;
    const activeTemplate = activeWorkTemplate(operatingPlan, stageWorkRuntime);
    const workKey = activeTemplate?.template_key ?? stageWorkRuntime?.primary?.template_key ?? "unknown";

    const checklist = mergeChecklistConfigs(
        checklistFromWorkTemplates(operatingPlan),
        checklistFromFieldRules(fieldRules),
    );

    const catalogActions = actionsFromCatalog(actionCatalog);
    const actionRegistry = buildActionRegistry({ actionCatalog, recordHeaderActions });

    const templateConfig: CurrentWorkTemplateConfigOverlay = {
        work_key: workKey,
        title: activeTemplate?.label ?? stageWorkRuntime?.primary?.label ?? undefined,
        description:
            activeTemplate?.description?.trim()
            ?? stageWorkRuntime?.primary?.description?.trim()
            ?? operatingPlan.purpose?.trim()
            ?? undefined,
        checklist,
        ...(catalogActions.supporting.length ? { supporting_actions: catalogActions.supporting } : {}),
        ...(catalogActions.alternate_paths.length ? { alternate_paths: catalogActions.alternate_paths } : {}),
        ...(catalogActions.communication_actions.length
            ? { communication_actions: catalogActions.communication_actions }
            : {}),
    };

    return {
        templateConfig,
        actionRegistry,
        completedChecklistKeys: completedTemplateKeys(stageWorkRuntime),
    };
}
