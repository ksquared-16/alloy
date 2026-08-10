import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { normalizeActionRefToIntentKey, workTemplateActionIntentForKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";

import { resolveCurrentWorkTemplateAction, relatedSubjectResolutionForExecutionKey } from "./resolveCurrentWorkTemplateAction";
import {
    actionCompetesWithCurrentWorkCompletion,
    isGenericUmbrellaLifecycleAction,
    isManageOnlyRecordHeaderAction,
} from "./currentWorkActionSurfacePolicy";
import type {
    CurrentWorkActionCategory,
    CurrentWorkActionPlacement,
    CurrentWorkActionVM,
} from "./currentWorkSurfaceTypes";

function toActionVM(
    action: ResolvedActionForClient,
    category: CurrentWorkActionCategory,
    placement: CurrentWorkActionPlacement,
): CurrentWorkActionVM {
    return {
        key: action.key,
        label: action.label,
        description: action.description,
        icon: action.icon,
        category,
        placement,
        handlerKey: action.key,
        actionRef: action.key,
        resolved: action,
        relatedSubjectResolution: relatedSubjectResolutionForExecutionKey(action.key),
    };
}

function categoryForHeaderAction(
    action: ResolvedActionForClient,
    slot: "primary" | "secondary" | "header" | "overflow",
    showOutcomeCompletion: boolean,
): CurrentWorkActionCategory {
    const key = action.key.trim();
    if (slot === "overflow" || isManageOnlyRecordHeaderAction(key)) {
        return "administrative";
    }
    if (isGenericUmbrellaLifecycleAction(key)) {
        return "alternate_path";
    }

    const canonicalCategory = canonicalActionDefinition(key)?.category;
    if (canonicalCategory === "communication") return "communication";
    if (canonicalCategory === "bos_native") return "bos_recommended";
    if (canonicalCategory === "status_lifecycle") {
        return showOutcomeCompletion ? "alternate_path" : "supporting";
    }
    if (actionCompetesWithCurrentWorkCompletion(key) && showOutcomeCompletion) {
        return "alternate_path";
    }
    return "supporting";
}

function placementForCategory(category: CurrentWorkActionCategory): CurrentWorkActionPlacement {
    switch (category) {
        case "primary":
            return "current_work_primary";
        case "supporting":
            return "current_work_supporting";
        case "communication":
            return "communications_inline";
        case "alternate_path":
            return "current_work_alternate_paths";
        case "administrative":
            return "manage_overflow";
        case "bos_recommended":
            return "bos_recommendation";
    }
}

function isLifecycleIntentAction(actionKey: string): boolean {
    const key = actionKey.trim();
    if (!key) return false;
    // Generic: intents the catalog declares as `category: "lifecycle"` are surfaced as lifecycle
    // transitions, not as generic record-header actions — regardless of which process defines them.
    return workTemplateActionIntentForKey(key)?.category === "lifecycle";
}

function isContextuallyAllowedRecordHeaderAction(
    actionKey: string,
    allowedActionKeys: ReadonlySet<string> | null | undefined,
    enforceAllowlist?: boolean,
): boolean {
    const key = actionKey.trim();
    if (!key) return false;

    const intentKey = normalizeActionRefToIntentKey(key);
    if (enforceAllowlist) {
        if (!allowedActionKeys) return false;
        return allowedActionKeys.has(key) || allowedActionKeys.has(intentKey);
    }
    if (allowedActionKeys?.size) {
        return allowedActionKeys.has(key) || allowedActionKeys.has(intentKey);
    }

    if (isLifecycleIntentAction(key)) return false;

    const category = canonicalActionDefinition(key)?.category;
    if (category === "status_lifecycle") return false;

    return true;
}

export type ClassifiedCurrentWorkActions = {
    supporting: CurrentWorkActionVM[];
    alternatePaths: CurrentWorkActionVM[];
    administrative: CurrentWorkActionVM[];
    communicationActions: CurrentWorkActionVM[];
    bosRecommendations: CurrentWorkActionVM[];
};

/**
 * Classify registry-backed record_header actions into Current Work buckets.
 * Deterministic — no enrollment-specific keys in UI.
 */
export function classifyRecordHeaderActionsForCurrentWork(args: {
    recordHeaderSlots: ResolvedActionsBySlot | null | undefined;
    showOutcomeCompletion: boolean;
    primaryActionLabel: string | null;
    /** Stage catalog + explicit template refs — record-header fallback must match these. */
    allowedActionKeys?: ReadonlySet<string> | null;
    /**
     * When true, empty allowlist blocks all actions (explicit-empty command_set_v1).
     * When false/omitted, empty allowlist preserves legacy unrestricted fallback.
     */
    enforceActionAllowlist?: boolean;
}): ClassifiedCurrentWorkActions {
    const slots = args.recordHeaderSlots;
    const supporting: CurrentWorkActionVM[] = [];
    const alternatePaths: CurrentWorkActionVM[] = [];
    const administrative: CurrentWorkActionVM[] = [];
    const communicationActions: CurrentWorkActionVM[] = [];
    const bosRecommendations: CurrentWorkActionVM[] = [];
    const seen = new Set<string>();

    const entries: Array<{ slot: "primary" | "secondary" | "header" | "overflow"; action: ResolvedActionForClient }> =
        [];
    if (slots) {
        for (const action of slots.overflow ?? []) entries.push({ slot: "overflow", action });
        for (const action of slots.primary ?? []) entries.push({ slot: "primary", action });
        for (const action of slots.secondary ?? []) entries.push({ slot: "secondary", action });
        for (const action of slots.header ?? []) entries.push({ slot: "header", action });
    }

    const primaryNorm = args.primaryActionLabel?.trim().toLowerCase().replace(/\s*→$/, "") ?? "";

    for (const { slot, action } of entries) {
        const key = action.key.trim();
        if (!key || seen.has(key)) continue;
        if (isGenericUmbrellaLifecycleAction(key)) continue;
        if (
            !isContextuallyAllowedRecordHeaderAction(
                key,
                args.allowedActionKeys,
                args.enforceActionAllowlist === true
            )
        ) {
            continue;
        }

        const labelNorm = action.label.trim().toLowerCase();
        if (primaryNorm && (labelNorm === primaryNorm || labelNorm === `${primaryNorm} →`)) continue;

        seen.add(key);
        const category = categoryForHeaderAction(action, slot, args.showOutcomeCompletion);
        const vm = toActionVM(action, category, placementForCategory(category));

        switch (category) {
            case "administrative":
                administrative.push(vm);
                break;
            case "communication":
                communicationActions.push(vm);
                break;
            case "alternate_path":
                alternatePaths.push(vm);
                break;
            case "bos_recommended":
                bosRecommendations.push(vm);
                break;
            default:
                supporting.push(vm);
        }
    }

    return { supporting, alternatePaths, administrative, communicationActions, bosRecommendations };
}

export function actionsFromConfigRefs(
    refs: Array<{ action_ref: string; override_label?: string }> | null | undefined,
    lookup: ReadonlyMap<string, { key: string; label: string; description?: string | null }>,
    category: CurrentWorkActionCategory,
    placement: CurrentWorkActionPlacement,
    intentContext?: {
        processDefinition?: unknown;
        stageDefinition?: unknown;
        truth?: Record<string, unknown>;
    },
): CurrentWorkActionVM[] {
    if (!refs?.length) return [];
    const out: CurrentWorkActionVM[] = [];
    const seen = new Set<string>();
    for (const row of refs) {
        const ref = row.action_ref.trim();
        if (!ref) continue;
        const intentKey = normalizeActionRefToIntentKey(ref);
        if (seen.has(intentKey)) continue;
        seen.add(intentKey);

        const resolved = resolveCurrentWorkTemplateAction({
            actionRef: ref,
            overrideLabel: row.override_label ?? null,
            lookup,
            processDefinition: intentContext?.processDefinition,
            stageDefinition: intentContext?.stageDefinition,
            truth: intentContext?.truth,
        });
        if (!resolved) continue;

        out.push({
            key: resolved.handlerKey,
            label: resolved.label,
            description: resolved.description,
            category,
            placement,
            handlerKey: resolved.handlerKey,
            actionRef: resolved.actionRef,
            resolved: null,
            relatedSubjectResolution: resolved.relatedSubjectResolution,
            requiresSubjectPicker: resolved.requiresSubjectPicker,
            ...(resolved.blockedReason
                ? { disabled: true, disabledReason: resolved.blockedReason, blockedReason: resolved.blockedReason }
                : { blockedReason: null }),
        });
    }
    return out;
}
