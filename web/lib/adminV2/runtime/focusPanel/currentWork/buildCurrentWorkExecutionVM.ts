/**
 * Unambiguous Current Work execution semantics derived from Work Template config.
 */

import type { WorkTemplateExecutionMode } from "@/lib/lifecycle/resolveWorkTemplateExecutionMode";
import { resolveWorkTemplateExecutionMode } from "@/lib/lifecycle/resolveWorkTemplateExecutionMode";
import type { CurrentWorkActionVM } from "./currentWorkSurfaceTypes";
import type { CurrentWorkTemplateConfigOverlay } from "./currentWorkTemplateConfig";

export type CurrentWorkExecutionProminence = "primary_action" | "record_outcome" | "none";

export type CurrentWorkExecutionVM = {
    executionMode: WorkTemplateExecutionMode;
    /** Leading operator CTA category for Current Work chrome. */
    prominentCta: CurrentWorkExecutionProminence;
    hasExecutablePrimaryAction: boolean;
    hasRecordOutcome: boolean;
    /** True when primaryAction is real config — never expand_work / title fabrication. */
    primaryActionIsExecutable: boolean;
};

export function isExecutablePrimaryAction(action: CurrentWorkActionVM | null | undefined): boolean {
    if (!action) return false;
    if (action.disabled) return false;
    if (action.handlerKey === "expand_work") return false;
    if (action.handlerKey === "record_outcome") return false;
    const ref = action.actionRef?.trim();
    if (!ref) return false;
    return Boolean(action.handlerKey || ref);
}

export function buildCurrentWorkExecutionVM(input: {
    templateConfig?: CurrentWorkTemplateConfigOverlay | null;
    primaryAction?: CurrentWorkActionVM | null;
    recordOutcomeAction?: CurrentWorkActionVM | null;
    showOutcomeCompletion?: boolean;
}): CurrentWorkExecutionVM {
    const executionMode = resolveWorkTemplateExecutionMode({
        primary_action: input.templateConfig?.primary_action,
        execution_mode: input.templateConfig?.execution_mode,
    });
    const hasExecutablePrimaryAction = isExecutablePrimaryAction(input.primaryAction);
    const hasRecordOutcome = Boolean(input.recordOutcomeAction) || input.showOutcomeCompletion === true;
    const primaryActionIsExecutable = hasExecutablePrimaryAction;

    let prominentCta: CurrentWorkExecutionProminence = "none";
    if (executionMode === "direct_action" && hasExecutablePrimaryAction) {
        prominentCta = "primary_action";
    } else if (hasRecordOutcome) {
        prominentCta = "record_outcome";
    } else if (hasExecutablePrimaryAction) {
        prominentCta = "primary_action";
    }

    return {
        executionMode,
        prominentCta,
        hasExecutablePrimaryAction,
        hasRecordOutcome,
        primaryActionIsExecutable,
    };
}
