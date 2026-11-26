import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { NextRequest, NextResponse } from "next/server";
import { claimActionLink } from "@/lib/actionLinks";
import { emitEvent } from "@/lib/emitEvent";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { executeWorkflowRun } from "@/lib/workflowRun";

/**
 * POST /api/action-links/consume-reschedule
 * Body: { token, start_at, end_at, timezone? }
 * Verifies token is valid + not consumed + not expired, then:
 * - Sets action_links.consumed_at
 * - Updates schedule (entity_id = schedule_id) start_at, end_at, updated_at
 * Returns { ok: true, start_at, end_at } or error.
 */
export async function POST(request: NextRequest) {
    let body: { token?: string; start_at?: string; end_at?: string; timezone?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const token = body.token != null ? String(body.token).trim() : null;
    const startAt = body.start_at != null ? String(body.start_at).trim() : null;
    const endAt = body.end_at != null ? String(body.end_at).trim() : null;

    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
    if (!startAt || !endAt) return NextResponse.json({ error: "Missing start_at or end_at" }, { status: 400 });
    if (new Date(endAt) <= new Date(startAt)) {
        return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: row, error: fetchErr } = await supabase
        .from("action_links")
        .select("id, action_type, entity_type, entity_id, consumed_at, expires_at")
        .eq("token_hash", hashFormLinkToken(token))
        .single();

    if (fetchErr || !row) {
        return NextResponse.json({ error: "Invalid or not found" }, { status: 404 });
    }

    const r = row as {
        id: string;
        action_type: string;
        entity_type: string;
        entity_id: string;
        consumed_at: string | null;
        expires_at: string;
    };

    if (r.consumed_at) {
        return NextResponse.json({ error: "Already used" }, { status: 410 });
    }
    if (new Date(r.expires_at) <= new Date()) {
        return NextResponse.json({ error: "Expired" }, { status: 410 });
    }
    if (
        r.entity_type !== "schedule" ||
        (r.action_type !== "customer_reschedule" && r.action_type !== "reschedule_schedule")
    ) {
        return NextResponse.json({ error: "Action not valid for reschedule" }, { status: 400 });
    }

    const scheduleId = r.entity_id;

    // `RL-32` — claim before the schedule moves. This route has the most expensive replay in the
    // family: a lost race used to rewrite `schedules` a second time and emit a second
    // `action_link_consumed`, which is a second confirmation to the customer for one single-use
    // link. The claim decides the race in the database, so only the winner reaches the update.
    const { claimed } = await claimActionLink(supabase, r.id);
    if (!claimed) {
        return NextResponse.json({ error: "Already used" }, { status: 410 });
    }

    const timezone = body.timezone != null ? String(body.timezone).trim() || undefined : undefined;
    const durationMs = new Date(endAt).getTime() - new Date(startAt).getTime();
    const durationMinutes = Math.round(durationMs / 60000);
    const scheduleUpdate: Record<string, unknown> = {
        start_at: startAt,
        end_at: endAt,
        duration_minutes: durationMinutes > 0 ? durationMinutes : undefined,
        /** Matches workflow 89992143 (action_link_consumed → update_entity schedules.reschedule_reason). */
        reschedule_reason: "action_link",
    };
    if (timezone) scheduleUpdate.timezone = timezone;

    const { data: schedule, error: updateErr } = await supabase
        .from("schedules")
        .update(scheduleUpdate)
        .eq("id", scheduleId)
        .select("start_at, end_at, org_id")
        .single();

    if (updateErr || !schedule) {
        return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
    }

    const out = schedule as { start_at: string; end_at: string; org_id: string };
    const orgId = out.org_id;
    const occurredAt = new Date().toISOString();
    const eventPayload: Record<string, unknown> = {
        event_type: "action_link_consumed",
        occurred_at: occurredAt,
        org_id: orgId,
        action_type: r.action_type,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        schedule_id: scheduleId,
        start_at: out.start_at,
        end_at: out.end_at,
        timezone: timezone ?? null,
    };

    let eventId: string | null = null;
    try {
        eventId = await emitEvent({
            org_id: orgId,
            event_type: "action_link_consumed",
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            action_type: r.action_type,
            occurred_at: occurredAt,
            payload: eventPayload,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[consume-reschedule] emitEvent failed", msg);
        return NextResponse.json({ error: "Event emission failed", message: msg }, { status: 500 });
    }

    let wq = supabase
        .from("workflows")
        .select("id")
        .eq("enabled", true)
        .eq("event_type", "action_link_consumed")
        .eq("entity_type", r.entity_type);
    wq = wq.or(`org_id.eq.${orgId},org_id.is.null`);
    const { data: wfs } = await wq;
    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                event_id: eventId,
                org_id: orgId,
            });
        } catch (err) {
            console.error(
                "[consume-reschedule] executeWorkflowRun failed",
                (err as Error).message,
                "workflow_id=",
                (wf as { id: string }).id
            );
            return NextResponse.json(
                { error: "Workflow execution failed", message: (err as Error).message },
                { status: 500 }
            );
        }
    }

    return NextResponse.json({
        ok: true,
        start_at: out.start_at,
        end_at: out.end_at,
    });
}
