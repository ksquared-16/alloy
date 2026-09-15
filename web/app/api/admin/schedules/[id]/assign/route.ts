import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingScheduleMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { OPS_JOBS_WRITE, requireSchedulingJobsCapability } from "@/lib/access/schedulingJobsAuthority";

/*
 * AUTHORITY: `ops.jobs.write`. Assigning a vendor to a schedule decides WHO PERFORMS the job occurrence, which is Jobs truth, not Scheduling truth. `scheduling.write` owns WHEN — its PATCH allows only start_at, end_at, timezone, status, status_key and metadata, and cannot set a vendor at all — so gating this on it would widen Scheduling into vendor selection. `ops.jobs.write` already owns the identical effect at job grain (`jobs/[id]/assign-vendor`, and `assigned_vendor_id` is in the job PATCH's ALLOWED_KEYS), so this widens nothing. The route itself agrees: it refuses a schedule with no job_id.
 */
/** POST: assign a vendor to this schedule. Body: { vendor_id }. Workflow(s) with event_type "schedule_vendor_assigned" create/update assignment with status "offered". */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireSchedulingJobsCapability(ctx, OPS_JOBS_WRITE);
    if (denied) return denied;
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: scheduleId } = await context.params;
    if (!scheduleId) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const vendorId = body.vendor_id != null ? String(body.vendor_id).trim() : null;
    if (!vendorId) return NextResponse.json({ error: "Missing vendor_id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: schedule, error: sErr } = await supabase
        .from("schedules")
        .select("id, job_id, org_id, location_id")
        .eq("id", scheduleId)
        .eq("org_id", ctx.orgId)
        .single();
    if (sErr || !schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    if (!(await assertExistingScheduleMutableInAdminScope(supabase, ctx.orgId, dim, scheduleId))) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const jobId = (schedule as { job_id?: string }).job_id;
    if (!jobId) return NextResponse.json({ error: "Schedule has no job_id" }, { status: 400 });

    if (!(await assertRowOrg(supabase, "vendors", vendorId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "schedule_vendor_assigned").eq("entity_type", "schedule");
    wq = wq.or(`org_id.eq.${ctx.orgId},org_id.is.null`);
    const { data: wfs } = await wq;
    const occurredAt = new Date().toISOString();
    const eventPayload: Record<string, unknown> = {
        event_type: "schedule_vendor_assigned",
        occurred_at: occurredAt,
        org_id: ctx.orgId,
        schedule_id: scheduleId,
        job_id: jobId,
        vendor_id: vendorId,
        schedule,
    };
    let eventId: string | null = null;
    try {
        eventId = await emitEvent({
            org_id: ctx.orgId,
            event_type: "schedule_vendor_assigned",
            entity_type: "schedule",
            entity_id: scheduleId,
            occurred_at: occurredAt,
            payload: {
                ...eventPayload,
                actor_user_id: auth.user?.id ?? null,
            },
        });
    } catch (e) {
        console.error("[schedule/assign] emitEvent", e);
    }
    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                event_id: eventId,
                org_id: ctx.orgId,
            });
        } catch {
            // log and continue
        }
    }

    return NextResponse.json({ ok: true });
}
