/**
 * Schedule drawer Overview: explicit mapping for FK columns → hydrated labels from GET /api/admin/entity/schedules/:id.
 * Do not rely on generic UUID heuristics for these keys.
 */
export const SCHEDULE_OVERVIEW_RELATIONSHIP_FIELD_KEYS = [
    "job_id",
    "location_id",
    "assigned_vendor_id",
    "customer_subscription_id",
] as const;

const SCHEDULE_REL_KEY_SET = new Set<string>(SCHEDULE_OVERVIEW_RELATIONSHIP_FIELD_KEYS);

function trimNonEmpty(s: unknown): string | null {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length > 0 ? t : null;
}

function hasNonEmptyFk(record: Record<string, unknown>, fkKey: string): boolean {
    const v = record[fkKey];
    if (v == null) return false;
    return String(v).trim() !== "";
}

/**
 * @returns `undefined` — not one of the four schedule relationship keys (caller uses normal overview logic).
 * @returns string — human-readable label to show (may be empty string if id present but lookup failed).
 */
export function scheduleOverviewRelationshipReadLabel(
    record: Record<string, unknown>,
    fieldKey: string
): string | undefined {
    const k = fieldKey.trim();
    if (!SCHEDULE_REL_KEY_SET.has(k)) {
        return undefined;
    }
    switch (k) {
        case "job_id":
            if (!hasNonEmptyFk(record, "job_id")) return undefined;
            return trimNonEmpty(record._job_title) ?? "";
        case "location_id":
            if (!hasNonEmptyFk(record, "location_id") && !hasNonEmptyFk(record, "_location_id")) return undefined;
            return trimNonEmpty(record._location_label ?? record._location_name) ?? "";
        case "assigned_vendor_id":
            if (!hasNonEmptyFk(record, "assigned_vendor_id")) return undefined;
            return trimNonEmpty(record._assigned_vendor_name ?? record._vendor_name) ?? "";
        case "customer_subscription_id":
            if (!hasNonEmptyFk(record, "customer_subscription_id")) return undefined;
            return trimNonEmpty(record._customer_subscription_label) ?? "";
        default:
            return undefined;
    }
}
