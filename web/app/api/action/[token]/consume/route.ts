import { NextRequest, NextResponse } from "next/server";
import { claimActionLink } from "@/lib/actionLinks";
import { emitEvent } from "@/lib/emitEvent";
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

    /** Customer reschedule is finalized in book-v2 + POST /api/action-links/consume-reschedule after a new slot is chosen. */
    if (
        r.entity_type === "schedule" &&
        (r.action_type === "customer_reschedule" || r.action_type === "reschedule_schedule")
    ) {
        return NextResponse.json(
            {
                error: "reschedule_requires_booking_flow",
                message:
                    "Open the booking calendar to pick a new time; the link is consumed only after you confirm the new slot.",
            },
            { status: 400 }
        );
    }

    // `RL-32` — the claim IS the consumption check, and it precedes every side effect below.
    // The `r.consumed_at` read above is a fast path for the sequential case; it cannot decide a
    // race, because two callers both read null before either writes. Losing here means another
    // request already consumed this token, so this one emits no event and runs no workflow.
    const { claimed } = await claimActionLink(supabase, r.id);
    if (!claimed) {
        return NextResponse.json({ error: "Already used" }, { status: 410 });
    }

    const body = await _request.json().catch(() => ({})) as Record<string, unknown>;
    const orgId = r.org_id ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;
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

    let eventId: string | null = null;
    try {
        eventId = await emitEvent({
            org_id: orgId,
            event_type: "action_link_consumed",
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            action_type: r.action_type,
            occurred_at: eventPayload.occurred_at as string,
            payload: eventPayload,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ACTION_CONSUME] emitEvent failed", msg);
        return NextResponse.json({ error: "Event emission failed", message: msg }, { status: 500 });
    }

    let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "action_link_consumed").eq("entity_type", r.entity_type);
    if (orgId) wq = wq.or(`org_id.eq.${orgId},org_id.is.null`);
    const { data: wfs } = await wq;
    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                event_id: eventId,
                org_id: orgId,
            });
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

    return NextResponse.json({ ok: true });
}
