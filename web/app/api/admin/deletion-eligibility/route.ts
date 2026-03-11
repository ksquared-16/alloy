/**
 * GET: Evaluate deletion eligibility for a record.
 * Query: entity_type, id.
 * Returns { allowed, reason, recommended_action }.
 * Used by admin drawer to show/hide delete and display reason when blocked.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    evaluateDeletionEligibility,
    isDeletionEligibilityEntityType,
} from "@/lib/admin/deletionEligibility";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const entityType = request.nextUrl.searchParams.get("entity_type")?.trim();
    const id = request.nextUrl.searchParams.get("id")?.trim();

    if (!entityType || !id) {
        return NextResponse.json(
            { error: "entity_type and id are required" },
            { status: 400 }
        );
    }

    if (!isDeletionEligibilityEntityType(entityType)) {
        return NextResponse.json(
            { error: "Unknown entity type for deletion eligibility" },
            { status: 400 }
        );
    }

    const result = await evaluateDeletionEligibility(entityType, id, {
        orgId: ctx.orgId,
    });

    return NextResponse.json(result);
}
