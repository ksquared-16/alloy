/** Legacy bucket key — migrated to {@link TIER_EMPLOYEE_FAMILY_BUCKET}. */
export const TIER_STAFF_COMMUNITY_LEGACY_BUCKET = "tier_staff_community" as const;

export const TIER_EMPLOYEE_FAMILY_BUCKET = "tier_employee_family" as const;

export const TIER_GENERAL_WAITLIST_BUCKET = "tier_general_waitlist" as const;

/** Preset bucket labels (mirrors childcare enrollment waitlist v1 preset). */
const PRESET_LABELS = new Map<string, string>([
    [TIER_EMPLOYEE_FAMILY_BUCKET, "Employee family"],
    [TIER_STAFF_COMMUNITY_LEGACY_BUCKET, "Staff / community priority"],
    ["tier_sibling_enrolled", "Sibling enrolled at center"],
    ["tier_sister_center", "Sister center priority"],
    [TIER_GENERAL_WAITLIST_BUCKET, "Standard family"],
]);

/** Operator-facing bucket labels for queue chips and previews. */
export const PLACEMENT_BUCKET_OPERATOR_LABELS: Record<string, string> = {
    [TIER_EMPLOYEE_FAMILY_BUCKET]: "Employee family",
    [TIER_STAFF_COMMUNITY_LEGACY_BUCKET]: "Staff / community priority",
    tier_sibling_enrolled: "Sibling enrolled at center",
    tier_sister_center: "Sister center priority",
    [TIER_GENERAL_WAITLIST_BUCKET]: "Standard family",
    unknown: "Standard family",
};

export function normalizePlacementBucketKeyForDisplay(bucketKey: string): string {
    const k = bucketKey.trim();
    if (!k || k === "unknown") return TIER_GENERAL_WAITLIST_BUCKET;
    if (k === TIER_STAFF_COMMUNITY_LEGACY_BUCKET) return TIER_EMPLOYEE_FAMILY_BUCKET;
    return k;
}

/** Resolve display label for a placement bucket key (never returns literal `unknown`). */
export function formatPlacementBucketLabel(bucketKey: string): string {
    const normalized = normalizePlacementBucketKeyForDisplay(bucketKey);
    const derived =
        normalized.startsWith("tier_")
            ? normalized.replace(/^tier_/, "").replace(/_/g, " ")
            : normalized;
    const resolved =
        PLACEMENT_BUCKET_OPERATOR_LABELS[normalized] ??
        PRESET_LABELS.get(normalized) ??
        PRESET_LABELS.get(bucketKey.trim()) ??
        derived;
    return resolved || PLACEMENT_BUCKET_OPERATOR_LABELS[TIER_GENERAL_WAITLIST_BUCKET];
}
