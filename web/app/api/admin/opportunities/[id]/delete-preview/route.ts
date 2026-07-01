import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { previewOpportunityLeadDeletion } from "@/lib/admin/opportunity/deleteOpportunityLead";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const { id } = await context.params;
    if (!id?.trim()) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const ctx = await getAdminContextCached();
        if (!ctx.ok) return adminContextFailureResponse(ctx);

        const access = await getAdminAccessContextCached();
        if (!access.ok) return adminContextFailureResponse(access);

        const supabase = createAdminClient();
        const scopeDim = scopeDimensionsFromAccess(access);
        if (!(await assertExistingOpportunityMutableInAdminScope(supabase, ctx.orgId, scopeDim, id.trim()))) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const preview = await previewOpportunityLeadDeletion(supabase, ctx.orgId, id.trim());
        if (!preview) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

        return NextResponse.json({ preview });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Preview failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
