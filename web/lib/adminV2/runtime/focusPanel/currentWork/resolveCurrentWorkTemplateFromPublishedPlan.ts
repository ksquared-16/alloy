/**
 * Production adapter: published operating plan + action catalog → Current Work overlay.
 *
 * Keeps presentation components free of domain keys; maps builder configuration into
 * `CurrentWorkTemplateConfigOverlay` consumed by `buildCurrentWorkSurfaceVM`.
 *
 * Resolution hierarchy for actions:
 * 1. Explicit active Work Template configuration
 * 2. Stage action catalog compatibility fallback
 * 3. Record-header compatibility fallback (via classifyRecordHeaderActionsForCurrentWork)
 * 4. Nothing
 *
 * Explicit empty arrays disable fallback for that bucket.
 */

import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { lifecycleFieldRuleBinding } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import type { StageActionCatalogV1, StageActionRecommendation } from "@/lib/lifecycle/stageActionCatalogV1";
import type {
    StageOperatingPlanV1,
    StageWorkTemplateActionRefV1,
    StageWorkTemplateAlternatePathRefV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { isWorkTemplateTransitionRef } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import {
    lifecycleFieldRequirementById,
    type LifecycleStageFieldRules,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { transitionRefLabel } from "@/lib/lifecycle/resolveWorkTemplateActionOptions";
import {
    intentOperatorLabel,
    normalizeActionRefToIntentKey,
    workTemplateActionIntentForKey,
} from "@/lib/lifecycle/workTemplateActionIntentCatalog";
import { resolveCurrentWorkFieldRuleDisplayLabel } from "./resolveCurrentWorkFieldRuleDisplayLabel";
import { getPlatformAction } from "@/lib/platform/actions/platformActionCatalog";

import { actionCompetesWithCurrentWorkCompletion, isGenericUmbrellaLifecycleAction } from "./currentWorkActionSurfacePolicy";
import type {
    CurrentWorkActionRefLookup,
    CurrentWorkTemplateChecklistConfig,
    CurrentWorkTemplateConfigOverlay,
} from "./currentWorkTemplateConfig";
import type { PublishedStageInputsForCurrentWork } from "./resolvePublishedStageInputsForCurrentWork";
import { filterStageCatalogToProcessSelection } from "@/lib/lifecycle/processRuntimeCommandProjection";

export type ResolveCurrentWorkTemplateFromPublishedPlanInput = PublishedStageInputsForCurrentWork & {
    stageWorkRuntime: StageWorkRuntimeProjection | null;
    recordHeaderActions?: ResolvedActionsBySlot | null;
    processStages?: Array<{ key: string; label: string }> | null;
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
    if (isGenericUmbrellaLifecycleAction(actionKey)) return null;
    if (category === "status_lifecycle") {
        if (recommendation === "recommended" || recommendation === "ready") return "supporting";
        return "alternate_path";
    }
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
        kind: "stage_work",
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
            label: resolveCurrentWorkFieldRuleDisplayLabel(ruleId),
            required: required.has(ruleId),
            scope: entityScope(binding?.entity ?? catalog?.entity),
            kind: "requirement",
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
    activeTemplate: StageWorkTemplateV1 | null;
    processStages?: Array<{ key: string; label: string }> | null;
    stageKey?: string;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: unknown;
}): CurrentWorkActionRefLookup {
    const registry = new Map<string, { key: string; label: string; description?: string | null }>();

    const register = (key: string, label: string, description?: string | null) => {
        const trimmed = key.trim();
        if (!trimmed) return;
        const intentKey = normalizeActionRefToIntentKey(trimmed);
        if (!registry.has(intentKey)) {
            registry.set(intentKey, { key: intentKey, label, description: description ?? null });
        }
        if (trimmed !== intentKey && !registry.has(trimmed)) {
            registry.set(trimmed, { key: trimmed, label, description: description ?? null });
        }
    };

    for (const candidate of args.actionCatalog?.candidate_actions ?? []) {
        const key = candidate.action_key.trim();
        if (!key) continue;
        if (workTemplateActionIntentForKey(key) && key !== normalizeActionRefToIntentKey(key)) {
            continue;
        }
        register(key, actionLabel(key, candidate.override_label));
    }

    const template = args.activeTemplate;
    if (template?.primary_action?.action_ref) {
        register(
            template.primary_action.action_ref,
            actionLabel(template.primary_action.action_ref, template.primary_action.override_label),
        );
    }
    for (const row of template?.helpful_actions ?? []) {
        register(row.action_ref, actionLabel(row.action_ref, row.override_label));
    }
    for (const row of template?.alternate_paths ?? []) {
        if (isWorkTemplateTransitionRef(row)) {
            register(
                row.transition_ref,
                row.override_label?.trim()
                    ?? transitionRefLabel(row.transition_ref, {
                        currentStageKey: args.stageKey ?? "",
                        stageOperatingPlan: args.stageOperatingPlan ?? null,
                        processTracks: args.processTracks ?? null,
                        processStages: args.processStages ?? [],
                    }),
            );
        } else {
            register(row.action_ref, actionLabel(row.action_ref, row.override_label));
        }
    }

    const slots = args.recordHeaderActions;
    if (slots) {
        for (const action of [
            ...(slots.primary ?? []),
            ...(slots.secondary ?? []),
            ...(slots.header ?? []),
            ...(slots.overflow ?? []),
        ]) {
            register(action.key, action.label, action.description);
        }
    }

    return registry;
}

function actionsFromCatalog(actionCatalog: StageActionCatalogV1 | null): {
    supporting: StageWorkTemplateActionRefV1[];
    alternate_paths: StageWorkTemplateActionRefV1[];
    communication_actions: Array<{ action_ref: string }>;
} {
    const supporting: StageWorkTemplateActionRefV1[] = [];
    const alternate_paths: StageWorkTemplateActionRefV1[] = [];
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

function mapAlternatePathRefs(
    refs: StageWorkTemplateAlternatePathRefV1[],
): CurrentWorkTemplateConfigOverlay["alternate_paths"] {
    return refs.map((row) => {
        if (isWorkTemplateTransitionRef(row)) {
            return {
                transition_ref: row.transition_ref,
                ...(row.override_label?.trim() ? { override_label: row.override_label.trim() } : {}),
            };
        }
        return {
            action_ref: row.action_ref,
            ...(row.override_label?.trim() ? { override_label: row.override_label.trim() } : {}),
        };
    });
}

/**
 * Adapt published builder configuration into a Current Work template overlay.
 * Returns null when no operating plan is available.
 */
export function resolveCurrentWorkTemplateFromPublishedPlan(
    input: ResolveCurrentWorkTemplateFromPublishedPlanInput,
): ResolvedCurrentWorkPublishedConfig | null {
    const {
        operatingPlan,
        actionCatalog,
        fieldRules,
        stageWorkRuntime,
        recordHeaderActions,
        processStages,
        processTracks,
        stageKey: publishedStageKey,
        commandProjection: explicitProjection,
    } = input;
    const commandProjection = explicitProjection ?? null;
    const processAwareCatalog = filterStageCatalogToProcessSelection(actionCatalog, commandProjection);
    const activeTemplate = activeWorkTemplate(operatingPlan, stageWorkRuntime);
    const workKey = activeTemplate?.template_key ?? stageWorkRuntime?.primary?.template_key ?? "unknown";

    const checklist = mergeChecklistConfigs(
        checklistFromWorkTemplates(operatingPlan),
        checklistFromFieldRules(fieldRules),
    );

    const catalogActions = actionsFromCatalog(processAwareCatalog);
    const actionRegistry = buildActionRegistry({
        actionCatalog: processAwareCatalog,
        recordHeaderActions,
        activeTemplate,
        processStages,
        stageKey: publishedStageKey,
        stageOperatingPlan: operatingPlan,
        processTracks: processTracks ?? null,
    });

    const templateConfig: CurrentWorkTemplateConfigOverlay = {
        work_key: workKey,
        title: activeTemplate?.label ?? stageWorkRuntime?.primary?.label ?? undefined,
        description:
            activeTemplate?.description?.trim()
            ?? stageWorkRuntime?.primary?.description?.trim()
            ?? operatingPlan.purpose?.trim()
            ?? undefined,
        checklist,
    };

    if (activeTemplate?.execution_mode === "direct_action" || activeTemplate?.execution_mode === "outcome_led") {
        templateConfig.execution_mode = activeTemplate.execution_mode;
    }

    if (activeTemplate?.primary_action?.action_ref?.trim()) {
        templateConfig.primary_action = {
            action_ref: activeTemplate.primary_action.action_ref.trim(),
            ...(activeTemplate.primary_action.override_label?.trim()
                ? { override_label: activeTemplate.primary_action.override_label.trim() }
                : {}),
        };
    }

    if (activeTemplate?.helpful_actions !== undefined) {
        templateConfig.helpful_actions = activeTemplate.helpful_actions.map((row) => ({
            action_ref: row.action_ref,
            ...(row.override_label?.trim() ? { override_label: row.override_label.trim() } : {}),
        }));
        templateConfig.helpful_actions_explicit = true;
    } else {
        // Config fidelity: do not invent helpful commands from stage catalog when the Work
        // Template omitted helpful_actions. Empty means empty.
        templateConfig.helpful_actions = [];
        templateConfig.helpful_actions_explicit = true;
    }

    // Legacy Work Template alternate_paths: parse safely for stored plans but do not
    // emit as Current Work Other Transitions — those derive from process edges only.
    if (activeTemplate?.alternate_paths !== undefined) {
        void mapAlternatePathRefs(activeTemplate.alternate_paths);
    }

    if (activeTemplate?.outcome_refs !== undefined) {
        templateConfig.outcome_refs = activeTemplate.outcome_refs.map((row) => ({
            outcome_ref: row.outcome_ref,
        }));
        templateConfig.outcome_refs_explicit = true;
    }

    if (catalogActions.communication_actions.length) {
        templateConfig.communication_actions = catalogActions.communication_actions;
    }

    return {
        templateConfig,
        actionRegistry,
        completedChecklistKeys: completedTemplateKeys(stageWorkRuntime),
    };
}
