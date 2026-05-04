import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingJobMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";

/**
 * POST: trigger workflow(s) to apply job.assigned_vendor_id to all upcoming schedules.
 * Policy (create/update assignments with status "offered") is performed by workflows
 * with event_type "job_default_vendor_applied" and action apply_job_vendor_to_upcoming.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, assigned_vendor_id, org_id, work_unit_id, location_id")
        .eq("id", jobId)
        .eq("org_id", ctx.orgId)
        .single();
    if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    if (!(await assertExistingJobMutableInAdminScope(supabase, ctx.orgId, dim, jobId))) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const vendorId = (job as { assigned_vendor_id?: string | null }).assigned_vendor_id;
    if (!vendorId) return NextResponse.json({ error: "Job has no assigned_vendor_id; set it first" }, { status: 400 });

    let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "job_default_vendor_applied").eq("entity_type", "job");
    wq = wq.or(`org_id.eq.${ctx.orgId},org_id.is.null`);
    const { data: wfs } = await wq;
    const occurredAt = new Date().toISOString();
    const eventPayload: Record<string, unknown> = {
        event_type: "job_default_vendor_applied",
        occurred_at: occurredAt,
        org_id: ctx.orgId,
        job,
    };
    let eventId: string | null = null;
    try {
        eventId = await emitEvent({
            org_id: ctx.orgId,
            event_type: "job_default_vendor_applied",
            entity_type: "job",
            entity_id: jobId,
            occurred_at: occurredAt,
            payload: {
                ...eventPayload,
                actor_user_id: auth.user.id,
            },
        });
    } catch (e) {
        console.error("[apply-vendor-to-upcoming] emitEvent", e);
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
