import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { executeWorkflowRun } from "@/lib/workflowRun";

export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ token: string }> }
) {
    const { token } = await context.params;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: row, error: fetchErr } = await supabase
        .from("action_links")
        .select("id, action_type, entity_type, entity_id, consumed_at, expires_at, org_id")
        .eq("token", token)
        .single();

    if (fetchErr || !row) {
        return NextResponse.json({ error: "Invalid or not found" }, { status: 404 });
    }
    const r = row as { id: string; action_type: string; entity_type: string; entity_id: string; consumed_at: string | null; expires_at: string; org_id?: string | null };
    if (r.consumed_at) {
        return NextResponse.json({ error: "Already used" }, { status: 410 });
    }
    if (new Date(r.expires_at) <= new Date()) {
        return NextResponse.json({ error: "Expired" }, { status: 410 });
    }

    const { error: updateErr } = await supabase
        .from("action_links")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", r.id);
    if (updateErr) {
        return NextResponse.json({ error: "Failed to mark consumed" }, { status: 500 });
    }

    const body = await _request.json().catch(() => ({})) as Record<string, unknown>;
    const orgId = r.org_id ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;
    let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "action_link_consumed").eq("entity_type", r.entity_type);
    if (orgId) wq = wq.or(`org_id.eq.${orgId},org_id.is.null`);
    const { data: wfs } = await wq;
    const eventPayload: Record<string, unknown> = {
        event_type: "action_link_consumed",
        occurred_at: new Date().toISOString(),
        org_id: orgId,
        action_type: r.action_type,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        vendor_id: body.vendor_id ?? null,
        canceled_by: body.canceled_by ?? "customer",
        cancel_reason: body.cancel_reason ?? null,
    };
    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload);
        } catch (err) {
            console.error("[ACTION_CONSUME] executeWorkflowRun failed", (err as Error).message, "workflow_id=", (wf as { id: string }).id);
            return NextResponse.json(
                { error: "Workflow execution failed", message: (err as Error).message },
                { status: 500 }
            );
        }
    }

    if (r.action_type === "vendor_accept_job" && r.entity_type === "job") {
        return NextResponse.json({ ok: true, action: "vendor_accept_job" });
    }
    if (r.action_type === "customer_cancel" && r.entity_type === "schedule") {
        return NextResponse.json({ ok: true, action: "customer_cancel" });
    }
    if (r.action_type === "customer_reschedule") {
        return NextResponse.json({ ok: true, action: "customer_reschedule" });
    }

    return NextResponse.json({ ok: true });
}
