import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { getQueueDefinitionStoredVersion } from "@/lib/rrs/queue/queueDefinitionV1";
import { resolveOpportunityQueueFromDefinition } from "@/lib/rrs/queue/resolveOpportunityQueue";

/**
 * GET — Execute `work_units.queue_definition` for opportunity queues (Growth).
 * Server-side interpreter only; returns rows for workspace rendering.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: workUnitId } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing work unit id" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "work_units", workUnitId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, org_id, department_id, key, queue_definition")
        .eq("id", workUnitId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (wuErr || !wu) {
        return NextResponse.json({ error: wuErr?.message ?? "Not found" }, { status: 404 });
    }

    const qd = (wu as { queue_definition?: unknown }).queue_definition;
    const resolved = await resolveOpportunityQueueFromDefinition(supabase, ctx.orgId, qd);
    if (!resolved.ok) {
        const status = resolved.code === "INVALID_DEFINITION" ? 400 : 500;
        return NextResponse.json({ error: resolved.error, code: resolved.code }, { status });
    }

    const customerIds = [...new Set(resolved.items.map((r) => r.customer_id).filter(Boolean))] as string[];
    const customerNameById = new Map<string, string | null>();
    if (customerIds.length) {
        const { data: custs } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", ctx.orgId)
            .in("id", customerIds);
        for (const c of custs ?? []) {
            const row = c as { id: string; name: string | null };
            customerNameById.set(row.id, row.name ?? null);
        }
    }

    const items = resolved.items.map((row) => ({
        ...row,
        _customer_name: row.customer_id ? (customerNameById.get(row.customer_id) ?? null) : null,
    }));

    return NextResponse.json({
        work_unit_id: workUnitId,
        work_unit_key: (wu as { key?: string }).key ?? null,
        queue_definition_version: getQueueDefinitionStoredVersion(qd),
        total: resolved.total,
        items,
    });
}
