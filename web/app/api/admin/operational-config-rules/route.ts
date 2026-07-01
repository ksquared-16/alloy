import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { loadChildcareConfigRuleBundle } from "@/lib/childcareOperational/config/childcareConfigRuleService";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Read-only operational configuration rules (Capacity, Ratio + Tiers, Operating
 * Windows, Schedule Rules) for the Locations configuration workspace
 * (Operational Configuration V1, Batch 0). Returns L1 Configuration truth; the
 * derived expectations read models are exposed elsewhere. No writes.
 *
 * Childcare is the first source of these rules; the surface naming is generic.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    try {
        const bundle = await loadChildcareConfigRuleBundle(supabase, ctx.orgId);
        return NextResponse.json(bundle);
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
