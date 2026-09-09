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

/**
 * The semantic role of a `unit` (DB CHECK-enforced, `locations.unit_role`).
 *
 * A classroom is not a different KIND of thing from a room — it is a unit with a
 * role. That is why this is a discriminator rather than a second entity:
 *
 *  - `physical_space`    Room 1. The licensed, capacity-bearing space. It may
 *                        CONTAIN operational groups and is never a placement
 *                        target itself.
 *  - `operational_group` Toddler 1. The classroom/cohort — the ratio and
 *                        staffing unit, and the only legal placement target.
 *  - `shared_space`      Playground, gym. Attendance may name it; placement
 *                        may not, because occupying it never changes which
 *                        group a child belongs to.
 *
 * A legacy unit with no stored role reads as `operational_group` — that is what
 * every room in the system meant before the roles existed.
 */
export type CanonicalUnitRole = "physical_space" | "operational_group" | "shared_space";

export const DEFAULT_UNIT_ROLE: CanonicalUnitRole = "operational_group";

/** Effective role for a unit; null for a site/address row. */
export function effectiveUnitRole(
    type: CanonicalLocationType,
    storedRole: CanonicalUnitRole | null
): CanonicalUnitRole | null {
    if (type !== "unit") return null;
    return storedRole ?? DEFAULT_UNIT_ROLE;
}

/** A unit a child may be PLACED into. Placement is committed group membership. */
export function isPlaceableUnitRole(role: CanonicalUnitRole | null): boolean {
    return role === "operational_group";
}

/** A unit attendance may name. Any unit at the site qualifies — including a shared space. */
export function isAttendanceLocatableRole(role: CanonicalUnitRole | null): boolean {
    return role != null;
}

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
    /**
     * Effective `locations.unit_role` for a unit (legacy NULL reads as
     * `operational_group`); null on a site/address row.
     */
    unitRole: CanonicalUnitRole | null;
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
    /**
     * The site this room resolves to, by ANCESTRY — not necessarily
     * `parent_location_id`. A group nested inside a physical space has that
     * space as its parent and the site as its grandparent.
     */
    siteLocationId: string;
    /**
     * The physical space that contains this room, when it is nested. Null when
     * the room hangs directly off the site (every legacy room, and any
     * standalone classroom or shared space).
     */
    containingSpaceLocationId: string | null;
    /** Effective semantic role — what kind of unit this room is. */
    unitRole: CanonicalUnitRole;
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
