/**
 * The ONE place a location describes its topology to an operator.
 *
 * Before this, three mounted surfaces each answered "which site is this room at"
 * by reading `parent_location_id` and looking it up in a sites-only map. That is
 * correct only for a room hanging straight off the site. A classroom nested in a
 * physical room has the ROOM as its parent, so the lookup missed and the surface
 * printed nothing — or, worse, printed the physical room's name as if it were a
 * campus. Slice 4 made that state reachable by letting operators create it.
 *
 * So the answer lives here once, and the surfaces ask rather than derive.
 *
 * This is PRESENTATION ONLY. Legality belongs to the canonical topology model and
 * the mutation authority; the operator words belong to `roomTypeVocabulary`. This
 * module owns neither — it composes them.
 */

import { resolveRowSiteId } from "@/lib/location/canonicalRoomProvider";
import { roomTypeLabel } from "@/lib/locations/roomTypeVocabulary";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

/** The separator every Alloy configuration subtitle already uses. */
export const TOPOLOGY_SEPARATOR = " · ";

export type RoomTopologyPresentation = {
    /** Operator word for the role: Classroom, Physical room, Shared space. */
    typeLabel: string;
    /** The physical room containing this one, when it is nested. */
    containingSpaceLabel: string | null;
    /** The campus this resolves to, by canonical ancestry. */
    siteLabel: string | null;
    /** Segments in reading order, already free of blanks. */
    segments: string[];
    /** `Classroom · Room 1 · North Campus` */
    subtitle: string;
};

function labelOf(row: LocationHierarchyRow | undefined, fallback: string): string | null {
    if (!row) return null;
    return (row.label ?? "").trim() || fallback;
}

/**
 * Describe one room: what it is, where it sits, and which campus it belongs to.
 *
 * A segment that has no answer is DROPPED rather than rendered as an em dash or
 * an empty gap — a flat classroom simply reads `Classroom · North Campus`, and a
 * room whose site cannot be resolved reads `Classroom` rather than claiming a
 * campus it does not have.
 */
export function presentRoomTopology(
    room: LocationHierarchyRow,
    rows: readonly LocationHierarchyRow[]
): RoomTopologyPresentation {
    const byId = new Map<string, LocationHierarchyRow>(rows.map((r) => [r.id, r]));

    // The effective role already arrived resolved from the read path, so a
    // historical NULL reads as a Classroom without this module spelling the rule.
    const typeLabel = roomTypeLabel(room.unit_role ?? "operational_group");

    const siteId = resolveRowSiteId(room, byId);
    const siteLabel = siteId ? labelOf(byId.get(siteId), "Untitled location") : null;

    // Containment is the parent, and only when the parent is a room rather than
    // the campus. Never inferred from indentation, never from a raw id.
    const parent = room.parent_location_id ? byId.get(room.parent_location_id) : undefined;
    const containingSpaceLabel =
        parent && parent.id !== siteId && String(parent.location_type ?? "").trim() === "unit"
            ? labelOf(parent, "Untitled room")
            : null;

    const segments = [typeLabel, containingSpaceLabel, siteLabel].filter(
        (segment): segment is string => !!segment && segment.length > 0
    );

    return { typeLabel, containingSpaceLabel, siteLabel, segments, subtitle: segments.join(TOPOLOGY_SEPARATOR) };
}

/**
 * Subtitle for a room rail already scoped to one site.
 *
 * The campus is the page you are standing on, so repeating it in every row is
 * noise. What is NOT obvious inside that page is what kind of room this is and
 * which physical room contains it.
 */
export function roomRailTopologySegments(
    room: LocationHierarchyRow,
    rows: readonly LocationHierarchyRow[]
): string[] {
    const { typeLabel, containingSpaceLabel } = presentRoomTopology(room, rows);
    return [typeLabel, containingSpaceLabel].filter((s): s is string => !!s);
}

/**
 * Label for the configuration scope picker.
 *
 * That surface has a deliberately smaller grammar — `name · site`, matching how
 * it already labels programs — so this does NOT force the three-segment list
 * subtitle on it. The repair is that the site is now resolved by ancestry, so a
 * nested classroom stops rendering `Toddler 1 · —`.
 */
export function scopeOptionLabel(
    room: LocationHierarchyRow,
    rows: readonly LocationHierarchyRow[]
): string {
    const name = (room.label ?? "").trim() || "Untitled room";
    const { siteLabel } = presentRoomTopology(room, rows);
    return siteLabel ? `${name}${TOPOLOGY_SEPARATOR}${siteLabel}` : name;
}

/** The site a room resolves to, for sorting and grouping. */
export function roomSiteLabel(
    room: LocationHierarchyRow,
    rows: readonly LocationHierarchyRow[]
): string {
    return presentRoomTopology(room, rows).siteLabel ?? "";
}
