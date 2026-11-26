import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { ENROLLMENT_DECIDE, requireEnrollmentCapability } from "@/lib/access/enrollmentAuthority";
import { markAgreementEnding } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    operationalEnrollmentErrorResponse,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    /*
     * ENROLLMENT DECISION AUTHORITY - schedules the end of an enrollment.
     *
     * Authority here was PORTAL ADMISSION - `requireAdminOrOps()` resolves admission and no
     * role. It is a grant now, and nothing else.
     */
    const capDenied = requireEnrollmentCapability(access, ENROLLMENT_DECIDE);
    if (capDenied) return capDenied;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    const { id } = await context.params;
    const agreementId = (id ?? "").trim();
    if (!agreementId) {
        return NextResponse.json({ error: "id is required", code: "invalid_input" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const endDate = String(body.end_date ?? "").trim();
    if (!endDate) {
        return NextResponse.json({ error: "end_date is required", code: "invalid_input" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const agreement = await markAgreementEnding(
            supabase,
            ctx.orgId,
            agreementId,
            endDate,
            todayYmd,
            ctx.userId
        );
        return NextResponse.json({ agreement });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
