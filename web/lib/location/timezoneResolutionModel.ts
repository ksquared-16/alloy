/**
 * Canonical timezone-resolution model (Phase A, A8 / A4).
 *
 * Location owns exactly one canonical timezone (RFC §10). Phase A establishes
 * the RESOLUTION CONTRACT that hides where the timezone is stored; Phase B
 * promotes it to a first-class `locations.timezone` column. Three concepts are
 * distinguished: storage (Location), viewer, and recipient. Unknown timezone is
 * an explicit `unresolved` state — never a silent UTC / server-local default.
 *
 * Pure types only. No IO, no Supabase client, no UI dependency.
 */

import type {
    OperationalResolutionStatus,
    OperationalResolutionWarning,
} from "@/lib/location/operationalResolutionContracts";

/** Where a resolved timezone came from, in fallback-ladder order. */
export type TimezoneResolutionSource =
    /** Future first-class `locations.timezone` column (Phase B). */
    | "location_column"
    /** Compatibility: `locations.metadata.timezone` / tour rule column. */
    | "location_metadata"
    /** Organization default (`org_settings` timezone chain). */
    | "org_default"
    /** Viewer's own timezone (`user_profiles` / browser). */
    | "viewer"
    /** Recipient's timezone (contact/person), when known. */
    | "recipient"
    /** No trustworthy timezone available — explicitly unresolved. */
    | "unresolved";

/**
 * A resolved timezone with provenance. `timezone` is a validated IANA id, or
 * null when `source === "unresolved"`. `status` is `resolved` for a real zone,
 * `incomplete` when it fell through to unresolved.
 */
export type TimezoneResolution = {
    /** Validated IANA identifier (e.g. `America/Chicago`), or null if unresolved. */
    timezone: string | null;
    source: TimezoneResolutionSource;
    status: Extract<OperationalResolutionStatus, "resolved" | "incomplete">;
    warnings: OperationalResolutionWarning[];
};

/**
 * The set of timezones relevant to rendering one operational instant: the
 * authoritative Location timezone, plus optional viewer and recipient zones for
 * dual-time display. Carries display metadata only — no UI is implemented here.
 */
export type OperationalTimeContext = {
    /** ISO-8601 instant the context describes. */
    instant: string;
    /** Authoritative Location (site) timezone. */
    location: TimezoneResolution;
    /** Active viewer's timezone, when resolved. */
    viewer?: TimezoneResolution;
    /** Recipient's timezone, when resolved (customer comms). */
    recipient?: TimezoneResolution;
    /**
     * True when the viewer/recipient zone differs from the location zone, so a
     * surface should show both ("11:00 AM PDT · 1:00 PM CDT at Downtown Center").
     */
    requiresDualTimeDisplay: boolean;
};
