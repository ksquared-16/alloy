import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { loadGlConfigBundle } from "@/lib/financials/gl/glConfigService";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Read-only GL Codes + GL Mappings for the Financials configuration surface
 * (Operational Configuration V1, Batch 0). Exposes the accounting targets that
 * posting will eventually use. No posting, no journal/ledger writes, no edits.
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
        const bundle = await loadGlConfigBundle(supabase, ctx.orgId);
        return NextResponse.json(bundle);
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
