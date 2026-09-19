/**
 * Operator vocabulary for the canonical topology roles, and the one place the
 * Add Room form asks what may contain what.
 *
 * The database calls these `unit_role` values; an operator never sees that word,
 * nor `operational_group`, nor a raw parent id. The mapping is deliberately kept
 * here rather than inline in the form so that the list/detail presentation slice
 * reuses the same words instead of inventing a second set.
 */

import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import { rowsBelongingToSite } from "@/lib/location/canonicalRoomProvider";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

export type RoomTypeOption = {
    role: CanonicalUnitRole;
    label: string;
    /** One compact line, shown only for the selected type. */
    hint: string;
};

/**
 * Presented in the order an operator meets them: the thing they create most
 * often first, then the container, then the exception.
 */
export const ROOM_TYPE_OPTIONS: readonly RoomTypeOption[] = [
    {
        role: "operational_group",
        label: "Classroom",
        hint: "The group children are assigned to.",
    },
    {
        role: "physical_space",
        label: "Physical room",
        hint: "A physical space that can contain one or more classrooms.",
    },
    {
        role: "shared_space",
        label: "Shared space",
        hint: "A non-classroom space used operationally, such as a playground.",
    },
];

/**
 * A new room is a Classroom unless the operator says otherwise. Every room
 * created before topology existed behaves as one, so this is the default that
 * keeps new creation meaning what old creation meant.
 */
export const DEFAULT_ROOM_TYPE: CanonicalUnitRole = "operational_group";

export function roomTypeLabel(role: CanonicalUnitRole | null | undefined): string {
    return ROOM_TYPE_OPTIONS.find((o) => o.role === role)?.label ?? "Classroom";
}

export function roomTypeHint(role: CanonicalUnitRole): string {
    return ROOM_TYPE_OPTIONS.find((o) => o.role === role)?.hint ?? "";
}

/** Only a classroom can sit inside something; the other two hang off the site. */
export function roleAcceptsInside(role: CanonicalUnitRole): boolean {
    return role === "operational_group";
}

/**
 * Fields that only mean something for a classroom.
 *
 * Programs: the only readers are the "Classrooms using this program" panel and
 * the room's own detail view; placement never consults a physical room or a
 * shared space, so offering the field for them would author data nothing reads.
 * Schedule pattern: the same — it is a classroom's default operating pattern.
 *
 * Capacity and active state are NOT here. A physical room carries licensed
 * capacity and a classroom carries program capacity; both are real, and both
 * already existed, so the form keeps offering them.
 */
export function roleUsesProgramFields(role: CanonicalUnitRole): boolean {
    return role === "operational_group";
}

export type InsideOption = { id: string; label: string };

/**
 * The physical rooms a new classroom may be created inside, for one site.
 *
 * Eligibility is canonical truth, not a second filter: `rowsBelongingToSite` is
 * the shared ancestry walk, and the role comes from the effective `unit_role`
 * the read path already resolved. A physical room can never be nested (the DB
 * refuses it), so every one that belongs to the site is a legal container.
 */
export function eligibleInsideOptions(
    roomRows: readonly LocationHierarchyRow[],
    siteId: string,
    options: { excludeLocationId?: string | null } = {}
): InsideOption[] {
    if (!siteId) return [];
    // `excludeLocationId` keeps a room off its own container list while it is
    // being edited. The server refuses that as `topology_cycle` either way; this
    // just stops the form offering a choice it knows will be rejected.
    const excluded = options.excludeLocationId ?? null;
    return rowsBelongingToSite(roomRows, siteId)
        .filter((row) => row.id !== excluded)
        .filter((row) => row.unit_role === "physical_space" && row.is_active !== false)
        .map((row) => ({ id: row.id, label: (row.label ?? "").trim() || "Untitled room" }))
        .sort((a, b) => a.label.localeCompare(b.label));
}
