/**
 * Visual hierarchy for schedule overview snapshot cells (config keys → tier).
 * Does not alter record_layouts or snapshot payloads — presentation only.
 */

export type ScheduleFieldVisualTier = "primary" | "secondary" | "supporting";

const PRIMARY_KEYS = new Set<string>(["start_at", "_customer_name", "assigned_vendor_id"]);

const SECONDARY_KEYS = new Set<string>([
    "status_key",
    "_contact_phone",
    "_contact_email",
    "_location_label",
    "end_at",
]);

const SUPPORTING_KEYS = new Set<string>(["service_type", "price_cents"]);

/**
 * Maps hydrated field keys (same as overview_rows resolved keys) to display tier.
 */
export function getScheduleOverviewFieldTier(fieldKey: string): ScheduleFieldVisualTier {
    const k = fieldKey.trim();
    if (PRIMARY_KEYS.has(k)) return "primary";
    if (SECONDARY_KEYS.has(k)) return "secondary";
    if (SUPPORTING_KEYS.has(k)) return "supporting";
    return "secondary";
}
