import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";

/** PATCH: set assignment status (e.g. accepted, declined). Body: { status_key }. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: scheduleId } = await context.params;
    if (!scheduleId) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const statusKey = body.status_key != null ? String(body.status_key).trim() : null;
    if (!statusKey) return NextResponse.json({ error: "Missing status_key" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: schedRow } = await supabase.from("schedules").select("id").eq("id", scheduleId).eq("org_id", ctx.orgId).maybeSingle();
    if (!schedRow) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

    const { data: assignment, error: aErr } = await supabase
        .from("assignments")
        .select("id, status_key")
        .eq("schedule_id", scheduleId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (aErr || !assignment) return NextResponse.json({ error: "No assignment for this schedule" }, { status: 404 });
    const oldStatusKey = (assignment as { status_key?: string | null }).status_key ?? null;

    const { data: statusRow } = await supabase.from("assignment_statuses").select("id, key").eq("key", statusKey).maybeSingle();
    const statusId = (statusRow as { id?: string } | null)?.id ?? null;
    if (!statusId) return NextResponse.json({ error: `Unknown status_key: ${statusKey}` }, { status: 400 });
    const resolvedKey = (statusRow as { key?: string } | null)?.key ?? statusKey;

    const assignId = (assignment as { id: string }).id;
    const { error: updErr } = await supabase
        .from("assignments")
        .update({ assignment_status_id: statusId, status_key: resolvedKey, updated_at: new Date().toISOString() })
        .eq("id", assignId)
        .eq("org_id", ctx.orgId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    const oldNorm = oldStatusKey == null ? null : String(oldStatusKey).trim();
    const newNorm = String(resolvedKey).trim();
    if (oldNorm !== newNorm) {
        const occurredAt = new Date().toISOString();
        const eventPayload: Record<string, unknown> = {
            event_type: "assignment_status_changed",
            occurred_at: occurredAt,
            org_id: ctx.orgId,
            entity_type: "schedule",
            entity_id: scheduleId,
            assignment_id: assignId,
            old_status_key: oldStatusKey,
            new_status_key: resolvedKey,
        };
        let eventId: string | null = null;
        try {
            eventId = await emitEvent({
                org_id: ctx.orgId,
                event_type: "assignment_status_changed",
                entity_type: "schedule",
                entity_id: scheduleId,
                occurred_at: occurredAt,
                payload: {
                    ...eventPayload,
                    actor_user_id: auth.user.id,
                },
            });
        } catch (e) {
            console.warn("[schedule/assignment] emitEvent", e instanceof Error ? e.message : e);
        }
        let wq = supabase
            .from("workflows")
            .select("id")
            .eq("enabled", true)
            .eq("event_type", "assignment_status_changed")
            .eq("entity_type", "schedule");
        wq = wq.or(`org_id.eq.${ctx.orgId},org_id.is.null`);
        const { data: wfs } = await wq;
        for (const wf of wfs ?? []) {
            try {
                await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                    event_id: eventId,
                    org_id: ctx.orgId,
                });
            } catch {
                /* best-effort — match schedule assign route */
            }
        }
    }
    return NextResponse.json({ ok: true });
}
