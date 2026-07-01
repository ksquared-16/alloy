/**
 * Maps book-v2 UI values to stable option_set item keys (access_method, home_type).
 */

/** ServiceDetailsForm UI access_method → option_set access_method item_key */
export const BOOK_V2_ACCESS_METHOD_UI_TO_STABLE: Record<string, string> = {
    home: "on_file",
    code: "door_code",
    key: "lockbox",
    building: "front_desk",
};

/** option_set `access_method` item_key → book-v2 UI token (stable submit compatibility). */
export const BOOK_V2_ACCESS_METHOD_STABLE_TO_UI: Record<string, string> = {
    on_file: "home",
    door_code: "code",
    lockbox: "key",
    front_desk: "building",
};

const STABLE_ACCESS_METHOD_KEYS = new Set(Object.keys(BOOK_V2_ACCESS_METHOD_STABLE_TO_UI));
const BOOKING_ACCESS_UI_TOKENS = new Set(Object.keys(BOOK_V2_ACCESS_METHOD_UI_TO_STABLE));

/** Normalize stored or API access value to the UI token used in book-v2 forms (`home` | `code` | …). */
export function bookingAccessUiToken(raw: string | null | undefined): string {
    const u = String(raw ?? "home").trim() || "home";
    if (BOOKING_ACCESS_UI_TOKENS.has(u)) return u;
    if (STABLE_ACCESS_METHOD_KEYS.has(u)) return BOOK_V2_ACCESS_METHOD_STABLE_TO_UI[u] ?? u;
    return u;
}

/** @deprecated Use BOOK_V2_ACCESS_METHOD_UI_TO_STABLE + uiAccessMethodToStableKey */
export const BOOK_V2_ACCESS_METHOD_TO_DB_KEY: Record<string, string> = {
    home: "on_file",
    code: "door_code",
    key: "lockbox",
    building: "front_desk",
};

/**
 * Map book-v2 access payload to `locations.access_method_key` / option_set item_key.
 * Accepts legacy UI tokens or stable keys already stored on the location.
 */
export function uiAccessMethodToStableKey(ui: string | null | undefined): string {
    const u = String(ui ?? "home").trim() || "home";
    if (STABLE_ACCESS_METHOD_KEYS.has(u)) return u;
    return BOOK_V2_ACCESS_METHOD_UI_TO_STABLE[u] ?? "on_file";
}

export function accessMethodUsesDoorCodeField(method: string | null | undefined): boolean {
    return bookingAccessUiToken(method) === "code";
}

export function accessMethodIsFrontDeskFlow(method: string | null | undefined): boolean {
    return bookingAccessUiToken(method) === "building";
}

export function accessMethodIsHomeFlow(method: string | null | undefined): boolean {
    return bookingAccessUiToken(method) === "home";
}

const DEFAULT_ACCESS_METHOD_BOOKING_LABELS: Record<string, string> = {
    home: "I will be home",
    code: "Door/Garage Code",
    key: "Hidden Key",
    building: "Building / Front Desk",
};

/** Summary / display: English labels for default UI tokens; title-case unknown keys. */
export function accessMethodBookingDisplayLabel(method: string | null | undefined): string {
    const token = bookingAccessUiToken(method);
    const lab = DEFAULT_ACCESS_METHOD_BOOKING_LABELS[token];
    if (lab) return lab;
    return token
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

const ALLOWED_HOME_TYPE_KEYS = new Set(["house", "condo", "apartment", "townhome"]);

/** ServiceDetails / quote home type label or key → option_set home_type item_key */
export const BOOK_V2_HOME_TYPE_LABEL_TO_KEY: Record<string, string> = {
    "single-family home": "house",
    "single family home": "house",
    house: "house",
    condo: "condo",
    "apartment / condo": "apartment",
    apartment: "apartment",
    townhome: "townhome",
    duplex: "house",
    other: "apartment",
};

export function normalizeHomeTypeLabel(label: string | null | undefined): string {
    return String(label ?? "")
        .trim()
        .toLowerCase();
}

export function homeTypeLabelToDbKey(label: string | null | undefined): string | null {
    return homeTypeInputToStableKey(label);
}

/** Normalize free-text or UI home type to stable option key (house, condo, apartment, townhome). */
export function homeTypeInputToStableKey(raw: unknown): string | null {
    const k = normalizeHomeTypeLabel(raw == null ? undefined : typeof raw === "string" ? raw : String(raw));
    if (!k) return null;
    if (ALLOWED_HOME_TYPE_KEYS.has(k)) return k;
    const mapped = BOOK_V2_HOME_TYPE_LABEL_TO_KEY[k];
    if (mapped && ALLOWED_HOME_TYPE_KEYS.has(mapped)) return mapped;
    return null;
}

export function parseBedsFromBody(raw: unknown): number | null {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.min(99, Math.max(0, raw));
    }
    return parseRoomCount(String(raw));
}

