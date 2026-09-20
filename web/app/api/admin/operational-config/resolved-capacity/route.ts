import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { loadChildcareConfigRuleBundle } from "@/lib/childcareOperational/config/childcareConfigRuleService";
import { resolveOperationalCapacity } from "@/lib/childcareOperational/capacity/resolveOperationalCapacity";
import { resolveOperationalEnrollmentTodayYmd, operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { resolveLocationById } from "@/lib/location/canonicalLocationProvider";
import { resolveRoomById } from "@/lib/location/canonicalRoomProvider";

/**
 * Canonical resolved capacity for one room, on one date.
 *
 * WHY THIS EXISTS
 * Room detail has to show what a room's capacity actually IS, and the only
 * honest answer is the binding one — the most restrictive applicable limit. That
 * is not min(physical, licensed, operational): canonical binding also considers
 * ratio-limited capacity, which is derived from ratio rules and tiers, not
 * authored as a capacity kind. A surface that had only the authored kinds and
 * took their minimum would confidently print a LARGER number than the room can
 * actually operate at, and would be wrong exactly when ratio is the constraint —
 * which is the case operators most need to see.
 *
 * So this route resolves nothing itself. It loads the canonical config bundle,
 * calls `resolveOperationalCapacity`, and returns what that says. No SQL
 * arithmetic, no "simple binding" shortcut, no second authority.
 *
 * CONTEXT, and what it cannot answer
 * The resolver's ratio arm needs an age-group context to pick a tier, and its
 * occupancy arm needs committed/offered/attended counts. Room detail has neither.
 * Rather than substitute zeros — which would make `availableNow` read as "full"
 * and ratio read as unconstrained — the request carries only what it truthfully
 * has, and the resolver's own `status` and `warnings` travel back untouched so
 * the caller can see which dimensions were not resolvable. A missing dimension
 * comes back null and says so; it is never filled in.
 *
 * Read-only. Org-scoped. No mutation.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const roomLocationId = (searchParams.get("room_location_id") ?? "").trim();
    if (!roomLocationId) {
        return NextResponse.json({ error: "room_location_id is required", code: "invalid_input" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        // Org boundary first: every lookup below is org-scoped, so a room from
        // another tenant resolves to nothing rather than to its real capacity.
        const location = await resolveLocationById(supabase, ctx.orgId, roomLocationId);
        if (!location || location.type !== "unit") {
            return NextResponse.json({ error: "Room not found", code: "not_found" }, { status: 404 });
        }

        // Site by canonical ancestry — a nested classroom's parent is a physical
        // room, and scope precedence needs the campus, not the container.
        const room = await resolveRoomById(supabase, ctx.orgId, roomLocationId);
        const siteLocationId = room?.siteLocationId ?? null;

        const effectiveAt =
            (searchParams.get("effective_at") ?? "").trim() ||
            (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));

        const programCategoryId = (searchParams.get("program_category_id") ?? "").trim() || null;
        const ageGroupKey = (searchParams.get("age_group_key") ?? "").trim() || null;

        const bundle = await loadChildcareConfigRuleBundle(supabase, ctx.orgId);
        const resolution = resolveOperationalCapacity(bundle, {
            orgId: ctx.orgId,
            locationId: roomLocationId,
            siteLocationId,
            programCategoryId,
            roomLocationId,
            ageGroupKey,
            effectiveAt,
            // Deliberately absent: Room detail knows no occupancy, and inventing
            // zeros would turn "unknown" into "empty".
        });

        return NextResponse.json({
            roomLocationId,
            siteLocationId,
            effectiveAt,
            resolution,
        });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
