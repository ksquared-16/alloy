import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { markAgreementEnded } from "@/lib/childcareOperational/enrollmentAgreementService";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    const { id } = await context.params;
    const agreementId = (id ?? "").trim();
    if (!agreementId) {
        return NextResponse.json({ error: "id is required", code: "invalid_input" }, { status: 400 });
    }

    let endDate: string | null | undefined = undefined;
    try {
        const body = (await request.json()) as Record<string, unknown>;
        if (body.end_date != null) {
            endDate = String(body.end_date).trim() || null;
        }
    } catch {
        // empty body allowed
    }

    const supabase = createAdminClient();
    try {
        const agreement = await markAgreementEnded(
            supabase,
            ctx.orgId,
            agreementId,
            ctx.userId,
            endDate
        );
        return NextResponse.json({ agreement });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
