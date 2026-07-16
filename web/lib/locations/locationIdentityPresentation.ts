import { US_LOCATION_TIMEZONE_OPTIONS } from "@/lib/locations/locationWorkspaceModel";

const US_STATE_NAMES: Record<string, string> = {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
    DC: "District of Columbia",
};

/** Operator-facing timezone label — never raw IANA ids in UI. */
export function formatLocationTimezoneLabel(iana: string | null | undefined): string | null {
    const value = String(iana ?? "").trim();
    if (!value) return null;
    const match = US_LOCATION_TIMEZONE_OPTIONS.find((option) => option.value === value);
    return match?.label ?? null;
}

function formatStateDisplay(state: string): string {
    const trimmed = state.trim();
    if (!trimmed) return "";
    const upper = trimmed.toUpperCase();
    return US_STATE_NAMES[upper] ?? trimmed;
}

/** Compact locality from address parts — city + state when available. */
export function formatLocationLocality(parts: {
    city?: string | null;
    state?: string | null;
}): string | null {
    const city = String(parts.city ?? "").trim();
    const state = formatStateDisplay(String(parts.state ?? ""));
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    if (state) return state;
    return null;
}

/**
 * Identity fact line for a location header.
 * Priority: locality → friendly timezone. Omit entirely when neither is representable.
 * Joined as `Bend, Oregon · Pacific Time` when both exist.
 */
export function buildLocationIdentityFacts(params: {
    city?: string | null;
    state?: string | null;
    timezoneIana?: string | null;
}): string[] {
    const facts: string[] = [];
    const locality = formatLocationLocality(params);
    if (locality) facts.push(locality);
    const timezone = formatLocationTimezoneLabel(params.timezoneIana);
    if (timezone) facts.push(timezone);
    return facts;
}

export function formatLocationIdentityLine(params: {
    city?: string | null;
    state?: string | null;
    timezoneIana?: string | null;
}): string | null {
    const facts = buildLocationIdentityFacts(params);
    return facts.length > 0 ? facts.join(" · ") : null;
}
