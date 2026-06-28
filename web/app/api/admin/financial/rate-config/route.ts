import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { loadRateConfigBundle } from "@/lib/financials/rates/rateConfigService";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Read-only Rate Plans + Rate Rules for the Financials configuration surface
 * (Operational Configuration V1, Batch 0). Returns pricing CONFIGURATION (L1);
 * resolution/precedence is not run here. Never writes charges, ledger, GL, or AR.
 *
 * Financial role-gated (admin/ops) to match the money posture, even read-only.
 */
export async function GET() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    try {
        const bundle = await loadRateConfigBundle(supabase, ctx.orgId);
        return NextResponse.json(bundle);
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
