/**
 * Operator vocabulary for the canonical topology roles, and the one place the
 * Add Space form asks what may contain what.
 *
 * The database calls these `unit_role` values; an operator never sees that word,
 * nor `operational_group`, nor a raw parent id. The mapping is deliberately kept
 * here rather than inline in the form so that the list/detail presentation slice
 * reuses the same words instead of inventing a second set.
 *
 * TWO KINDS, NOT THREE TYPES. The operator chooses between Operational and
 * Physical — the structural distinction the canonical model already makes, and
 * the only one that changes behaviour. "Classroom" was withdrawn as the
 * structural word because it is not one: `metadata.semantic_kind` is the
 * constant string "classroom" on every unit that carries it, and
 * `metadata.category` holds toddler/preschool/infant, which is the Programs
 * vocabulary wearing a different hat. What a space IS gets said by its name and
 * its Programs; what it STRUCTURALLY is gets said by Kind.
 *
 * THREE KINDS (V7 S2). `shared_space` is offered again: it now changes behaviour — a shared space
 * (gym, playground) can carry configured child uses and so hold a schedule, while a physical space
 * is only the licensed container of classrooms and takes no uses. It was withdrawn when nothing
 * distinguished it; the space-use rule (`lib/location/spaceUse.ts`) is what distinguishes it now.
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
 * often first, then the container.
 */
export const ROOM_TYPE_OPTIONS: readonly RoomTypeOption[] = [
    {
        role: "operational_group",
        label: "Operational",
        hint: "A group children are assigned to, such as Toddler 1.",
    },
    {
        role: "shared_space",
        label: "Shared",
        hint: "A place groups visit for an activity, such as the gym or the playground.",
    },
    {
        role: "physical_space",
        label: "Physical",
        hint: "A licensed room that holds classrooms, such as Room 1.",
    },
];

/**
 * A new room is a Classroom unless the operator says otherwise. Every room
 * created before topology existed behaves as one, so this is the default that
 * keeps new creation meaning what old creation meant.
 */
export const DEFAULT_ROOM_TYPE: CanonicalUnitRole = "operational_group";

/** The operator-facing name for a stored role. */
export function roomTypeLabel(role: CanonicalUnitRole | null | undefined): string {
    return ROOM_TYPE_OPTIONS.find((o) => o.role === role)?.label ?? "Operational";
}

export function roomTypeHint(role: CanonicalUnitRole): string {
    return ROOM_TYPE_OPTIONS.find((o) => o.role === role)?.hint ?? "";
}

/** The type options to offer for this object — the same three for every space. */
export function roomTypeOptionsFor(_role: CanonicalUnitRole | null | undefined): readonly RoomTypeOption[] {
    return ROOM_TYPE_OPTIONS;
}

/**
 * Which uses a space of this kind may be configured with (V7 S2): a classroom takes child and staff
 * uses, a shared space child uses, a physical container none.
 */
export function roleAcceptsUses(role: CanonicalUnitRole): boolean {
    return role !== "physical_space";
}

/**
 * Only an operational space can name a containing physical space.
 *
 * The relationship is one physical to many operational, and never the reverse:
 * the database refuses a physical space inside a physical space.
 */
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
