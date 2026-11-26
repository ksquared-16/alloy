/**
 * The organization → school → room shape the Communications surface renders.
 *
 * Rooms are not a separate entity. A room is a `locations` row with
 * `location_type = 'unit'` and a `parent_location_id` pointing at its school,
 * which is a row with `location_type = 'site'`. The vocabulary is canonical —
 * `location_types` defines `site` as "School / center (site)" and `unit` as
 * "Room / classroom".
 *
 * TWO RULES, both learned from the data rather than assumed:
 *
 *  1. **Never infer hierarchy from labels.** "Infant A" exists under more than one
 *     campus in the same tenant, so name matching would merge distinct rooms and
 *     file one campus's conversations under another's. The parent link is the only
 *     authority.
 *
 *  2. **Read `location_type`, the text column — not `location_type_id`.** On the
 *     live tenant `location_type_id` joins NOTHING: every location has a text
 *     type and a null/unmatched type id, while `location_types` itself carries
 *     duplicate rows for the same key (`site` appears as both "Site" and
 *     "School / center (site)"). Joining the lookup would drop every location.
 *
 * A room's identity is deliberately NOT configurable here. See
 * `ROOM_IDENTITY_FUTURE_GATE` below for the exact authority that must exist first.
 */

/** Canonical `location_type` for a school / centre. */
export const SITE_TYPE = "site";
/** Canonical `location_type` for a room / classroom. */
export const ROOM_TYPE = "unit";

/**
 * WHY ROOMS HAVE NO IDENTITY CONTROLS, stated where the code that would add them
 * will be read.
 *
 * Room-specific Communications identities require a canonical outbound
 * conversation/recipient context capable of selecting ONE room truthfully,
 * including the multi-child / multi-room household case — a parent with children
 * in two rooms has no single correct room, and guessing one would send as the
 * wrong classroom.
 *
 * That authority does not exist today. Outbound location comes from
 * `opportunities.location_id` (a site) or a tour subject; the operator send route
 * carries no location at all; and the only canonical room link,
 * `child_placements.room_location_id`, is reached through a child while
 * conversations are keyed on a person or an opportunity.
 *
 * Until that authority exists, **school override → organization fallback is the
 * deepest configurable level.** Rooms are shown, and show what they inherit, so
 * the hierarchy is honest — but no control is offered that the runtime would
 * ignore on every outbound message.
 */
export const ROOM_IDENTITY_FUTURE_GATE =
    "Room-specific Communications identities require a canonical outbound conversation/recipient " +
    "context capable of selecting one room truthfully, including the multi-child / multi-room " +
    "household case. Until that authority exists, school override → organization fallback is the " +
    "deepest configurable level.";

export type LocationRow = {
    id: string;
    label: string;
    location_type?: string | null;
    parent_location_id?: string | null;
};

export type RoomNode = {
    id: string;
    label: string;
};

export type SiteNode = {
    id: string;
    label: string;
    rooms: RoomNode[];
};

export type LocationHierarchy = {
    /** Schools/centres, each with its rooms. Alphabetical, stable. */
    sites: SiteNode[];
    /**
     * Locations that are neither a site nor a room under a known site: a room
     * whose parent is missing or inactive, or a row with an unrecognised type.
     *
     * Surfaced rather than dropped. A room silently missing from this page is
     * indistinguishable from a room that inherits correctly, and the operator
     * would have no way to notice the difference.
     */
    unparented: RoomNode[];
};

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function byLabel(a: { label: string }, b: { label: string }): number {
    return a.label.localeCompare(b.label) || a.label.localeCompare(b.label);
}

/**
 * Build the hierarchy from canonical rows.
 *
 * Deliberately total: every input row lands in exactly one place — under its
 * site, as a site, or in `unparented`. Nothing is discarded, so the count the
 * operator sees always equals the count the tenant has.
 */
export function buildLocationHierarchy(rows: readonly LocationRow[]): LocationHierarchy {
    const sites = new Map<string, SiteNode>();
    const roomsByParent = new Map<string, RoomNode[]>();
    const unparented: RoomNode[] = [];

    for (const row of rows) {
        const id = text(row.id);
        if (!id) continue;
        const node = { id, label: text(row.label) || "Location" };
        if (text(row.location_type).toLowerCase() === SITE_TYPE) {
            sites.set(id, { ...node, rooms: [] });
        }
    }

    for (const row of rows) {
        const id = text(row.id);
        if (!id || sites.has(id)) continue;
        const node: RoomNode = { id, label: text(row.label) || "Location" };
        const parent = text(row.parent_location_id);
        // A parent that is not a known ACTIVE site cannot group anything, so the
        // room is surfaced on its own rather than hidden under a site that is not
        // being rendered.
        if (parent && sites.has(parent)) {
            const list = roomsByParent.get(parent) ?? [];
            list.push(node);
            roomsByParent.set(parent, list);
        } else {
            unparented.push(node);
        }
    }

    for (const [parentId, rooms] of roomsByParent) {
        const site = sites.get(parentId);
        if (site) site.rooms = rooms.sort(byLabel);
    }

    return {
        sites: [...sites.values()].sort(byLabel),
        unparented: unparented.sort(byLabel),
    };
}
