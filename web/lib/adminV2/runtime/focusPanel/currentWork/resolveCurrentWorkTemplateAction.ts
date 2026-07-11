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

export type ResolvedCurrentWorkTemplateAction = {
    actionRef: string;
    intentKey: string;
    label: string;
    description: string | null;
    handlerKey: string;
    requiresSubjectPicker: boolean;
};

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
    };
}
