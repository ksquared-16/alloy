import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { archiveSpace } from "@/lib/locations/archiveSpaceService";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * POST: archive one Space — retire it from current configuration without
 * deleting it. Admin only, org-scoped.
 *
 * Its own route rather than a PATCH field, because archiving is not an
 * ordinary attribute edit: it runs a server-side safety evaluation first and
 * can refuse by name. A caller that could write `archived_at` through the
 * generic PATCH would be able to skip that evaluation entirely, which is why
 * the column is not in PATCH's allowed list.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ error: "Location id is required", code: "invalid_input" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        // The organization's calendar day: "still ahead of us" is a local
        // question, and a UTC date would retire a room a few hours early.
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const result = await archiveSpace(supabase, {
            orgId: ctx.orgId,
            locationId: id,
            todayYmd,
            actorUserId: ctx.userId,
        });
        if (!result.ok) {
            return NextResponse.json(
                { error: result.message, code: result.code },
                { status: result.code === "space_not_found" ? 404 : 409 },
            );
        }
        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Could not archive this space.", code: "db_error" },
            { status: 500 },
        );
    }
}
