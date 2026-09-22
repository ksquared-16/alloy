/**
 * The topology half of a room edit: what the operator's Type + Inside choices
 * mean, and — the part that actually needed a decision — what to PERSIST.
 *
 * Shared with create rather than forked from it. Create expresses intent for a
 * row that does not exist yet; edit expresses intent for one that does. The
 * vocabulary, the eligibility rule and the refusal copy are the same either way,
 * so only this last step (what changed, and is it worth writing) lives here.
 */

import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import { canonicalUnitRoleFromStorage } from "@/lib/location/canonicalLocationModel";
import { roleAcceptsInside } from "@/lib/locations/roomTypeVocabulary";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

/** The committed topology of a room, as the edit form should first show it. */
export type CommittedRoomTopology = {
    /** Effective role — a historical NULL already reads as `operational_group`. */
    roomType: CanonicalUnitRole;
    /** The containing physical room, or "" for "directly at the site". */
    insideId: string;
};

export function committedRoomTopology(
    room: LocationHierarchyRow,
    siteId: string | null
): CommittedRoomTopology {
    const roomType =
        (room.unit_role as CanonicalUnitRole | null | undefined) ??
        canonicalUnitRoleFromStorage(room.location_type, null) ??
        "operational_group";
    const parent = room.parent_location_id ?? null;
    // A parent that IS the site means "no containing room"; anything else is one.
    const insideId = parent && parent !== siteId ? parent : "";
    return { roomType, insideId };
}

export type RoomTopologyEditState = {
    roomType: CanonicalUnitRole;
    insideId: string;
};

/** Did the operator actually move anything this module governs? */
export function roomTopologyChanged(
    committed: CommittedRoomTopology,
    next: RoomTopologyEditState
): boolean {
    return committed.roomType !== next.roomType || committed.insideId !== next.insideId;
}

/**
 * Topology keys for the PATCH body — or nothing at all.
 *
 * DECISION (§16): persist the canonical role on an explicit topology edit, and
 * ONLY then.
 *
 * A historical room stores `unit_role = NULL`, which the canonical contract reads
 * as `operational_group`. Two things follow, and they pull in opposite
 * directions unless the trigger is the operator's intent:
 *
 *  - Writing the role on EVERY save would back-fill history as a side effect of
 *    renaming a room. That is a semantic claim nobody made, and it would also
 *    change what `/api/v1/locations` shows a partner — that endpoint exposes the
 *    RAW nullable column on purpose — for a save that changed nothing about the
 *    room's classification.
 *
 *  - Never writing it would leave a room the operator has just deliberately
 *    classified and placed inside a physical room still storing NULL, so the row
 *    no longer describes itself and the audit trail shows a parent change with no
 *    accompanying statement of what the thing is.
 *
 * So: no topology change, no topology keys. An explicit change writes BOTH the
 * role and the parent, because at that moment the operator HAS classified the
 * room, and `operational_group` is then a fact rather than an inference.
 *
 * Returns an empty object when nothing topological moved, so an ordinary rename
 * PATCHes exactly what it did before this slice existed.
 */
export function roomTopologyPatch(
    committed: CommittedRoomTopology,
    next: RoomTopologyEditState,
    siteId: string | null
): { unit_role?: CanonicalUnitRole; parent_location_id?: string } {
    if (!roomTopologyChanged(committed, next)) return {};
    const inside = roleAcceptsInside(next.roomType) ? next.insideId || null : null;
    const parent = inside ?? siteId;
    if (!parent) return { unit_role: next.roomType };
    return { unit_role: next.roomType, parent_location_id: parent };
}
