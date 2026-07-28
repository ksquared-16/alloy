/**
 * Apply a published weighting version to a population member.
 */

import type { WeightingVersion } from "@/lib/organizationWeightings/types";

export type WeightableMember = {
    /** Distinct weekday count on the member's schedule pattern (1–7). */
    daysPerWeek: number;
    scheduleTypeKey?: string | null;
};

export function applyWeightingFactor(
    weighting: WeightingVersion,
    member: WeightableMember,
): number {
    if (weighting.scheme === "unweighted") return 1;
    const days = Math.max(0, Math.min(7, Math.round(member.daysPerWeek)));
    const key = String(days);
    if (key in weighting.factors && Number.isFinite(weighting.factors[key]!)) {
        return weighting.factors[key]!;
    }
    const denom = weighting.full_time_days > 0 ? weighting.full_time_days : 5;
    return days / denom;
}
