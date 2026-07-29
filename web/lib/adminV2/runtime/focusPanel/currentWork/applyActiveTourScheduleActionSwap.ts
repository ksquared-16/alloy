/**
 * Presentation swap: when a tour booking already exists, a configured `schedule_tour`
 * action becomes "Reschedule / Cancel tour" — click opens a choice that routes to the
 * existing `reschedule_tour` / `cancel_tour` capabilities.
 *
 * Pure. Does not invent new tour plumbing; only remaps the visible action when
 * `tourScheduled` is true.
 */

import type { CurrentWorkActionVM } from "./currentWorkSurfaceTypes";

export const MANAGE_ACTIVE_TOUR_HANDLER_KEY = "manage_active_tour";

export const MANAGE_ACTIVE_TOUR_LABEL = "Reschedule / Cancel tour";

function actionCapabilityKey(
    action: Pick<CurrentWorkActionVM, "key" | "handlerKey" | "actionRef">,
): string {
    return (action.handlerKey ?? action.actionRef ?? action.key).trim();
}

export function isScheduleTourAction(
    action: Pick<CurrentWorkActionVM, "key" | "handlerKey" | "actionRef">,
): boolean {
    return actionCapabilityKey(action) === "schedule_tour";
}

export function isManageActiveTourAction(
    action: Pick<CurrentWorkActionVM, "key" | "handlerKey" | "actionRef">,
): boolean {
    return actionCapabilityKey(action) === MANAGE_ACTIVE_TOUR_HANDLER_KEY;
}

/**
 * When a tour is scheduled, remap `schedule_tour` → manage-active-tour chooser.
 * When no tour is scheduled, leave actions untouched (including any manage key).
 *
 * Keeps the original `key` so workspace intents / config identity still match
 * `schedule_tour`; presentation + host resolution use handlerKey/actionRef.
 */
export function applyActiveTourScheduleActionSwap(
    action: CurrentWorkActionVM,
    tourScheduled: boolean,
): CurrentWorkActionVM {
    if (!tourScheduled || !isScheduleTourAction(action)) return action;
    return {
        ...action,
        label: MANAGE_ACTIVE_TOUR_LABEL,
        description:
            action.description?.trim()
            || "Reschedule or cancel the active tour booking for this family.",
        handlerKey: MANAGE_ACTIVE_TOUR_HANDLER_KEY,
        actionRef: MANAGE_ACTIVE_TOUR_HANDLER_KEY,
    };
}

export function applyActiveTourScheduleActionSwapAll(
    actions: CurrentWorkActionVM[],
    tourScheduled: boolean,
): CurrentWorkActionVM[] {
    if (!tourScheduled) return actions;
    return actions.map((action) => applyActiveTourScheduleActionSwap(action, true));
}
