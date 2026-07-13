/**
 * Canonical Location + Room domain model (Phase A, A8).
 *
 * Location is the canonical operational scope root (RFC §4). A Room is a typed
 * Location node (`location_type = 'unit'`, parent = site) — NOT a separate table
 * (RFC §7). This model exposes only the stable domain identity consumers need;
 * it deliberately hides the raw `locations` row shape and its ~5 divergent
 * variants behind one type.
 *
 * Scope boundary: `location_type = 'address'` is the field-service home-address
 * domain (RFC §20 / consumer inventory §K) and is NOT a childcare Location.
 * Providers exclude `address` rows unless a distinct mode explicitly requests
 * them; this union keeps `address` representable but callers must opt in.
 *
 * Pure types only. No IO, no Supabase client, no UI dependency.
 */

/** The three `locations.location_type` values (DB CHECK-enforced). */
export type CanonicalLocationType = "site" | "unit" | "address";

/** Normalized postal address (childcare campus or field-service address). */
export type CanonicalLocationAddress = {
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
};

/**
 * Canonical Location identity. Folds every divergent raw `locations` row shape
 * into one. `timezoneRef` is the best-available compatibility timezone reference
 * (today `metadata.timezone`); authoritative timezone resolution is the Timezone
 * provider's job (A4) and Phase B promotes it to a first-class column.
 */
export type CanonicalLocation = {
    id: string;
    orgId: string;
    /** `locations.label` — operator-facing name. May be null on legacy rows. */
    name: string | null;
    /** `locations.location_number` — human-friendly code. */
    locationNumber: number | null;
    type: CanonicalLocationType;
    parentLocationId: string | null;
    /** `locations.status_key` — operating status (text, nullable). */
    statusKey: string | null;
    isActive: boolean;
    isPrimary: boolean;
    address: CanonicalLocationAddress | null;
    /** Best-available compatibility timezone reference; may be null. */
    timezoneRef: string | null;
    /** Retained only for compatibility where a consumer still needs raw metadata. */
    metadata: Record<string, unknown>;
};

/**
 * Canonical Room = a `unit` Location under a site. Operational capacity/ratio
 * values are intentionally NOT part of Room identity (they live in the scoped
 * `childcare_*` config tables resolved by the Capacity/Ratio providers). Age
 * band is exposed as compatibility metadata only — never authoritative truth.
 */
export type CanonicalRoom = {
    id: string;
    orgId: string;
    /** Parent site `locations.id`. */
    siteLocationId: string;
    name: string | null;
    locationNumber: number | null;
    statusKey: string | null;
    isActive: boolean;
    /**
     * Deprecated-EAV age band (`classroom_age_group` / `childcare_program_type`)
     * surfaced for compatibility. Callers must treat it as a hint, not truth;
     * the structured promotion is open decision §21-5 (Phase B).
     */
    ageGroupCompat: string | null;
    metadata: Record<string, unknown>;
};

/**
 * Site-scope allow-list (mirrors `user_site_access`). When `siteLocationIds` is
 * omitted, resolution is org-wide; when present, results are restricted to those
 * sites (and their descendant rooms). An empty array means "no sites permitted".
 */
export type SiteScopeFilter = {
    siteLocationIds?: readonly string[];
};

/**
 * Resolution mode for the Location provider. `childcare` (default) excludes
 * `address` rows; `include_address` is the explicit opt-in for the field-service
 * domain so the childcare providers never accidentally own home addresses.
 */
export type CanonicalLocationResolutionMode = "childcare" | "include_address";

/** The childcare operational location types (excludes `address`). */
export const CHILDCARE_LOCATION_TYPES: readonly CanonicalLocationType[] = ["site", "unit"];

/** True when a location type participates in the childcare operational domain. */
export function isChildcareLocationType(type: CanonicalLocationType): boolean {
    return type === "site" || type === "unit";
}
