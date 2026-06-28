/**
 * Resolve a committed schedule pattern (L2 intent) to a P3.2 `schedule_basis`
 * (the dimension that selects which rate rule applies). Pure — no DB, no IO.
 *
 * Resolution precedence (most explicit wins):
 *   1. Caller override map (`scheduleBasisByPatternId[pattern.id]`).
 *   2. `pattern.metadata.schedule_basis` (org-pinned on the pattern).
 *   3. A known `schedule_type_key` convenience mapping (overridable defaults).
 *   4. Day-count fallback from `weekdays.length` (3/4/5 -> three/four/five_day).
 *
 * Anything that cannot be classified returns `null` (unresolved) so callers can
 * surface a clear "no schedule basis" state rather than guessing. We never
 * fabricate full_day/half_day/hourly/drop_in from a day count alone — those are
 * qualitative and must come from config (override / metadata / type key).
 */

import { isScheduleBasis, type ScheduleBasis } from "@/lib/financials/rates/rateTypes";

export type ScheduleBasisPatternInput = {
    id: string;
    weekdays: number[] | null | undefined;
    schedule_type_key: string | null | undefined;
    metadata?: Record<string, unknown> | null;
};

export type ResolveScheduleBasisOptions = {
    /** Explicit per-pattern override (authoritative when present). */
    scheduleBasisByPatternId?: Record<string, ScheduleBasis | null | undefined>;
};

/**
 * Convenience defaults from common `schedule_type_key` values. Org-defined keys
 * that are not listed simply fall through to the day-count rule. Fully
 * overridable via the option map or `metadata.schedule_basis`.
 */
const SCHEDULE_TYPE_KEY_BASIS: Record<string, ScheduleBasis> = {
    full_day: "full_day",
    full_time: "full_day",
    half_day: "half_day",
    half_time: "half_day",
    hourly: "hourly",
    drop_in: "drop_in",
    dropin: "drop_in",
    three_day: "three_day",
    four_day: "four_day",
    five_day: "five_day",
};

function dayCountBasis(weekdays: number[] | null | undefined): ScheduleBasis | null {
    const count = new Set((weekdays ?? []).filter((d) => Number.isInteger(d))).size;
    if (count === 5) return "five_day";
    if (count === 4) return "four_day";
    if (count === 3) return "three_day";
    return null;
}

export function resolveScheduleBasis(
    pattern: ScheduleBasisPatternInput,
    options: ResolveScheduleBasisOptions = {}
): ScheduleBasis | null {
    const override = options.scheduleBasisByPatternId?.[pattern.id];
    if (isScheduleBasis(override)) return override;

    const metaBasis = pattern.metadata?.["schedule_basis"];
    if (isScheduleBasis(metaBasis)) return metaBasis;

    const typeKey = pattern.schedule_type_key?.trim().toLowerCase();
    if (typeKey && typeKey in SCHEDULE_TYPE_KEY_BASIS) {
        return SCHEDULE_TYPE_KEY_BASIS[typeKey];
    }

    return dayCountBasis(pattern.weekdays);
}
