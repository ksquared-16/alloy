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
import type { ActionBlocker } from "@/lib/adminV2/actions/actionTypes";

export type CurrentWorkActionExecutionPlan =
    | { kind: "record_outcome" }
    | { kind: "open_workspace" }
    | { kind: "open_inline_panel"; action: CurrentWorkActionVM; surface: CurrentWorkActionSurface }
    | { kind: "communications_composer" }
    | { kind: "header_delegate"; action: CurrentWorkActionVM }
    | { kind: "process_transition"; action: CurrentWorkActionVM; nextStatusKey: string }
    | { kind: "cancel_tour"; bookingId: string }
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

    const key = (action.handlerKey ?? action.key).trim();
    if (key === "cancel_tour") {
        const bookingId = (action.actionRef ?? "").trim();
        if (!bookingId) {
            return {
                kind: "blocked",
                reason: "No active tour booking is available to cancel.",
            };
        }
        return { kind: "cancel_tour", bookingId };
    }

    const surface = resolveCurrentWorkActionSurface(action);

    switch (surface) {
        case "inline_form":
        case "form_delivery":
        case "subject_selector":
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
                    || "This action is not available from What's Next.",
                action,
            };
    }
}

/**
 * Command integrity (Slice F) — the resolved execution state of a Current Work action.
 *
 * Every visible enabled action must be provably executable. This classifies the SYNC-derivable
 * integrity of an action (capability resolution, host support, binding presence, transition
 * destination, disabled flag). Full server-side eligibility (async, Supabase-backed
 * `ActionEligibility`) still gates at execution time — this never duplicates that engine, it
 * reuses its `ActionBlocker` vocabulary for the reasons.
 *
 * - `executable` — resolves to a supported host with a valid binding; may render enabled.
 * - `disabled` — capability present but not currently available (no stated reason).
 * - `blocked` — unavailable with a stated reason/handoff the operator can act on.
 * - `configuration_error` — no runnable capability resolved (unsupported host / missing binding /
 *   missing transition destination). Engineer/admin-observable; never shown to operators.
 * - `hidden` — nothing to render (no key/label).
 */
export type CurrentWorkActionExecutionStatus =
    | "executable"
    | "disabled"
    | "blocked"
    | "hidden"
    | "configuration_error";

export type CurrentWorkActionExecution = {
    status: CurrentWorkActionExecutionStatus;
    /** Reuses the Action Runtime blocker vocabulary — not a parallel status system. */
    blockers: ActionBlocker[];
};

/** Classify an action's resolved execution state from metadata + capability resolution only. */
export function resolveCurrentWorkActionExecution(action: CurrentWorkActionVM): CurrentWorkActionExecution {
    const key = action.key?.trim();
    const label = action.label?.trim();
    if (!key || !label) {
        return { status: "hidden", blockers: [{ code: "no_binding", message: "Action has no key or label to render." }] };
    }
    if (action.disabled) {
        const reason = action.disabledReason?.trim();
        return reason
            ? { status: "blocked", blockers: [{ code: "blocked", message: reason }] }
            : { status: "disabled", blockers: [{ code: "disabled", message: "This action is not available right now." }] };
    }
    const plan = planCurrentWorkActionExecution(action);
    switch (plan.kind) {
        case "unsupported":
            return {
                status: "configuration_error",
                blockers: [{ code: "unsupported_capability", message: plan.reason }],
            };
        case "blocked":
            return { status: "blocked", blockers: [{ code: "blocked", message: plan.reason }] };
        default:
            return { status: "executable", blockers: [] };
    }
}

/** Operators see actionable + clearly-unavailable-with-reason; config errors/hidden are engineer-only. */
export function isOperatorVisibleActionStatus(status: CurrentWorkActionExecutionStatus): boolean {
    return status === "executable" || status === "disabled" || status === "blocked";
}

/** True when an action may render as an enabled control. Prefers the VM-threaded state. */
export function isCurrentWorkActionExecutable(action: CurrentWorkActionVM): boolean {
    const status = action.execution?.status ?? resolveCurrentWorkActionExecution(action).status;
    return status === "executable";
}

/**
 * Helpful-command fidelity: operators see executable + disabled/blocked-with-reason.
 * Config/runtime errors stay engineer-only (never silently drop a configured helpful command
 * merely because it is currently blocked).
 */
export function isCurrentWorkActionOperatorVisible(action: CurrentWorkActionVM): boolean {
    const status = action.execution?.status ?? resolveCurrentWorkActionExecution(action).status;
    return isOperatorVisibleActionStatus(status);
}
