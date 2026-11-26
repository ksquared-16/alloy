/**
 * Day-pill resolution — the single source of truth for which weekday pills a schedule
 * renders (Detail and Editor) and whether each is selected.
 *
 * Pure and deterministic (no DB, no DOM), so the operating-days behavior is verified
 * by fast unit tests instead of a full-app E2E that must drive the heavy opportunity
 * drawer. Non-operating weekdays are HIDDEN; among the visible (operating) days the
 * unselected ones render grayed — the surface reads exactly the site's schedulable days.
 */

/** Weekday render order — Monday first, weekend last (matches the pill row). */
export const DAY_PILL_ORDER: readonly { weekday: number; label: string }[] = [
    { weekday: 1, label: "M" },
    { weekday: 2, label: "T" },
    { weekday: 3, label: "W" },
    { weekday: 4, label: "T" },
    { weekday: 5, label: "F" },
    { weekday: 6, label: "S" },
    { weekday: 0, label: "S" },
];

export type DayPill = { weekday: number; label: string; selected: boolean };

/**
 * The day pills to render, given the site's `allowed` operating weekdays and the
 * schedule's `selectedDays`.
 *
 * - Operating days always show; unselected ones are `selected: false` (grayed).
 * - Non-operating weekdays are hidden UNLESS already selected — an out-of-policy
 *   selection stays visible so the schedule reads truthfully and can be removed.
 * - When `allowed` is omitted, every weekday shows (no operating-days constraint).
 */
export function resolveVisibleDayPills(
    allowed: readonly number[] | undefined,
    selectedDays: readonly number[]
): DayPill[] {
    const allowedSet = allowed == null ? null : new Set(allowed);
    const selected = new Set(selectedDays);
    return DAY_PILL_ORDER.filter(
        (d) => allowedSet == null || allowedSet.has(d.weekday) || selected.has(d.weekday)
    ).map((d) => ({ weekday: d.weekday, label: d.label, selected: selected.has(d.weekday) }));
}
