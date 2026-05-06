import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { buildOpportunityAttentionQueueItems } from "@/lib/workspace/buildOpportunityAttentionQueueItems";
import { enrichOpportunityQueueRowsWithActivitySignals } from "@/lib/admin/activitySignals";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";

/**
 * GET — Org-wide opportunity attention preview for a department when the `needs_attention` work unit
 * row is missing from bootstrap (Enrollment dept still needs visible exceptions on /dept).
 * Same item shape as `…/work-units/:id/opportunity-attention-queue`; thresholds come from canonical resolver + department `metadata` (defaults when absent).
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "departments", departmentId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        if (!allowed.includes(departmentId)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    try {
        const { data: deptRow } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", departmentId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const departmentMetadata = (deptRow as { metadata?: unknown } | null)?.metadata ?? null;

        const { items, rules, attention_reason_counts } = await buildOpportunityAttentionQueueItems({
            supabase,
            orgId: ctx.orgId,
            attentionConfigMetadata: departmentMetadata,
            accessDim: dim,
        });

        let itemsOut = items;
        try {
            itemsOut = await enrichOpportunityQueueRowsWithActivitySignals({
                supabase,
                orgId: ctx.orgId,
                rows: items,
                workUnitMetadata: null,
                departmentMetadata,
            });
        } catch {
            itemsOut = items;
        }

        return NextResponse.json({
            department_id: departmentId,
            work_unit_key: "needs_attention",
            total: itemsOut.length,
            items: itemsOut,
            rules,
            attention_reason_counts,
            source: "department_attention_preview",
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
