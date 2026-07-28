/**
 * Organization Weightings — reusable “how much does each member contribute?”
 * Generic platform primitive; not childcare-specific. Exact-version bound.
 */

export type WeightingSchemeId = "unweighted" | "days_per_week";

export type WeightingLifecycle = "draft" | "published" | "archived";

export type WeightingVersion = {
    id: string;
    version_number: number;
    immutable: boolean;
    scheme: WeightingSchemeId;
    /**
     * For days_per_week: map of days-per-week string → factor.
     * Example: { "5": 1, "4": 0.8, "3": 0.6, "2": 0.4, "1": 0.2 }
     */
    factors: Record<string, number>;
    /** Denominator for implied FTE when a days key is missing (default 5). */
    full_time_days: number;
    summary: string;
    published_at: string | null;
    created_at: string;
};

export type OrganizationWeighting = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    lifecycle: WeightingLifecycle;
    published_version_id: string | null;
    versions: WeightingVersion[];
    created_at: string;
    updated_at: string;
    created_by: string | null;
};

export const WEIGHTING_META_KEY = "organization_weightings";

export const DEFAULT_DAYS_PER_WEEK_FACTORS: Record<string, number> = {
    "5": 1,
    "4": 0.8,
    "3": 0.6,
    "2": 0.4,
    "1": 0.2,
};

export function slugifyWeightingKey(name: string): string {
    return (
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
            .slice(0, 64) || "weighting"
    );
}

export function defaultFteWeightingSummary(): string {
    return "5-day = 1.0 · 4-day = 0.8 · 3-day = 0.6 · 2-day = 0.4 · 1-day = 0.2";
}
