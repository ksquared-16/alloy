/** Shared address line parsing for create_lead intake commit + persistence. */

export type StructuredPostalAddress = {
    address_line1: string;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
};

/** Best-effort US-style tail parse: "City, ST 12345". */
export function parseAddressLines(lines: string[]): StructuredPostalAddress | null {
    const cleaned = lines.map((line) => line.trim()).filter(Boolean);
    if (cleaned.length === 0) return null;

    if (cleaned.length === 1) {
        return { address_line1: cleaned[0]! };
    }

    const tail = cleaned[cleaned.length - 1] ?? "";
    const cityStateZip = tail.match(/^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (cityStateZip) {
        const middle = cleaned.length > 2 ? cleaned.slice(1, -1).join(", ") : null;
        return {
            address_line1: cleaned[0]!,
            address_line2: middle,
            city: cityStateZip[1]?.trim() ?? null,
            state: cityStateZip[2]?.trim().toUpperCase() ?? null,
            postal_code: cityStateZip[3]?.trim() ?? null,
        };
    }

    return {
        address_line1: cleaned[0]!,
        address_line2: cleaned.length > 2 ? cleaned.slice(1, -1).join(", ") : cleaned[1] ?? null,
        city: cleaned.length > 2 ? cleaned[cleaned.length - 1] : null,
    };
}
