/**
 * GET /api/v1/placements — committed, effective-dated room placement.
 *
 * Placement answers "which room, from when". Corrections are expressed by SUPERSESSION rather than
 * by editing history: a corrected placement is a new row naming the one it replaces, so a partner
 * that has already synchronised the old row learns of the change instead of silently diverging.
 *
 * Rooms are published as Location ids from the same topology `/api/v1/locations` exposes. There is
 * no second room vocabulary and no internal cohort key.
 */

import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { toPublicPlacement } from "@/lib/platform/external/resources/serviceStateResources";

export const dynamic = "force-dynamic";

export const GET = externalCollectionRoute({
    route: "/api/v1/placements",
    operationId: "listPlacements",
    subject: "placements",
    rpc: "list_external_placements",
    params: (params) => {
        const child = uuidFilter(params, "child_id");
        if (!child.ok) return child;
        const site = uuidFilter(params, "site_id");
        if (!site.ok) return site;
        const room = uuidFilter(params, "room_id");
        if (!room.ok) return room;
        return {
            ok: true,
            values: {
                p_child_id: child.value, p_site_id: site.value,
                p_room_id: room.value, p_status: params.get("status"),
            },
        };
    },
    toPublic: toPublicPlacement,
});
