/**
 * Operational Rooms (unit locations belonging to a site) for Assignment Kind
 * eligibility and instant Create/Edit pickers.
 *
 * Resolution is by ANCESTRY, through the canonical Room provider. It used to read
 * `parent_location_id = site`, which stopped being true the moment a physical
 * space could contain operational groups: a classroom nested inside Room 1 has
 * Room 1 as its parent and the site only as its grandparent, so it silently
 * vanished from this list. That matters beyond a picker — staff assignments are
 * what `assigned` attendance capture scope resolves through, so a teacher in a
 * nested classroom could not be assigned to it and therefore could capture for
 * nobody.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveRoomsForLocation } from "@/lib/location/canonicalRoomProvider";
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";

export type SiteOperationalRoom = {
    roomId: string;
    roomName: string | null;
    programCategoryId: string | null;
    active: boolean;
    /**
     * What kind of unit this is. Exposed so a caller can tell a classroom from a
     * playground; this loader deliberately still returns every unit, because
     * narrowing the set is a separate decision from resolving it correctly.
     */
    unitRole: CanonicalUnitRole;
    /** The physical space containing this room, or null when it hangs off the site. */
    containingSpaceLocationId: string | null;
};

function programCategoryFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
    if (!meta) return null;
    const direct = meta.program_category_id;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const nested = meta.room_config;
    if (nested && typeof nested === "object") {
        const id = (nested as Record<string, unknown>).program_category_id;
        if (typeof id === "string" && id.trim()) return id.trim();
    }
    return null;
}

/** Load active-ish operational rooms belonging to a site, at any allowed depth. */
export async function loadSiteOperationalRooms(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string
): Promise<SiteOperationalRoom[]> {
    if (!siteLocationId) return [];
    let rooms;
    try {
        // includeInactive, because this loader has always returned inactive rooms
        // too and reports the fact through `active` rather than by omission.
        rooms = await resolveRoomsForLocation(supabase, orgId, siteLocationId, {
            includeInactive: true,
        });
    } catch (err) {
        throw new OperationalEnrollmentServiceError(
            "db_error",
            err instanceof Error ? err.message : "failed to resolve rooms for site"
        );
    }

    return rooms
        .map((r) => {
            const status = (r.statusKey ?? "").trim().toLowerCase();
            const active = status === "" || status === "active" || status === "open";
            return {
                roomId: r.id,
                roomName: r.name != null ? String(r.name).trim() || null : null,
                programCategoryId: programCategoryFromMetadata(r.metadata),
                active,
                unitRole: r.unitRole,
                containingSpaceLocationId: r.containingSpaceLocationId,
            };
        })
        .sort((a, b) => (a.roomName ?? "").localeCompare(b.roomName ?? ""));
}
