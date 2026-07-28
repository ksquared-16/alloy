/**
 * Organization Equivalency Definitions — “How should each member count?”
 *
 * Product language: Equivalency / Equivalent children.
 * Persistence key remains `organization_weightings` for exact-version continuity.
 * Calculations always consume Equivalent Count — never raw strategy payloads.
 */

export type EquivalencyStrategyId =
    | "category"
    | "session_or_day"
    | "weekly_hours"
    /** @deprecated Prefer `category` with each member = 1 */
    | "unweighted"
    /** @deprecated Prefer `session_or_day` with days_per_week basis */
    | "days_per_week";

/** @deprecated Use EquivalencyStrategyId */
export type WeightingSchemeId = EquivalencyStrategyId;

export type EquivalencyLifecycle = "draft" | "published" | "archived";
/** @deprecated Use EquivalencyLifecycle */
export type WeightingLifecycle = EquivalencyLifecycle;

export type EquivalencySessionBasis = "days_per_week" | "attendance_type";

export type EquivalencyUnmatchedPolicy = "zero" | "unavailable" | "proportional";

export type EquivalencyVersion = {
    id: string;
    version_number: number;
    immutable: boolean;
    /** Canonical strategy id (same field historically called `scheme`). */
    scheme: EquivalencyStrategyId;
    /**
     * Strategy A: category → value (full_time → 1.0, part_time → 0.5)
     * Strategy B days: "5" → 1.0 … "1" → 0.2
     * Strategy B attendance: full_day → 0.2, part_day → 0.1
     * Strategy C: unused (uses full_time_hours)
     */
    factors: Record<string, number>;
    /** Days that equal one full-time unit (session_or_day / legacy days_per_week). */
    full_time_days: number;
    /**
     * Weekly hours that equal one full-time child (weekly_hours strategy).
     * Null when unused.
     */
    full_time_hours: number | null;
    /** How Strategy B interprets factor keys. */
    session_basis: EquivalencySessionBasis | null;
    unmatched_policy: EquivalencyUnmatchedPolicy;
    summary: string;
    published_at: string | null;
    created_at: string;
};

/** @deprecated Use EquivalencyVersion */
export type WeightingVersion = EquivalencyVersion;

export type OrganizationEquivalency = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    lifecycle: EquivalencyLifecycle;
    published_version_id: string | null;
    versions: EquivalencyVersion[];
    created_at: string;
    updated_at: string;
    created_by: string | null;
};

/** @deprecated Use OrganizationEquivalency */
export type OrganizationWeighting = OrganizationEquivalency;

export const EQUIVALENCY_META_KEY = "organization_weightings";
/** @deprecated Use EQUIVALENCY_META_KEY */
export const WEIGHTING_META_KEY = EQUIVALENCY_META_KEY;

export const DEFAULT_DAYS_PER_WEEK_FACTORS: Record<string, number> = {
    "5": 1,
    "4": 0.8,
    "3": 0.6,
    "2": 0.4,
    "1": 0.2,
};

export const DEFAULT_CATEGORY_FACTORS: Record<string, number> = {
    full_time: 1,
    part_time: 0.5,
    ft: 1,
    pt: 0.5,
    "full-time": 1,
    "part-time": 0.5,
};

export const DEFAULT_SESSION_FACTORS: Record<string, number> = {
    full_day: 0.2,
    part_day: 0.1,
    "full-day": 0.2,
    "part-day": 0.1,
};

export const DEFAULT_FULL_TIME_HOURS = 50;

export type CanonicalEquivalencyStrategy = "category" | "session_or_day" | "weekly_hours" | "unweighted";

export function normalizeEquivalencyStrategy(scheme: EquivalencyStrategyId): CanonicalEquivalencyStrategy {
    if (scheme === "days_per_week") return "session_or_day";
    if (scheme === "unweighted") return "unweighted";
    if (scheme === "category" || scheme === "session_or_day" || scheme === "weekly_hours") return scheme;
    return "session_or_day";
}

export function slugifyEquivalencyKey(name: string): string {
    return (
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
            .slice(0, 64) || "equivalency"
    );
}

/** @deprecated Use slugifyEquivalencyKey */
export const slugifyWeightingKey = slugifyEquivalencyKey;

export function defaultDaysPerWeekSummary(): string {
    return "5 days = 1.0 · 4 days = 0.8 · 3 days = 0.6 · 2 days = 0.4 · 1 day = 0.2";
}

/** @deprecated Use defaultDaysPerWeekSummary */
export const defaultFteWeightingSummary = defaultDaysPerWeekSummary;

export function defaultCategorySummary(): string {
    return "Full-time = 1.0 · Part-time = 0.5";
}

export function defaultSessionSummary(): string {
    return "Full day = 0.20 · Part day = 0.10";
}

export function defaultWeeklyHoursSummary(hours: number): string {
    return `Scheduled weekly hours ÷ ${hours}`;
}

export function strategyOperatorLabel(scheme: EquivalencyStrategyId): string {
    const n = normalizeEquivalencyStrategy(scheme);
    if (n === "category") return "Full-time / Part-time categories";
    if (n === "weekly_hours") return "Weekly scheduled hours";
    if (n === "unweighted") return "Each child counts as 1";
    return "Days or sessions attended";
}

export function strategyShortLabel(scheme: EquivalencyStrategyId): string {
    const n = normalizeEquivalencyStrategy(scheme);
    if (n === "category") return "Categories";
    if (n === "weekly_hours") return "Weekly hours";
    if (n === "unweighted") return "Each as one";
    return "Days or sessions";
}
