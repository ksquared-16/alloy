/**
 * Canonical Room provider (Phase A, A3).
 *
 * A Room is a typed Location node (`location_type = 'unit'`, parent = site) — NOT
 * a separate table (RFC §7). This provider is the ONE way to enumerate rooms, so
 * consumers stop querying `location_type === 'unit'` directly. It projects rooms
 * from the Location hierarchy (reusing the Location provider) and keeps
 * operational capacity/ratio values OUT of Room identity — those live in the
 * scoped childcare_* config resolved by the Capacity/Ratio providers.
 *
 * Age band is surfaced as a compatibility HINT only (from `locations.metadata`),
 * never authoritative truth; its structured promotion is open decision §21-5
 * (Phase B). Program eligibility returns an explicit status — `unknown` when
 * there is no age-band data — rather than inventing certainty.
 *
 * Phase A wraps existing reads and migrates no consumers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalLocation, CanonicalRoom } from "@/lib/location/canonicalLocationModel";
import {
    resolveLocationById,
    resolveLocationHierarchy,
} from "@/lib/location/canonicalLocationProvider";

/** Metadata keys that may carry a room's age-band hint (compatibility only). */
const ROOM_AGE_GROUP_METADATA_KEYS = ["classroom_age_group", "childcare_program_type", "category"] as const;

function roomAgeGroupCompat(metadata: Record<string, unknown>): string | null {
    for (const key of ROOM_AGE_GROUP_METADATA_KEYS) {
        const value = metadata[key];
        if (typeof value === "string" && value.length > 0) return value;
    }
    return null;
}

/**
 * Project a `unit` Location into a CanonicalRoom. Returns null for non-unit
 * locations or units with no parent (orphan) — an orphan is never a valid room
 * and must not be silently attached to a phantom site.
 *
 * `siteLocationId` MUST be supplied for a nested room, because a unit's parent
 * is only the site when the room hangs directly off it. Omitting it for a nested
 * group would attribute the group to its containing physical space, which reads
 * as a plausible site id and would never raise — so the resolved site is passed
 * in by the caller that did the ancestor walk, not guessed here.
 */
export function toCanonicalRoom(
    location: CanonicalLocation,
    siteLocationId?: string
): CanonicalRoom | null {
    if (location.type !== "unit" || !location.parentLocationId) return null;
    const site = siteLocationId ?? location.parentLocationId;
    return {
        id: location.id,
        orgId: location.orgId,
        siteLocationId: site,
        containingSpaceLocationId:
            location.parentLocationId === site ? null : location.parentLocationId,
        unitRole: location.unitRole ?? "operational_group",
        name: location.name,
        locationNumber: location.locationNumber,
        statusKey: location.statusKey,
        isActive: location.isActive,
        ageGroupCompat: roomAgeGroupCompat(location.metadata),
        metadata: location.metadata,
    };
}

/** Rooms a child may be PLACED into — operational groups only. */
export function placeableRooms(rooms: readonly CanonicalRoom[]): CanonicalRoom[] {
    return rooms.filter((r) => r.unitRole === "operational_group");
}

/** The operational groups a physical space contains. */
export function groupsInSpace(
    rooms: readonly CanonicalRoom[],
    spaceLocationId: string
): CanonicalRoom[] {
    return rooms.filter((r) => r.containingSpaceLocationId === spaceLocationId);
}

/**
 * Rooms belonging to a site. Empty when the site id is not a `site` Location.
 * Active-only by default. Cross-location leakage is impossible — rooms are the
 * hierarchy's unit children of exactly this site.
 */
export async function resolveRoomsForLocation(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    options: { includeInactive?: boolean } = {}
): Promise<CanonicalRoom[]> {
    const hierarchy = await resolveLocationHierarchy(supabase, orgId, siteLocationId, {
        includeInactive: options.includeInactive,
    });
    if (!hierarchy) return [];
    return hierarchy.rooms
        .map((room) => toCanonicalRoom(room, hierarchy.siteByRoomId.get(room.id) ?? siteLocationId))
        .filter((r): r is CanonicalRoom => r != null);
}

/**
 * A single Room by id, or null when not found / not a `unit` / orphan.
 *
 * A nested group needs its site resolved through the containing space, so this
 * follows the parent one hop when the parent is itself a unit. A chain that
 * never reaches a site yields null rather than a room attached to a non-site.
 */
export async function resolveRoomById(
    supabase: SupabaseClient,
    orgId: string,
    roomId: string
): Promise<CanonicalRoom | null> {
    if (!roomId) return null;
    const location = await resolveLocationById(supabase, orgId, roomId);
    if (!location || location.type !== "unit" || !location.parentLocationId) return null;

    const parent = await resolveLocationById(supabase, orgId, location.parentLocationId);
    if (!parent) return null;
    if (parent.type === "site") return toCanonicalRoom(location, parent.id);

    if (parent.type === "unit" && parent.parentLocationId) {
        const grandparent = await resolveLocationById(supabase, orgId, parent.parentLocationId);
        if (grandparent?.type === "site") return toCanonicalRoom(location, grandparent.id);
    }
    return null;
}

/**
 * Program-eligibility status for a room.
 * - `eligible`     — the room's age-band hint matches the program key.
 * - `not_eligible` — the room has a DIFFERENT age-band hint (positive mismatch).
 * - `unknown`      — no age-band data; eligibility cannot be asserted (compat).
 */
export type RoomProgramEligibility = "eligible" | "not_eligible" | "unknown";

export type RoomProgramMatch = {
    room: CanonicalRoom;
    eligibility: RoomProgramEligibility;
};

/**
 * Rooms at a site tagged with their eligibility for a program. Returns EVERY room
 * with an explicit status (never silently drops `unknown` rooms as ineligible) so
 * callers see the compatibility gap rather than false certainty. Consumers filter
 * by `eligibility` as their surface requires.
 */
export async function resolveRoomsForProgram(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    programKey: string,
    options: { includeInactive?: boolean } = {}
): Promise<RoomProgramMatch[]> {
    const rooms = await resolveRoomsForLocation(supabase, orgId, siteLocationId, options);
    const key = programKey.trim();
    return rooms.map((room) => {
        let eligibility: RoomProgramEligibility;
        if (!key || room.ageGroupCompat == null) {
            eligibility = "unknown";
        } else if (room.ageGroupCompat === key) {
            eligibility = "eligible";
        } else {
            eligibility = "not_eligible";
        }
        return { room, eligibility };
    });
}
