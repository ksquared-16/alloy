import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { apiOk, apiError } from "@/lib/api/apiResponse";
import { resolveEligibleEnrollmentChildrenForOpportunity } from "@/lib/lifecycle/resolveEligibleEnrollmentChildrenForOpportunity";

type RouteContext = { params: Promise<{ opportunityId: string }> };

/**
 * GET — eligible child Enrollment participations for related-subject commands
 * (e.g. Move to Waitlist from family Focus Panel).
 *
 * Returns operator-facing labels only (no grain / OCM vocabulary in product copy).
 */
export async function GET(_request: NextRequest, context: RouteContext) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { opportunityId: rawId } = await context.params;
    const opportunityId = rawId?.trim() ?? "";
    if (!opportunityId) {
        return apiError("BAD_REQUEST", "opportunityId is required", 400);
    }

    const supabase = createAdminClient();
    const classified = await resolveEligibleEnrollmentChildrenForOpportunity({
        supabase,
        orgId: ctx.orgId,
        opportunityId,
    });

    return apiOk({
        status: classified.status,
        message: "message" in classified ? classified.message : null,
        subjects: classified.subjects.map((row) => ({
            id: row.id,
            label: row.label,
        })),
    });
}
