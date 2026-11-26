import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { composeStaffReadiness, StaffReadinessError } from "@/lib/staffReadiness/staffReadinessService";

/**
 * Staff readiness for one employment: the derived state, its gaps, and why.
 *
 * READ ONLY, and there is nothing it could write: readiness has no table. Every
 * response is recomputed from the employment and the canonical qualification
 * answer, which is what makes "expired" true on the morning it becomes true rather
 * than whenever something last ran.
 *
 * The trigger is `record_view`. That is not decoration — `isReadinessBlockingTrigger`
 * admits only action_execute, form_submit and status_transition, so an enforced
 * requirement read here surfaces as `expired` or `needs_information` and never as
 * `blocked`. Slice 5 observes; the consequential seams are Slice 6's, and they
 * arrive by using a different TRIGGER, not by changing this route.
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
        const asOf = (params.get("as_of") ?? "").trim()
            || (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
        const composed = await composeStaffReadiness(supabase, ctx.orgId, employmentId, asOf, "record_view");
        return NextResponse.json(composed);
    } catch (err) {
        if (err instanceof StaffReadinessError) {
            const status = err.code === "not_found" ? 404 : err.code === "invalid_input" ? 422 : 500;
            return NextResponse.json({ error: err.message, code: err.code }, { status });
        }
        const message = err instanceof Error ? err.message : "Failed to evaluate readiness";
        return NextResponse.json({ error: message, code: "internal_error" }, { status: 500 });
    }
}
