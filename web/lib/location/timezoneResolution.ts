/**
 * Canonical timezone resolution (Phase A, A4).
 *
 * Location owns exactly one canonical timezone (RFC §10). Phase A establishes the
 * RESOLUTION CONTRACT that hides where the timezone is stored — it does NOT add
 * the `locations.timezone` column or any migration (that is Phase B). Three
 * concepts are distinguished: storage (Location), viewer, recipient.
 *
 * Fallback ladder for the Location timezone:
 *   first-class column (Phase B, not yet)
 *     → location metadata timezone (compatibility)
 *       → organization default
 *         → explicit `unresolved` (status: incomplete)
 *
 * A UTC *fallback* from the org chain is treated as "no business timezone" and
 * surfaces as `unresolved` — this contract never silently uses UTC or the
 * server-local zone as a business timezone.
 *
 * Wraps the existing `timezoneContract` (org/viewer chains) and the Location
 * provider. Migrates no consumers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
    fetchEffectiveUserDisplayTimezone,
    fetchOperationalTimezoneForOrg,
    isValidIanaTimeZone,
} from "@/lib/admin/timezoneContract";
import { resolveLocationById } from "@/lib/location/canonicalLocationProvider";
import type {
    OperationalTimeContext,
    TimezoneResolution,
    TimezoneResolutionSource,
} from "@/lib/location/timezoneResolutionModel";

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a bare calendar date (`YYYY-MM-DD`) — must not be timezone-shifted. */
export function isDateOnly(value: string): boolean {
    return ISO_DATE_ONLY_RE.test(value.trim());
}

function resolved(timezone: string, source: TimezoneResolutionSource): TimezoneResolution {
    return { timezone, source, status: "resolved", warnings: [] };
}

function unresolved(code: string, message: string): TimezoneResolution {
    return {
        timezone: null,
        source: "unresolved",
        status: "incomplete",
        warnings: [{ code, message }],
    };
}

/** Org default timezone as a resolution, or `unresolved` when the org has none. */
async function resolveOrgDefaultTimezone(
    supabase: SupabaseClient,
    orgId: string,
    warningCode: string
): Promise<TimezoneResolution> {
    const org = await fetchOperationalTimezoneForOrg(supabase, orgId);
    // A `utc_fallback` source means the org configured no timezone — do NOT treat
    // UTC as a business timezone; surface it as unresolved instead.
    if (org.source === "utc_fallback" || !isValidIanaTimeZone(org.iana)) {
        return unresolved(warningCode, "No organization timezone is configured.");
    }
    return resolved(org.iana, "org_default");
}

/**
 * Resolve the authoritative timezone for a Location. Ladder: location metadata
 * (compatibility, from CanonicalLocation.timezoneRef) → org default → unresolved.
 * The Phase-B first-class column will slot in ahead of metadata with no consumer
 * change.
 */
export async function resolveLocationTimezone(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string
): Promise<TimezoneResolution> {
    if (!orgId?.trim() || !locationId?.trim()) {
        return unresolved("location_timezone_unresolved", "Missing org or location id.");
    }
    const location = await resolveLocationById(supabase, orgId, locationId, { mode: "include_address" });
    const ref = location?.timezoneRef?.trim();
    if (ref && isValidIanaTimeZone(ref)) {
        return resolved(ref, "location_metadata");
    }
    return resolveOrgDefaultTimezone(supabase, orgId, "location_timezone_unresolved");
}

/** Resolve the active viewer's timezone: user profile → org default → unresolved. */
export async function resolveViewerTimezone(
    supabase: SupabaseClient,
    params: { userId: string; orgId: string }
): Promise<TimezoneResolution> {
    if (!params.userId?.trim() || !params.orgId?.trim()) {
        return unresolved("viewer_timezone_unresolved", "Missing user or org id.");
    }
    const display = await fetchEffectiveUserDisplayTimezone(supabase, params);
    if (display.source === "user_profile" && isValidIanaTimeZone(display.iana)) {
        return resolved(display.iana, "viewer");
    }
    return resolveOrgDefaultTimezone(supabase, params.orgId, "viewer_timezone_unresolved");
}

/**
 * Resolve a recipient's timezone for customer communications: a known candidate
 * (e.g. `contacts.timezone`) → org default → unresolved. The caller supplies the
 * candidate so this stays decoupled from the persons/contacts schema in Phase A.
 */
export async function resolveRecipientTimezone(
    supabase: SupabaseClient,
    params: { orgId: string; candidateTimezone?: string | null }
): Promise<TimezoneResolution> {
    const candidate = params.candidateTimezone?.trim();
    if (candidate && isValidIanaTimeZone(candidate)) {
        return resolved(candidate, "recipient");
    }
    if (!params.orgId?.trim()) {
        return unresolved("recipient_timezone_unresolved", "Missing org id.");
    }
    return resolveOrgDefaultTimezone(supabase, params.orgId, "recipient_timezone_unresolved");
}

/**
 * Format an instant in a resolved zone (DST-safe via date-fns-tz). Date-only
 * inputs are returned unchanged (never timezone-shifted). Returns null when the
 * zone is unresolved — callers must handle the unknown case, not default to UTC.
 */
export function formatInLocationTz(
    instant: string,
    zone: TimezoneResolution,
    formatStr = "yyyy-MM-dd HH:mm zzz"
): string | null {
    if (isDateOnly(instant)) return instant;
    if (zone.timezone == null) return null;
    return formatInTimeZone(new Date(instant), zone.timezone, formatStr);
}

/**
 * Build an unambiguous dual-time label when a secondary zone differs from the
 * primary (location) zone: "11:00 AM PDT · 1:00 PM CDT". Returns just the primary
 * label when zones match or the secondary is unresolved.
 */
export function dualTimeLabel(
    instant: string,
    primary: TimezoneResolution,
    secondary: TimezoneResolution | undefined,
    formatStr = "h:mm a zzz"
): string | null {
    const primaryLabel = formatInLocationTz(instant, primary, formatStr);
    if (primaryLabel == null) return null;
    if (!secondary || secondary.timezone == null || secondary.timezone === primary.timezone) {
        return primaryLabel;
    }
    const secondaryLabel = formatInLocationTz(instant, secondary, formatStr);
    if (secondaryLabel == null) return primaryLabel;
    return `${secondaryLabel} · ${primaryLabel}`;
}

/**
 * Assemble the set of timezones relevant to one instant + a dual-display flag.
 * Pure — takes already-resolved zones so it has no IO.
 */
export function buildOperationalTimeContext(params: {
    instant: string;
    location: TimezoneResolution;
    viewer?: TimezoneResolution;
    recipient?: TimezoneResolution;
}): OperationalTimeContext {
    const { instant, location, viewer, recipient } = params;
    const differs = (other?: TimezoneResolution): boolean =>
        !!other && other.timezone != null && location.timezone != null && other.timezone !== location.timezone;
    return {
        instant,
        location,
        viewer,
        recipient,
        requiresDualTimeDisplay: differs(viewer) || differs(recipient),
    };
}
