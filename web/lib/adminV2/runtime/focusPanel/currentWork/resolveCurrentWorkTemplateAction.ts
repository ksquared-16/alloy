/**
 * Resolve Work Template action_ref → Current Work action VM fields.
 * Intent-first: actionRef stores operator intent; handlerKey stores execution ref.
 */

import { resolveActionIntentExecution } from "@/lib/lifecycle/resolveActionIntentExecution";
import {
    intentOperatorLabel,
    normalizeActionRefToIntentKey,
} from "@/lib/lifecycle/workTemplateActionIntentCatalog";

import type { CurrentWorkActionRefLookup } from "./currentWorkTemplateConfig";
import { actionFromRef } from "./currentWorkTemplateConfig";

export type CurrentWorkRelatedSubjectResolution = "enrollment_child";

export type ResolvedCurrentWorkTemplateAction = {
    actionRef: string;
    intentKey: string;
    label: string;
    description: string | null;
    handlerKey: string;
    requiresSubjectPicker: boolean;
    relatedSubjectResolution: CurrentWorkRelatedSubjectResolution | null;
    blockedReason: string | null;
};

export function relatedSubjectResolutionForExecutionKey(
    executionKey: string,
): CurrentWorkRelatedSubjectResolution | null {
    const key = executionKey.trim();
    // Intent key (move_to_waitlist) and executor key (waitlist_child) both need child subject resolution.
    if (key === "waitlist_child" || key === "move_to_waitlist") return "enrollment_child";
    return null;
}

export function resolveCurrentWorkTemplateAction(input: {
    actionRef: string;
    overrideLabel?: string | null;
    lookup?: CurrentWorkActionRefLookup | null;
    processDefinition?: unknown;
    stageDefinition?: unknown;
    truth?: Record<string, unknown>;
}): ResolvedCurrentWorkTemplateAction | null {
    const rawRef = input.actionRef.trim();
    if (!rawRef) return null;

    const plan = resolveActionIntentExecution({
        actionRef: rawRef,
        processDefinition: input.processDefinition,
        stageDefinition: input.stageDefinition,
        truth: input.truth,
    });

    const intentKey = plan.intentKey;
    const lookupRef = actionFromRef(input.lookup, rawRef, input.overrideLabel)
        ?? actionFromRef(input.lookup, intentKey, input.overrideLabel);

    const label =
        intentOperatorLabel(rawRef, input.overrideLabel)
        ?? lookupRef?.label
        ?? intentKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    return {
        actionRef: normalizeActionRefToIntentKey(rawRef),
        intentKey,
        label,
        description: lookupRef?.description ?? null,
        handlerKey: plan.executionKey,
        requiresSubjectPicker: plan.requiresSubjectPicker,
        relatedSubjectResolution: relatedSubjectResolutionForExecutionKey(plan.executionKey),
        blockedReason: plan.blockedReason?.trim() || null,
    };
}
