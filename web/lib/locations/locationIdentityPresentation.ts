import { US_LOCATION_TIMEZONE_OPTIONS } from "@/lib/locations/locationWorkspaceModel";

/** Operator-facing timezone label — never raw IANA ids in UI. */
export function formatLocationTimezoneLabel(iana: string | null | undefined): string | null {
    const value = String(iana ?? "").trim();
    if (!value) return null;
    const match = US_LOCATION_TIMEZONE_OPTIONS.find((option) => option.value === value);
    return match?.label ?? null;
}

/** Compact locality from address parts — city + state when available. */
export function formatLocationLocality(parts: {
    city?: string | null;
    state?: string | null;
}): string | null {
    const city = String(parts.city ?? "").trim();
    const state = String(parts.state ?? "").trim();
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    if (state) return state;
    return null;
}

/**
 * Identity fact line for a location header.
 * Priority: locality → friendly timezone. Omit entirely when neither is representable.
 * Never includes "not set" placeholders or raw IANA timezone ids.
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
