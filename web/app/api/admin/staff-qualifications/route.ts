import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { resolveQualificationStateForWorkContext } from "@/lib/staffQualifications/staffQualificationService";

/**
 * Staff qualification state for one employment: what is held, what is required,
 * and which requirement each held qualification satisfies.
 *
 * READ ONLY. Every mutation goes through the registered commands, so this route
 * cannot become a second write path.
 *
 * The day is the ORGANISATION's calendar day, resolved server-side. Expiration is
 * derived against it, so "expired" is the same answer for every caller rather
 * than depending on the reader's timezone — the failure Slice 1 hit when a UTC
 * date met an org-day resolver.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const params = new URL(request.url).searchParams;
    const employmentId = (params.get("employment_id") ?? "").trim();
    if (!employmentId) {
        return NextResponse.json({ error: "employment_id is required", code: "invalid_input" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        const asOf = (params.get("as_of") ?? "").trim() || (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
        // Work context: the employment's own position and primary site, plus any
        // assignment types it is currently assigned under. Requirement axes are
        // read from canonical authority rather than supplied by the caller.
        const { data: emp } = await supabase
            .from("employments")
            .select("id, position_id, primary_location_id")
            .eq("id", employmentId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (!emp) {
            return NextResponse.json({ error: "Employment not found", code: "not_found" }, { status: 404 });
        }
        const employment = emp as { id: string; position_id: string | null; primary_location_id: string | null };

        const { data: assignments } = await supabase
            .from("schedule_assignments")
            .select("operational_assignment_type_id")
            .eq("org_id", ctx.orgId)
            .eq("subject_type", "staff")
            .eq("subject_person_id", null as never);

        const assignmentTypeIds = [
            ...new Set(
                ((assignments ?? []) as { operational_assignment_type_id: string | null }[])
                    .map((a) => a.operational_assignment_type_id)
                    .filter((v): v is string => Boolean(v)),
            ),
        ];

        const state = await resolveQualificationStateForWorkContext(supabase, ctx.orgId, {
            employmentId,
            positionId: employment.position_id,
            siteLocationId: employment.primary_location_id,
            assignmentTypeIds,
            asOf,
        });
        return NextResponse.json({ as_of: asOf, ...state });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to resolve qualification state";
        return NextResponse.json({ error: message, code: "internal_error" }, { status: 500 });
    }
}
