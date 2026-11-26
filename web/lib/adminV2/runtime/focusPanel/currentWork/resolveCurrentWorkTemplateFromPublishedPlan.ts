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

import { resolveStageCommands } from "@/lib/lifecycle/stageCommands";
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

    // The stage's commands — every one the card can render must resolve, not only the active work's.
    for (const row of resolveStageCommands(args.stageOperatingPlan ?? null).commands) {
        register(row.action_ref, actionLabel(row.action_ref, row.override_label));
    }
    const template = args.activeTemplate;
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

        // Carried, not dropped: an action configured to operate on one of this stage's work
        // templates needs that key at invoke time, and this is the only place it can travel.
        const workTemplateKey = candidate.work_template_key?.trim();
        const ref = { action_ref: key, ...(workTemplateKey ? { work_template_key: workTemplateKey } : {}) };

        const bucket = catalogActionBucket(key, candidate.recommendation);
        if (bucket === "communication") {
            communication_actions.push({ action_ref: key });
        } else if (bucket === "alternate_path") {
            alternate_paths.push(ref);
        } else if (bucket === "supporting") {
            supporting.push(ref);
        }
    }

    return { supporting, alternate_paths, communication_actions };
}

/**
 * The stage action catalog's supporting commands, split by what they are now:
 *   - `startWork` — bound to one of the stage's work items (`stage_work.start`); authored on the
 *     stage's startable-work editor and always composed beside the stage's commands.
 *   - `legacyCommands` — unbound; folded into a LEGACY plan's derived stage commands only.
 */
export function stageCatalogSupportingCommands(actionCatalog: StageActionCatalogV1 | null): {
    startWork: StageWorkTemplateActionRefV1[];
    legacyCommands: StageWorkTemplateActionRefV1[];
} {
    const supporting = actionsFromCatalog(actionCatalog).supporting;
    return {
        startWork: supporting.filter((row) => row.work_template_key?.trim()),
        legacyCommands: supporting.filter((row) => !row.work_template_key?.trim()),
    };
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

    /*
     * STAGE COMMANDS — one flat, ordered list per stage, whichever work item is open.
     *
     * The card used to read `primary_action` + `helpful_actions` from the ONE active work template,
     * so a command authored on any other work item of the stage never reached the operator, and the
     * "primary" one was styled differently from the rest. Commands are stage-owned now: every one of
     * them is a peer, and none is promoted over Record Outcome by being first. A work template's
     * legacy `primary_action` / `execution_mode` no longer shape this surface — `resolveStageCommands`
     * folds them into the stage list for plans saved before the list existed.
     */
    const catalogSupporting = stageCatalogSupportingCommands(processAwareCatalog);
    templateConfig.helpful_actions = resolveStageCommands(operatingPlan, {
        legacyCatalogCommands: catalogSupporting.legacyCommands,
    }).commands.map((row) => ({
        action_ref: row.action_ref,
        ...(row.override_label?.trim() ? { override_label: row.override_label.trim() } : {}),
    }));
    templateConfig.helpful_actions_explicit = true;

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

    /*
     * The stage's START-WORK controls (catalog actions bound to one of its work items). Authored on
     * the stage's startable-work editor, they compose beside the stage commands rather than being
     * part of that list — see `resolvedHelpfulActionRefs`. Unbound catalog actions are not composed
     * here: they are folded into a legacy plan's derived stage commands above.
     */
    if (catalogSupporting.startWork.length) {
        /*
         * An action bound to a work template is LABELLED by that work.
         *
         * The capability's own label is "Start stage work", which is the right name for the generic
         * thing it does and the wrong name on a button. A stage may configure several startable
         * templates, and they would all render identically — an operator would face two or three
         * identical controls with no way to tell which starts the offer and which starts the packet.
         *
         * Taken from the stage's own plan rather than authored again, so a renamed work template
         * renames its control and the two can never disagree. An explicit override still wins.
         */
        const workLabelByKey = new Map(
            (operatingPlan?.work_templates ?? []).map((t) => [t.template_key, (t.label ?? "").trim()]),
        );
        templateConfig.stage_actions = catalogSupporting.startWork.map((row) => {
            const boundKey = row.work_template_key?.trim();
            const boundLabel = boundKey ? workLabelByKey.get(boundKey) : undefined;
            const label = row.override_label?.trim() || boundLabel || undefined;
            return {
                action_ref: row.action_ref,
                ...(label ? { override_label: label } : {}),
                ...(boundKey ? { work_template_key: boundKey } : {}),
            };
        });
    }

    return {
        templateConfig,
        actionRegistry,
        completedChecklistKeys: completedTemplateKeys(stageWorkRuntime),
    };
}
