/**
 * Action intent execution — operator intent vs target scope.
 *
 * Work Templates store intent-level action_ref values (e.g. move_to_waitlist).
 * Runtime resolves execution keys and subject selection from process configuration.
 *
 * Does not replace the Action Registry — registry owns handlers; this layer maps
 * configured intent → execution ref + selection mode.
 */

import {
    normalizeActionRefToIntentKey,
    resolveIntentExecutionRef,
    resolveWorkTemplateSubjectGrain,
    workTemplateActionIntentForKey,
} from "@/lib/lifecycle/workTemplateActionIntentCatalog";
import { getPlatformAction } from "@/lib/platform/actions/platformActionCatalog";

export type ActionIntentSelectionMode = "configured" | "single" | "one_or_more" | "all";

export type ActionIntentApplicableSubject = {
    id: string;
    label: string;
    grain?: string;
};

export type ActionIntentExecutionPlan = {
    /** Canonical intent ref (matches Work Template action_ref). */
    intentKey: string;
    /** Registry / mutation execution key — backward compatible with legacy saved refs. */
    executionKey: string;
    selectionMode: ActionIntentSelectionMode;
    applicableSubjects: ActionIntentApplicableSubject[];
    /** When true, action surface should prompt before execute (future UI). */
    requiresSubjectPicker: boolean;
};

function selectionModeForExecutionKey(executionKey: string): ActionIntentSelectionMode {
    const platform = getPlatformAction(executionKey);
    if (platform?.supportsMultiSubject) return "one_or_more";
    return "configured";
}

export function evaluateRequiresSubjectPicker(
    applicableSubjects: ActionIntentApplicableSubject[],
    selectionMode: ActionIntentSelectionMode,
): boolean {
    return (
        applicableSubjects.length > 1
        && (selectionMode === "one_or_more" || selectionMode === "all")
    );
}

/**
 * Resolve applicable subjects for multi-target intents.
 * Future: driven by process subject grain + related-subject configuration.
 * Minimum: empty list → single configured process subject (no picker).
 */
export function resolveApplicableSubjectsForIntent(_input: {
    intentKey: string;
    truth?: Record<string, unknown>;
    stageDefinition?: unknown;
    processDefinition?: unknown;
}): ActionIntentApplicableSubject[] {
    return [];
}

/**
 * Resolve operator intent ref → execution plan.
 * Legacy saved execution aliases (e.g. waitlist_child) still execute unchanged.
 */
export function resolveActionIntentExecution(input: {
    actionRef: string;
    processDefinition?: unknown;
    stageDefinition?: unknown;
    truth?: Record<string, unknown>;
}): ActionIntentExecutionPlan {
    const rawRef = input.actionRef.trim();
    const intent = workTemplateActionIntentForKey(rawRef);
    const intentKey = normalizeActionRefToIntentKey(rawRef);

    if (!intent) {
        return {
            intentKey: rawRef,
            executionKey: rawRef,
            selectionMode: selectionModeForExecutionKey(rawRef),
            applicableSubjects: [],
            requiresSubjectPicker: false,
        };
    }

    const subjectGrain = resolveWorkTemplateSubjectGrain({
        processDefinition: input.processDefinition,
        stageDefinition: input.stageDefinition,
    });

    // Legacy configs may persist a grain-specific alias — honor as execution key when explicit.
    const executionKey =
        rawRef !== intent.intentKey && intent.aliases.includes(rawRef)
            ? rawRef
            : resolveIntentExecutionRef(intent, subjectGrain);

    const selectionMode = selectionModeForExecutionKey(executionKey);
    const applicableSubjects = resolveApplicableSubjectsForIntent({
        intentKey: intent.intentKey,
        truth: input.truth,
        stageDefinition: input.stageDefinition,
        processDefinition: input.processDefinition,
    });

    return {
        intentKey,
        executionKey,
        selectionMode,
        applicableSubjects,
        requiresSubjectPicker: evaluateRequiresSubjectPicker(applicableSubjects, selectionMode),
    };
}
