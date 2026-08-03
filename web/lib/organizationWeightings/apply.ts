/**
 * Apply an Equivalency Definition to a population member → contribution scalar.
 * Output always feeds Equivalent Count aggregation.
 */

import {
    normalizeEquivalencyStrategy,
    type EquivalencyVersion,
    type WeightingVersion,
} from "@/lib/organizationWeightings/types";

export type EquivalencyMember = {
    /** Distinct weekday count on the member's schedule pattern (1–7). */
    daysPerWeek: number;
    scheduleTypeKey?: string | null;
    /**
     * Scheduled weekly hours when known.
     * When missing under weekly_hours strategy, derived from days × (full_time_hours / full_time_days).
     */
    weeklyScheduledHours?: number | null;
};

/** @deprecated Use EquivalencyMember */
export type WeightableMember = EquivalencyMember;

export type ApplyEquivalencyResult =
    | { ok: true; value: number }
    | { ok: false; reason: string };

function lookupFactor(
    factors: Record<string, number>,
    rawKey: string | null | undefined,
): number | null {
    if (!rawKey) return null;
    const key = String(rawKey).trim();
    if (!key) return null;
    if (key in factors && Number.isFinite(factors[key]!)) return factors[key]!;
    const lower = key.toLowerCase().replace(/\s+/g, "_");
    if (lower in factors && Number.isFinite(factors[lower]!)) return factors[lower]!;
    const dashed = lower.replace(/_/g, "-");
    if (dashed in factors && Number.isFinite(factors[dashed]!)) return factors[dashed]!;
    return null;
}

function unmatched(
    version: EquivalencyVersion,
    detail: string,
): ApplyEquivalencyResult {
    if (version.unmatched_policy === "unavailable") {
        return { ok: false, reason: detail };
    }
    if (version.unmatched_policy === "proportional" && version.scheme !== "weekly_hours") {
        return { ok: true, value: 0 };
    }
    return { ok: true, value: 0 };
}

export function applyEquivalency(
    version: EquivalencyVersion | WeightingVersion,
    member: EquivalencyMember,
): ApplyEquivalencyResult {
    const strategy = normalizeEquivalencyStrategy(version.scheme);

    if (strategy === "unweighted") {
        return { ok: true, value: 1 };
    }

    if (strategy === "category") {
        const hit = lookupFactor(version.factors, member.scheduleTypeKey);
        if (hit != null) return { ok: true, value: hit };
        // Heuristic: many days → full_time, fewer → part_time
        const days = Math.max(0, Math.min(7, Math.round(member.daysPerWeek)));
        const byDays =
            days >= (version.full_time_days || 5) ?
                lookupFactor(version.factors, "full_time")
            :   lookupFactor(version.factors, "part_time");
        if (byDays != null) return { ok: true, value: byDays };
        return unmatched(version, `No category mapping for schedule “${member.scheduleTypeKey ?? "unknown"}”`);
    }

    if (strategy === "weekly_hours") {
        const denom = version.full_time_hours != null && version.full_time_hours > 0 ? version.full_time_hours : 50;
        const days = Math.max(0, Math.min(7, member.daysPerWeek));
        const hoursPerFullWeekDay = denom / Math.max(1, version.full_time_days || 5);
        const hours =
            member.weeklyScheduledHours != null && Number.isFinite(member.weeklyScheduledHours) ?
                Math.max(0, member.weeklyScheduledHours)
            :   days * hoursPerFullWeekDay;
        return { ok: true, value: hours / denom };
    }

    // session_or_day
    const basis = version.session_basis ?? "days_per_week";
    if (basis === "attendance_type") {
        const hit = lookupFactor(version.factors, member.scheduleTypeKey);
        if (hit != null) {
            // One contribution per week for the attendance type on this schedule.
            // Session stacks: days × type contribution when type is a per-day unit.
            const days = Math.max(0, Math.min(7, Math.round(member.daysPerWeek)));
            return { ok: true, value: hit * Math.max(1, days) };
        }
        return unmatched(
            version,
            `No session mapping for attendance “${member.scheduleTypeKey ?? "unknown"}”`,
        );
    }

    // days_per_week basis
    const days = Math.max(0, Math.min(7, Math.round(member.daysPerWeek)));
    const key = String(days);
    if (key in version.factors && Number.isFinite(version.factors[key]!)) {
        return { ok: true, value: version.factors[key]! };
    }
    if (version.unmatched_policy === "unavailable") {
        return { ok: false, reason: `No day mapping for ${days} days per week` };
    }
    if (version.unmatched_policy === "proportional") {
        const denom = version.full_time_days > 0 ? version.full_time_days : 5;
        return { ok: true, value: days / denom };
    }
    return { ok: true, value: 0 };
}

/**
 * Legacy helper — returns numeric factor; treats unavailable as 0.
 * Prefer applyEquivalency for new call sites.
 */
export function applyWeightingFactor(
    weighting: EquivalencyVersion | WeightingVersion,
    member: EquivalencyMember,
): number {
    const result = applyEquivalency(weighting, member);
    return result.ok ? result.value : 0;
}
