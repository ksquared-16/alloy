/**
 * Where a room stands between the legacy capacity field and the canonical one.
 *
 * Two capacity systems exist. `childcare_capacity_rules` is authoritative —
 * typed (physical | licensed | operational), scoped, effective-dated, and never
 * additive. `locations.metadata.capacity` is a single UNTYPED number still
 * authored in Add Room and Room detail.
 *
 * The Slice 9 census of the deployed primary found the awkward shape this module
 * exists for: 17 of 17 units carry a legacy value and ZERO canonical rules exist
 * anywhere. So the legacy field is not a vestige with a replacement waiting
 * behind it — it is the only capacity data there is. Retirement has to be a
 * guided, room-by-room adoption, and until it completes both systems are live.
 *
 * The field is untyped, so NOTHING here infers what a legacy number meant. A
 * classroom-sized value on an operational group is suggestive and is not
 * evidence; only an operator confirming a kind creates that claim.
 *
 * ONE resolver, consumed by every transitional surface. Canonical and legacy
 * values are never added together, and no capacity kinds are ever summed.
 */

import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

/** Canonical capacity kinds, as the schema CHECK constrains them. */
export type CapacityKindName = "physical" | "licensed" | "operational";

export const CAPACITY_KIND_LABELS: Readonly<Record<CapacityKindName, string>> = {
    physical: "Physical",
    licensed: "Licensed",
    operational: "Operational",
};

/**
 * One line of operator explanation per kind. Deliberately the vocabulary
 * Operational Rules already uses — this introduces no new capacity words.
 */
export const CAPACITY_KIND_HINTS: Readonly<Record<CapacityKindName, string>> = {
    physical: "How many children the space itself can hold.",
    licensed: "The ceiling your licence allows.",
    operational: "How many you actually plan to operate with.",
};

/** The metadata key that records an operator's review of a legacy value. */
export const LEGACY_CAPACITY_REVIEW_KEY = "capacity_review";

/** The only review outcome that is not representable as a canonical rule. */
export const LEGACY_CAPACITY_DISCARDED = "discarded";

/**
 * Provenance stamped onto a canonical rule created by guided adoption.
 *
 * It lives in the rule's own `metadata`, which the authoring service already
 * accepts and stores, so this adds no parallel storage and no schema change.
 * `source_key` could not carry it: `createCapacityRule` hard-codes "config" and
 * does not accept an override, and widening that shared writer to serve one
 * consumer would change every Operational Rules write too.
 *
 * Without this stamp an adopted rule is indistinguishable from one an operator
 * authored directly in Operational Rules — and those are different facts, because
 * only the first says "this legacy number meant THIS".
 */
export const ADOPTION_PROVENANCE_KEY = "legacy_capacity_adoption";

export type LegacyCapacityAdoptionProvenance = {
    /** Always this literal, so the stamp is self-identifying in the row. */
    source: "locations.metadata.capacity";
    source_location_id: string;
    /** The legacy value the operator was looking at when they decided. */
    legacy_value: string;
    /** Whether the legacy value was left in place afterwards. */
    legacy_retained: boolean;
    adopted_at: string;
};

export type AdoptionState =
    /** Legacy value present, no canonical rule, not reviewed. */
    | "legacy_unconfirmed"
    /** Canonical rule created by guided adoption of this room's legacy value. */
    | "canonically_adopted"
    /** Canonical rule(s) exist, authored independently of any legacy value. */
    | "canonically_configured"
    /** Both exist, but nothing records that the legacy value was ever reviewed. */
    | "mixed_needs_review"
    /** Operator explicitly discarded the legacy value; nothing canonical yet. */
    | "legacy_discarded"
    /** Neither system has anything to say. */
    | "no_capacity";

export type RoomCapacityStanding = {
    state: AdoptionState;
    /** The untyped legacy number, when one is still present. */
    legacyValue: string | null;
    /** True once an operator has reviewed the legacy value either way. */
    legacyReviewed: boolean;
    /** Canonical rules scoped to this room, as stored. Never summed. */
    canonicalRules: ChildcareCapacityRuleRow[];
    /** Canonical value per kind, when exactly one rule defines that kind. */
    canonicalByKind: Partial<Record<CapacityKindName, number>>;
    /** True when the surface should offer guided adoption. */
    needsConfirmation: boolean;
};

