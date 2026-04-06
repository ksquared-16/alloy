import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, requireAdminOrOps } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { emitEvent } from "@/lib/emitEvent";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveScheduleStatusRowByKey } from "@/lib/admin/scheduleEffectiveStatusKey";
import { executeWorkflowRun } from "@/lib/workflowRun";

/** POST: create a new schedule (reschedule). Body: { start_at, end_at, timezone?, copy_assignment?: boolean }. When copy_assignment is false, workflow(s) with event_type "schedule_created" may create assignment from job default. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: oldScheduleId } = await context.params;
    if (!oldScheduleId) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const startAt = body.start_at != null ? String(body.start_at).trim() : null;
    const endAt = body.end_at != null ? String(body.end_at).trim() : null;
    if (!startAt || !endAt) return NextResponse.json({ error: "Missing start_at or end_at" }, { status: 400 });
    if (new Date(endAt) <= new Date(startAt)) return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: oldSchedule, error: fetchErr } = await supabase
        .from("schedules")
        .select("id, job_id, timezone, duration_minutes, org_id")
        .eq("id", oldScheduleId)
        .eq("org_id", ctx.orgId)
        .single();
    if (fetchErr || !oldSchedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

    const orgId = (oldSchedule as { org_id: string }).org_id;
    const jobId = (oldSchedule as { job_id?: string }).job_id;
    if (!jobId) return NextResponse.json({ error: "Schedule has no job_id" }, { status: 400 });

    const durationMs = new Date(endAt).getTime() - new Date(startAt).getTime();
    const durationMinutes = Math.round(durationMs / 60000) || (oldSchedule as { duration_minutes?: number }).duration_minutes || 120;
    const timezone = body.timezone != null ? String(body.timezone).trim() : ((oldSchedule as { timezone?: string }).timezone ?? "UTC");

    const defaultSched = await resolveScheduleStatusRowByKey(supabase, "scheduled");
    const insertRow: Record<string, unknown> = {
        org_id: orgId,
        job_id: jobId,
        start_at: startAt,
        end_at: endAt,
        timezone,
        duration_minutes: durationMinutes,
        rescheduled_from_schedule_id: oldScheduleId,
    };
    if (defaultSched) {
        insertRow.schedule_status_id = defaultSched.id;
        insertRow.status_key = defaultSched.key;
    }

    const { data: newSchedule, error: insErr } = await supabase
        .from("schedules")
        .insert(insertRow)
        .select("id")
        .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    const newId = (newSchedule as { id: string }).id;

    const copyAssignment = body.copy_assignment === true;
    if (copyAssignment) {
        const { data: oldAssignment } = await supabase
            .from("assignments")
            .select("vendor_id, assignment_status_id, status_key")
            .eq("schedule_id", oldScheduleId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (oldAssignment) {
            const now = new Date().toISOString();
            const oa = oldAssignment as { vendor_id: string; assignment_status_id?: string | null; status_key?: string | null };
            let copyKey = oa.status_key != null && String(oa.status_key).trim() ? String(oa.status_key).trim() : null;
            if (!copyKey && oa.assignment_status_id) {
                const { data: st } = await supabase
                    .from("assignment_statuses")
                    .select("key")
                    .eq("id", oa.assignment_status_id)
                    .maybeSingle();
                const k = (st as { key?: string | null } | null)?.key;
                if (k && String(k).trim()) copyKey = String(k).trim();
            }
            await supabase.from("assignments").insert({
                schedule_id: newId,
                job_id: jobId,
                vendor_id: oa.vendor_id,
                assignment_status_id: oa.assignment_status_id ?? null,
                status_key: copyKey,
                org_id: orgId,
                updated_at: now,
            });
        }
    } else {
        const { data: jobRow } = await supabase.from("jobs").select("id, assigned_vendor_id").eq("id", jobId).eq("org_id", ctx.orgId).single();
        const job = jobRow ?? null;
        let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "schedule_created").eq("entity_type", "schedule");
        wq = wq.or(`org_id.eq.${ctx.orgId},org_id.is.null`);
        const { data: wfs } = await wq;
        const { data: newScheduleRow } = await supabase.from("schedules").select("*").eq("id", newId).eq("org_id", ctx.orgId).single();
        const eventPayload: Record<string, unknown> = {
            event_type: "schedule_created",
            occurred_at: new Date().toISOString(),
            org_id: ctx.orgId,
            schedule_id: newId,
            job_id: jobId,
            job,
            schedule: newScheduleRow ?? { id: newId, job_id: jobId },
        };
        const occurredAt = ((eventPayload as Record<string, unknown>)?.occurred_at as string) ?? new Date().toISOString();
        let eventId: string | null = null;
        try {
            eventId = await emitEvent({
                org_id: ctx.orgId,
                event_type: "schedule_created",
                entity_type: "schedule",
                entity_id: newId ?? ((eventPayload as Record<string, unknown>)?.schedule as { id?: string } | undefined)?.id ?? null,
                action_type: null,
                occurred_at: occurredAt,
                payload: eventPayload,
            });
        } catch (emitErr) {
            console.error("[SCHEDULE_CREATED_EMIT_EVENT]", emitErr);
            eventId = null;
        }
        for (const wf of wfs ?? []) {
            try {
                await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                    event_id: eventId,
                    org_id: ctx.orgId,
                });
            } catch (_) {}
        }
    }

    return NextResponse.json({ ok: true, schedule_id: newId });
}
