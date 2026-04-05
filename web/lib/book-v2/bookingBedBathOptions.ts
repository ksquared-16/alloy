/** Values align with public booking field_definitions seeds (bedrooms / bathrooms). */
export const BOOKING_BEDROOM_OPTIONS: { value: string; label: string }[] = [
    { value: "studio", label: "Studio" },
    { value: "1", label: "1 bedroom" },
    { value: "2", label: "2 bedrooms" },
    { value: "3", label: "3 bedrooms" },
    { value: "4", label: "4 bedrooms" },
    { value: "5_plus", label: "5+ bedrooms" },
];

export const BOOKING_BATHROOM_OPTIONS: { value: string; label: string }[] = [
    { value: "1", label: "1 bathroom" },
    { value: "1_5", label: "1.5 bathrooms" },
    { value: "2", label: "2 bathrooms" },
    { value: "2_5", label: "2.5 bathrooms" },
    { value: "3", label: "3 bathrooms" },
    { value: "4_plus", label: "4+ bathrooms" },
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