function metadataOf(row: { metadata?: unknown }): Record<string, unknown> {
    const md = row.metadata;
    return md != null && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : {};
}

/** The legacy number as stored, or null when absent or blank. */
export function legacyCapacityValue(room: { metadata?: unknown }): string | null {
    const raw = metadataOf(room).capacity;
    if (raw == null) return null;
    const value = String(raw).trim();
    return value.length > 0 ? value : null;
}

/** Has the operator explicitly discarded this room's legacy value? */
export function legacyCapacityDiscarded(room: { metadata?: unknown }): boolean {
    return String(metadataOf(room)[LEGACY_CAPACITY_REVIEW_KEY] ?? "").trim() === LEGACY_CAPACITY_DISCARDED;
}

/** Was this canonical rule created by adopting a legacy value? */
export function ruleIsAdoption(rule: ChildcareCapacityRuleRow): boolean {
    const md = metadataOf(rule)[ADOPTION_PROVENANCE_KEY];
    if (md == null || typeof md !== "object" || Array.isArray(md)) return false;
    return (md as Record<string, unknown>).source === "locations.metadata.capacity";
}

/** Rules whose scope is exactly this room. */
export function canonicalRulesForRoom(
    rules: readonly ChildcareCapacityRuleRow[],
    roomLocationId: string
): ChildcareCapacityRuleRow[] {
    if (!roomLocationId) return [];
    return rules.filter((r) => r.scope_type === "room" && r.room_location_id === roomLocationId);
}

/**
 * Where this room stands.
 *
 * Deliberately NOT a second status column: every state except an explicit
 * discard is derived from facts the two systems already hold, so nothing here
 * can drift out of step with them.
 */
export function resolveRoomCapacityStanding(
    room: LocationHierarchyRow,
    allRules: readonly ChildcareCapacityRuleRow[]
): RoomCapacityStanding {
    const legacyValue = legacyCapacityValue(room);
    const discarded = legacyCapacityDiscarded(room);
    const canonicalRules = canonicalRulesForRoom(allRules, room.id);

    const canonicalByKind: Partial<Record<CapacityKindName, number>> = {};
    for (const kind of ["physical", "licensed", "operational"] as const) {
        const forKind = canonicalRules.filter((r) => r.capacity_kind === kind);
        // Several rules for one kind means effective-dating or age-group scoping
        // is in play, and picking one here would be inventing precedence the
        // canonical resolver owns. Report nothing rather than a guess.
        if (forKind.length === 1) canonicalByKind[kind] = forKind[0].capacity;
    }

    let state: AdoptionState;
    if (canonicalRules.length > 0) {
        if (canonicalRules.some(ruleIsAdoption)) state = "canonically_adopted";
        else if (legacyValue != null && !discarded) state = "mixed_needs_review";
        else state = "canonically_configured";
    } else if (discarded) {
        state = "legacy_discarded";
    } else if (legacyValue != null) {
        state = "legacy_unconfirmed";
    } else {
        state = "no_capacity";
    }

    return {
        state,
        legacyValue,
        legacyReviewed: discarded || canonicalRules.some(ruleIsAdoption),
        canonicalRules,
        canonicalByKind,
        needsConfirmation: state === "legacy_unconfirmed" || state === "mixed_needs_review",
    };
}

/**
 * What a transitional surface should DISPLAY for this room.
 *
 * The one compatibility resolver §10 asks for, so four surfaces stop each
 * deciding for themselves. It never adds a canonical value to a legacy one, and
 * it never sums kinds — `canonical` carries the typed values and the caller
 * shows them as the distinct facts they are.
 */
export type CapacityDisplay =
    | { kind: "canonical"; byKind: Partial<Record<CapacityKindName, number>>; adopted: boolean }
    | { kind: "legacy_unconfirmed"; value: string }
    | { kind: "none"; reviewed: boolean };

export function resolveCapacityDisplay(standing: RoomCapacityStanding): CapacityDisplay {
    if (standing.canonicalRules.length > 0) {
        return {
            kind: "canonical",
            byKind: standing.canonicalByKind,
            adopted: standing.state === "canonically_adopted",
        };
    }
    if (standing.state === "legacy_discarded") return { kind: "none", reviewed: true };
    if (standing.legacyValue != null) return { kind: "legacy_unconfirmed", value: standing.legacyValue };
    return { kind: "none", reviewed: false };
}

