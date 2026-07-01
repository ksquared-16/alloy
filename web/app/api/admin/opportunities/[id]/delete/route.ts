import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { executeDeleteOpportunityLead } from "@/lib/admin/opportunity/deleteOpportunityLead";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

        const result = await executeDeleteOpportunityLead({
            supabase,
            orgId: ctx.orgId,
            opportunityId: id.trim(),
            actorUserId: auth.user.id,
            actorRole: auth.role,
        });

        const orphanTotal = Object.values(result.orphans).reduce((sum, n) => sum + n, 0);
        if (orphanTotal > 0) {
            const opportunityStillExists = (result.orphans.opportunities ?? 0) > 0;
            return NextResponse.json(
                {
                    error:
                        opportunityStillExists ?
                            "Delete failed — the opportunity still exists. Check linked records and try again."
                        :   "Delete completed with orphan verification failures.",
                    result,
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true, result });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Delete failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