/**
 * Book-v2 sends bedrooms/bathrooms on the top-level body for legacy UI, but public defs after the
 * beds/baths cutover store values under configurable_field_values.beds / .baths (field_key on location).
 * Merge both into one raw value for parseBedsFromBody / parseBathroomsForCjd.
 */
export function coalesceBookV2BedBathRaw(
    bodyTop: unknown,
    mergedCfg: Record<string, unknown>,
    legacyKey: "bedrooms" | "bathrooms",
    nativeKey: "beds" | "baths"
): unknown {
    if (typeof bodyTop === "number" && Number.isFinite(bodyTop)) return bodyTop;
    if (bodyTop != null && String(bodyTop).trim() !== "") return bodyTop;
    const leg = mergedCfg[legacyKey];
    if (typeof leg === "number" && Number.isFinite(leg)) return leg;
    if (leg != null && String(leg).trim() !== "") return leg;
    const nat = mergedCfg[nativeKey];
    if (typeof nat === "number" && Number.isFinite(nat)) return nat;
    if (nat != null && String(nat).trim() !== "") return nat;
    return undefined;
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
    const methodRaw = String(params.access_method ?? "home").trim() || "home";
    const note = params.access_note != null ? String(params.access_note).trim() : "";
    const extra = params.additional_notes != null ? String(params.additional_notes).trim() : "";

    if (accessMethodUsesDoorCodeField(methodRaw)) {
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

/** @deprecated Legacy band keys; prefer tier_key / normalizeSqftKeyInput. */
export function quoteSquareFootageToBandKey(raw: string | null | undefined): string | null {
    const s = String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\u2013/g, "-")
        .replace(/\s+/g, " ");
    if (!s) return null;
    // Tier labels use thousands separators (e.g. "2,001-2,600 sq ft") — strip commas before numeric substring checks.
    const n = s.replace(/,/g, "");
    if (n.includes("under") && n.includes("1500")) return "under_1500";
    if (n.includes("1501") && n.includes("2000")) return "1501_2000";
    if (n.includes("2001") && n.includes("2600")) return "2001_2600";
    if (n.includes("2601") && n.includes("3200")) return "2601_3200";
    if (n.includes("3201") && n.includes("4000")) return "3201_4000";
    if (n.includes("4001") && n.includes("5500")) return "4001_5500";
    if (n.includes("over") && n.includes("5500")) return "over_5500";
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

/**
 * Public booking bathroom option values use underscores for half-baths (`1_5`, `2_5`) and `_plus` for open-ended tiers.
 * `cleaning_job_details.bathrooms` is an integer — we round halves to the nearest whole for that column and keep the
 * exact booking key on the row metadata for display/reporting.
 */
/** Half-baths supported on cleaning_job_details.baths / locations.baths */
export function parseBathroomsForCjd(raw: unknown): { baths: number | null; bookingKey: string | null } {
    if (raw == null) return { baths: null, bookingKey: null };
    const s = String(raw).trim();
    if (!s) return { baths: null, bookingKey: null };
    const key = s.toLowerCase().replace(/\s+/g, "_");
    const map: Record<string, number> = {
        "1": 1,
        "1_5": 1.5,
        "2": 2,
        "2_5": 2.5,
        "3": 3,
        "4": 4,
        "4_plus": 4,
    };
    const exact = map[key];
    if (exact != null) {
        return { baths: exact, bookingKey: key };
    }
    const n = parseFloat(s.replace(/,/g, ""));
    if (Number.isFinite(n)) {
        return { baths: n, bookingKey: key };
    }
    const pr = parseRoomCount(s);
    return { baths: pr, bookingKey: key };
}