export type SiteCapacityCoverage = {
    /** Rooms in the cohort this coverage describes. */
    total: number;
    /** Rooms whose capacity meaning is canonically established. */
    confirmed: number;
    /** Rooms still carrying an unreviewed legacy value. */
    needsReview: number;
    /** Rooms with no capacity in either system, reviewed or not. */
    unset: number;
};

/**
 * Capacity COVERAGE for a set of rooms — never a seat total.
 *
 * Canonical doctrine defines no site-level seat aggregate: capacity is
 * room-scoped, kind-specific, effective-dated and binding per operational
 * context. Summing physical rooms with the classrooms inside them, or one kind
 * with another, produces a number that is not any site's capacity. So the honest
 * question a site can answer is how far adoption has got.
 *
 * The caller chooses the cohort; this counts it.
 */
/**
 * The rooms a capacity coverage figure is ABOUT.
 *
 * Active units whose effective role is physical_space or operational_group. A
 * physical room carries licensed and physical seats; a classroom carries the
 * operational and ratio-bearing ones. A SHARED SPACE carries neither — a child
 * may be on the playground without belonging to it, placement cannot target it
 * and ratio does not apply — so counting it would report work that is not
 * outstanding and can never be done.
 *
 * Inactive rooms are excluded, matching how the legacy summary already scoped
 * "across active rooms": a retired room is not missing configuration.
 */
export function capacityCoverageCohort(
    rooms: readonly LocationHierarchyRow[]
): LocationHierarchyRow[] {
    return rooms.filter((room) => {
        if (room.is_active === false) return false;
        if (String(room.location_type ?? "").trim() !== "unit") return false;
        const role = room.unit_role ?? "operational_group";
        return role === "physical_space" || role === "operational_group";
    });
}

export function summarizeSiteCapacityCoverage(
    rooms: readonly LocationHierarchyRow[],
    allRules: readonly ChildcareCapacityRuleRow[]
): SiteCapacityCoverage {
    let confirmed = 0;
    let needsReview = 0;
    let unset = 0;
    for (const room of rooms) {
        const standing = resolveRoomCapacityStanding(room, allRules);
        if (standing.canonicalRules.length > 0) confirmed += 1;
        else if (standing.needsConfirmation || standing.state === "legacy_unconfirmed") needsReview += 1;
        else unset += 1;
    }
    return { total: rooms.length, confirmed, needsReview, unset };
}

/**
 * Compact coverage line for a configuration surface.
 *
 * Deliberately not a number of seats. Canonical doctrine defines no site-level
 * seat aggregate — capacity is room-scoped, kind-specific, effective-dated and
 * binding per operational context — so the honest thing a site can report is how
 * far its rooms have got.
 */
export function formatCapacityCoverage(coverage: SiteCapacityCoverage): string {
    if (coverage.total === 0) return "No rooms yet";
    const parts: string[] = [];
    if (coverage.confirmed > 0) parts.push(`${coverage.confirmed} confirmed`);
    if (coverage.needsReview > 0) parts.push(`${coverage.needsReview} need review`);
    if (coverage.unset > 0) parts.push(`${coverage.unset} unset`);
    return parts.join(" · ") || "No capacity configured yet";
}

/**
 * May Add Room still capture an untyped legacy capacity for this site?
 *
 * The debt stop. While a site has NO canonical capacity rules, the legacy field
 * is the only capture path its operators have ever had, and removing it would
 * leave them unable to record capacity at all — the Slice 9 census found exactly
 * that estate: legacy everywhere, canonical nowhere.
 *
 * Once the site has even one canonical rule, its operators have demonstrably
 * reached the canonical path, and every further untyped number is new debt
 * someone will later have to review. So the field stops writing there.
 *
 * Readiness is judged per SITE rather than per org or by a flag day, because
 * adoption happens a campus at a time.
 */
export function siteAcceptsLegacyCapacityCapture(
    siteRooms: readonly LocationHierarchyRow[],
    allRules: readonly ChildcareCapacityRuleRow[]
): boolean {
    const roomIds = new Set(siteRooms.map((r) => r.id));
    return !allRules.some(
        (rule) => rule.scope_type === "room" && rule.room_location_id != null && roomIds.has(rule.room_location_id)
    );
}
