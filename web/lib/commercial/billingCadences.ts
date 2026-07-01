/**
 * Commercial — Billing Cadences.
 *
 * Cadences are Commercial-domain option set items from `commercial_billing_cadence`.
 * They are operator-editable (add/rename); V1 ships with 7 system defaults.
 */

export type BillingCadence = {
    id: string;
    item_key: string;
    label: string;
    sort_order: number;
    metadata: Record<string, unknown>;
};

/** System default cadence keys (immutable). Operators may add custom ones. */
export const SYSTEM_CADENCE_KEYS = [
    "weekly",
    "biweekly",
    "monthly",
    "annual",
    "daily",
    "hourly",
    "per_session",
] as const;

export type SystemCadenceKey = (typeof SYSTEM_CADENCE_KEYS)[number];

export const SYSTEM_CADENCE_LABELS: Record<SystemCadenceKey, string> = {
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    monthly: "Monthly",
    annual: "Annual",
    daily: "Daily",
    hourly: "Hourly",
    per_session: "Per Session",
};

/** Return a display label for any cadence key (falls back to the raw key). */
export function cadenceLabel(
    key: string,
    cadences: BillingCadence[],
): string {
    const found = cadences.find((c) => c.item_key === key);
    if (found) return found.label;
    return SYSTEM_CADENCE_LABELS[key as SystemCadenceKey] ?? key;
}
