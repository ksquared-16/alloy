/**
 * Canonical Current Work action execution planner.
 * Presentation components must not switch on action keys — they call this,
 * then perform the returned step via Focus Panel coordination / inline panel.
 */

import {
    resolveCurrentWorkActionSurface,
    type CurrentWorkActionSurface,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

export type CurrentWorkActionExecutionPlan =
    | { kind: "record_outcome" }
    | { kind: "open_workspace" }
    | { kind: "open_inline_panel"; action: CurrentWorkActionVM; surface: CurrentWorkActionSurface }
    | { kind: "communications_composer" }
    | { kind: "header_delegate"; action: CurrentWorkActionVM }
    | { kind: "process_transition"; action: CurrentWorkActionVM; nextStatusKey: string }
    | { kind: "blocked"; reason: string }
    | { kind: "unsupported"; reason: string; action: CurrentWorkActionVM };

/**
 * Resolve how a Current Work action should execute.
 * Does not perform side effects — the host applies the plan.
 */
export function planCurrentWorkActionExecution(
    action: CurrentWorkActionVM,
): CurrentWorkActionExecutionPlan {
    if (action.disabled) {
        return {
            kind: "blocked",
            reason: action.disabledReason?.trim() || "This action is not available right now.",
        };
    }

    if (action.handlerKey === "record_outcome") {
        return { kind: "record_outcome" };
    }

    if (action.handlerKey === "expand_work") {
        return { kind: "open_workspace" };
    }

    const surface = resolveCurrentWorkActionSurface(action);

    switch (surface) {
        case "inline_form":
            return { kind: "open_inline_panel", action, surface };
        case "process_transition": {
            const nextStatusKey = (action.actionRef ?? action.key).trim();
            if (!nextStatusKey) {
                return {
                    kind: "unsupported",
                    reason: "This transition is missing a destination stage.",
                    action,
                };
            }
            return { kind: "process_transition", action, nextStatusKey };
        }
        case "communications_composer":
            return { kind: "communications_composer" };
        case "header_delegate":
            return { kind: "header_delegate", action };
        case "unsupported":
        default:
            return {
                kind: "unsupported",
                reason:
                    action.disabledReason?.trim()
                    || "This action is not available from Current Work.",
                action,
            };
    }
}

/** True when an action may render as an enabled control. */
export function isCurrentWorkActionExecutable(action: CurrentWorkActionVM): boolean {
    const plan = planCurrentWorkActionExecution(action);
    return (
        plan.kind === "record_outcome"
        || plan.kind === "open_workspace"
        || plan.kind === "open_inline_panel"
        || plan.kind === "communications_composer"
        || plan.kind === "header_delegate"
        || plan.kind === "process_transition"
    );
}
