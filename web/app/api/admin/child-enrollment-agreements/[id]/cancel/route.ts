import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { ENROLLMENT_DECIDE, requireEnrollmentCapability } from "@/lib/access/enrollmentAuthority";
import { cancelAgreementBeforeStart } from "@/lib/childcareOperational/enrollmentAgreementService";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    /*
     * ENROLLMENT DECISION AUTHORITY - cancels an enrollment agreement before it starts.
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

    const supabase = createAdminClient();
    try {
        const agreement = await cancelAgreementBeforeStart(
            supabase,
            ctx.orgId,
            agreementId,
            ctx.userId
        );
        return NextResponse.json({ agreement });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
