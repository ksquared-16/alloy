/**
 * Room options for the settings room pickers, with their campus resolved
 * correctly.
 *
 * Five surfaces — the Organization Calculations workspace and its readable
 * definition builder, and the three Operational Intelligence builders — each
 * built the same `{id, label, siteLabel}` option and each answered "which
 * campus" the same wrong way:
 *
 *     byId.get(l.parent_location_id)?.label
 *
 * That is right only for a room hanging straight off the site. A classroom
 * nested inside a physical room has the ROOM as its parent, so the lookup
 * succeeds and returns the room's name — and the picker renders
 * "Room 1 / Toddler 1" as though Room 1 were a campus. This failure mode is
 * worse than a blank: nothing looks broken, so nobody checks.
 *
 * Site comes from `resolveRowSiteId`, the canonical bounded ancestry walk. This
 * module owns no hierarchy model of its own — it is a picker adapter.
 */

import { resolveRowSiteId } from "@/lib/location/canonicalRoomProvider";

/** The `locations?hierarchy=1` row shape these pickers already fetch. */
export type RoomPickerLocationRow = {
    id: string;
    label?: string | null;
    location_type?: string | null;
    parent_location_id?: string | null;
};

export type RoomPickerOption = {
    id: string;
    label: string;
    /** The CAMPUS this room resolves to, by ancestry — never its containing room. */
    siteLabel: string;
};

/**
 * The fallback when ancestry does not resolve — a cycle, a missing ancestor, a
 * chain that never reaches a site.
 *
 * Kept exactly as these surfaces already rendered it. A neutral placeholder is
 * safe; falling back to the direct parent's label would reintroduce the very
 * defect this module exists to remove, and would do it precisely in the
 * malformed cases where a confident answer is least earned.
 */
const UNRESOLVED_SITE_LABEL = "Site";

/**
 * Every `unit` location as a picker option.
 *
 * The COHORT is unchanged on purpose: these surfaces test a calculation against
 * a room, and narrowing which rooms they accept is a separate question about the
 * calculations themselves. This repair is about resolving the campus of whatever
 * is included, not about changing what is included.
 */
export function buildRoomPickerOptions(
    locations: readonly RoomPickerLocationRow[]
): RoomPickerOption[] {
    const byId = new Map<string, RoomPickerLocationRow>(locations.map((l) => [l.id, l]));
    return locations
        .filter((l) => String(l.location_type ?? "").toLowerCase() === "unit")
        .map((l) => {
            const siteId = resolveRowSiteId(l, byId);
            const siteLabel = siteId ? String(byId.get(siteId)?.label ?? "").trim() : "";
            return {
                id: l.id,
                label: String(l.label ?? "").trim() || "Untitled room",
                siteLabel: siteLabel || UNRESOLVED_SITE_LABEL,
            };
        });
}
