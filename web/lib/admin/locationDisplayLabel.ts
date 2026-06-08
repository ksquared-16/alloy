/** Columns on `locations` used for display labels (no `name` column on this table). */
export const LOCATION_DISPLAY_LABEL_SELECT = "id, label, address1, city, postal_code";

export type LocationDisplayLabelRow = {
    label?: string | null;
    address1?: string | null;
    city?: string | null;
    postal_code?: string | null;
};

/** Canonical location display label: `label`, then address parts (matches job/relationship attach patterns). */
export function locationDisplayLabelFromRow(row: LocationDisplayLabelRow | null | undefined): string | null {
    if (!row) return null;
    const label = row.label?.trim();
    if (label) return label;
    const address = [row.address1, row.city, row.postal_code]
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean)
        .join(", ");
    return address || null;
}
