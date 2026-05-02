import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1,
    parseOpportunityAttentionRuleConfigV1FromMetadata,
} from "@/lib/workspace/opportunityAttentionRules";
import { buildOpportunityAttentionQueueItems } from "@/lib/workspace/buildOpportunityAttentionQueueItems";
import { enrichOpportunityQueueRowsWithActivitySignals } from "@/lib/admin/activitySignals";

/**
 * GET — Needs Attention queue for opportunity work units.
 * V1: computed reasons from effective lifecycle stage + last-touched time (updated_at/created_at).
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: workUnitId } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing work unit id" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "work_units", workUnitId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, org_id, department_id, key, metadata")
        .eq("id", workUnitId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (wuErr || !wu) {
        return NextResponse.json({ error: wuErr?.message ?? "Not found" }, { status: 404 });
    }

    const key = ((wu as { key?: string | null }).key ?? "").trim().toLowerCase();
    if (key !== "needs_attention") {
        return NextResponse.json(
            { error: "This endpoint is only valid for work unit key needs_attention" },
            { status: 400 }
        );
    }

    const rules =
        parseOpportunityAttentionRuleConfigV1FromMetadata((wu as { metadata?: unknown }).metadata) ??
        DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1;

    try {
        const { items, rules: resolvedRules, attention_reason_counts } = await buildOpportunityAttentionQueueItems({
            supabase,
            orgId: ctx.orgId,
            rules,
        });

        const deptId = (wu as { department_id?: string | null }).department_id;
        let departmentMetadata: unknown | null = null;
        if (deptId) {
            const { data: deptRow } = await supabase
                .from("departments")
                .select("metadata")
                .eq("id", deptId)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            departmentMetadata = (deptRow as { metadata?: unknown } | null)?.metadata ?? null;
        }

        let itemsOut = items;
        try {
            itemsOut = await enrichOpportunityQueueRowsWithActivitySignals({
                supabase,
                orgId: ctx.orgId,
                rows: items,
                workUnitMetadata: (wu as { metadata?: unknown }).metadata,
                departmentMetadata,
            });
        } catch {
            itemsOut = items;
        }

        return NextResponse.json({
            work_unit_id: workUnitId,
            work_unit_key: "needs_attention",
            total: itemsOut.length,
            items: itemsOut,
            rules: resolvedRules,
            attention_reason_counts,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
