/**
 * Emergency fallback only: public quote UIs should load bedroom/bathroom **select options** from
 * GET /api/public/field-definitions (option_set_key bedrooms_booking / bathrooms_booking).
 * Keep these values aligned with `option_set_items.item_key` for those sets.
 */
export const BOOKING_BEDROOM_OPTIONS: { value: string; label: string }[] = [
    { value: "studio", label: "Studio" },
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "5_plus", label: "5+" },
];

export const BOOKING_BATHROOM_OPTIONS: { value: string; label: string }[] = [
    { value: "1", label: "1" },
    { value: "1_5", label: "1.5" },
    { value: "2", label: "2" },
    { value: "2_5", label: "2.5" },
    { value: "3", label: "3" },
    { value: "4_plus", label: "4+" },
];

/** Match `bookingSelectOptionDisplayLabel` in ConfigurableFieldSections for bed/bath keys. */
export function formatBedBathOptionValueForDisplay(fieldKey: "bedrooms" | "bathrooms", value: string): string {
    if (fieldKey === "bedrooms" || fieldKey === "bathrooms") {
        const v = value.trim();
        if (!v) return value;
        if (/_plus$/i.test(v)) return `${v.replace(/_plus$/i, "")}+`;
        return v.replace(/_/g, ".");
    }
    return value;
}
