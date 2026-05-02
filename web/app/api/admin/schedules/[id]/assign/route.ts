import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { executeWorkflowRun } from "@/lib/workflowRun";

/** POST: assign a vendor to this schedule. Body: { vendor_id }. Workflow(s) with event_type "schedule_vendor_assigned" create/update assignment with status "offered". */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
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
        .select("id, job_id, org_id")
        .eq("id", scheduleId)
        .eq("org_id", ctx.orgId)
        .single();
    if (sErr || !schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    const jobId = (schedule as { job_id?: string }).job_id;
    if (!jobId) return NextResponse.json({ error: "Schedule has no job_id" }, { status: 400 });

    if (!(await assertRowOrg(supabase, "vendors", vendorId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "schedule_vendor_assigned").eq("entity_type", "schedule");
    wq = wq.or(`org_id.eq.${ctx.orgId},org_id.is.null`);
    const { data: wfs } = await wq;
    const eventPayload: Record<string, unknown> = {
        event_type: "schedule_vendor_assigned",
        occurred_at: new Date().toISOString(),
        org_id: ctx.orgId,
        schedule_id: scheduleId,
        job_id: jobId,
        vendor_id: vendorId,
        schedule,
    };
    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload);
        } catch (_) {
            // log and continue
        }
    }

    return NextResponse.json({ ok: true });
}
