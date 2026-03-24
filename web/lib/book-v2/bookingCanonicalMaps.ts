/**
 * Maps book-v2 UI values to reference table keys (access_methods, home_types, sqft_bands).
 */

/** ServiceDetailsForm access_method → access_methods.key */
export const BOOK_V2_ACCESS_METHOD_TO_DB_KEY: Record<string, string> = {
    home: "home",
    code: "code",
    key: "hidden_key",
    building: "front_desk",
};

/** ServiceDetails home type option label → home_types.key */
export const BOOK_V2_HOME_TYPE_LABEL_TO_KEY: Record<string, string> = {
    "single-family home": "single_family",
    "apartment / condo": "apartment_condo",
    townhome: "townhome",
    duplex: "other",
    other: "other",
};

export function normalizeHomeTypeLabel(label: string | null | undefined): string {
    return String(label ?? "")
        .trim()
        .toLowerCase();
}

export function homeTypeLabelToDbKey(label: string | null | undefined): string | null {
    const k = normalizeHomeTypeLabel(label);
    if (!k) return null;
    return BOOK_V2_HOME_TYPE_LABEL_TO_KEY[k] ?? null;
}

/** Parse bedrooms/bathrooms select values to integers (5+ → 5). */
/**
 * access_code = gate/door code when method is `code`.
 * access_notes = non-code access instructions + customer extra notes.
 */
export function splitBookV2LocationAccess(params: {
    access_method: string;
    access_note?: string | null;
    additional_notes?: string | null;
}): { access_code: string | null; access_notes: string | null } {
    const method = String(params.access_method ?? "home").trim() || "home";
    const note = params.access_note != null ? String(params.access_note).trim() : "";
    const extra = params.additional_notes != null ? String(params.additional_notes).trim() : "";

    if (method === "code") {
        return {
            access_code: note || null,
            access_notes: extra || null,
        };
    }

    const parts = [note, extra].filter(Boolean);
    return {
        access_code: null,
        access_notes: parts.length ? parts.join("\n\n") : null,
    };
}

/** Map quote UI / quote_input.square_footage string to sqft_bands.key */
export function quoteSquareFootageToBandKey(raw: string | null | undefined): string | null {
    const s = String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\u2013/g, "-")
        .replace(/\s+/g, " ");
    if (!s) return null;
    if (s.includes("under") && s.includes("1500")) return "under_1500";
    if (s.includes("1501") && s.includes("2000")) return "1501_2000";
    if (s.includes("2001") && s.includes("2600")) return "2001_2600";
    if (s.includes("2601") && s.includes("3200")) return "2601_3200";
    if (s.includes("3201") && s.includes("4000")) return "3201_4000";
    if (s.includes("4001") && s.includes("5500")) return "4001_5500";
    if (s.includes("over") && s.includes("5500")) return "over_5500";
    return null;
}

const SQFT_BAND_MIDPOINT: Record<string, number> = {
    under_1500: 1200,
    "1501_2000": 1750,
    "2001_2600": 2300,
    "2601_3200": 2900,
    "3201_4000": 3600,
    "4001_5500": 4750,
    over_5500: 6000,
};

export function squareFootageMidpointForBandKey(bandKey: string | null | undefined): number | null {
    if (!bandKey) return null;
    return SQFT_BAND_MIDPOINT[bandKey] ?? null;
}

export function parseRoomCount(raw: string | null | undefined): number | null {
    if (raw == null || String(raw).trim() === "") return null;
    const s = String(raw).trim().toLowerCase();
    const m = s.match(/^(\d+)/);
    if (m) return Math.min(99, parseInt(m[1]!, 10));
    return null;
}
