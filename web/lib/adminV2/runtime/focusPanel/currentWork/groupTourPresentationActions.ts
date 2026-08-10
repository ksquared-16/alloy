/**
 * Presentation-only Tour ▾ grouping for What's Next helpful actions.
 * Does not invent commands — partitions an already-resolved action list.
 */

const TOUR_PRESENTATION_ACTION_KEYS = new Set([
    "schedule_tour",
    "reschedule_tour",
    "send_tour_invitation",
    "record_tour_outcome",
    "confirm_tour",
    "cancel_tour",
    "complete_tour",
    "no_show_tour",
    "tour_booking",
]);

export function isTourPresentationActionKey(key: string | null | undefined): boolean {
    const k = (key ?? "").trim();
    return Boolean(k) && TOUR_PRESENTATION_ACTION_KEYS.has(k);
}

export function partitionTourGroupedActions<T extends { key: string; handlerKey?: string | null }>(
    actions: readonly T[],
): { tour: T[]; rest: T[] } {
    const tour: T[] = [];
    const rest: T[] = [];
    for (const action of actions) {
        const key = (action.handlerKey ?? action.key).trim();
        if (isTourPresentationActionKey(key) || isTourPresentationActionKey(action.key)) {
            tour.push(action);
        } else {
            rest.push(action);
        }
    }
    return { tour, rest };
}
