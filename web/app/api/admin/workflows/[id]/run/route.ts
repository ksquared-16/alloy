import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { WORK_OPERATE, requireWorkCapability } from "@/lib/access/workAuthority";

/** POST: run workflow (admin or ops). Body: { event_payload: object } */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    /*
     * WORK AUTHORITY — runs an approved Workflow.
     *
     * Authority here was PORTAL ADMISSION, which decided nothing about
     * whether this principal may do this job. `work.operate` is the authority now, held by
     * grant and by nothing else.
     */
    const capDenied = requireWorkCapability(access, WORK_OPERATE);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id: workflowId } = await context.params;
    if (!workflowId) return NextResponse.json({ error: "Missing workflow id" }, { status: 400 });

    try {
        const body = await request.json();
        const eventPayload = body.event_payload != null && typeof body.event_payload === "object"
            ? (body.event_payload as Record<string, unknown>)
            : {};

        const supabase = createAdminClient();
        if (!(await assertRowOrg(supabase, "workflows", workflowId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        /*
         * THE EVENT PAYLOAD IS CALLER INPUT, AND THE RUNTIME TRUSTS IT FOR TENANCY.
         *
         * Only the WORKFLOW was org-checked above. The payload travels on into
         * `executeWorkflowRun`, which reads `payload.org_id` directly when resolving message
         * recipients — `vendors_query` and `job_qualified_vendors` both do
         * `.eq("org_id", payload.org_id)` — and hydrates `payload.job.id` (or
         * `payload.schedule.job_id`) with `from("jobs").select("*").eq("id", jobId)`, an ID-ONLY
         * read with no org predicate. So an operator running a workflow in their OWN organization
         * could name another organization's id and have the run resolve and message that
         * organization's vendors, or merge its job row into the payload.
         *
         * The two `action-links/*` callers are unaffected: they build their payloads server-side
         * from trusted state. Only this route forwards a request body, so the repair belongs here
         * rather than in the shared runtime, where it would also have to be safe for those callers.
         *
         * The org is therefore PINNED to the caller's own, not accepted, and every record the
         * payload names must belong to it. `assertRowOrg` is the same helper the workflow check
         * above already uses.
         */
        const pinned: Record<string, unknown> = { ...eventPayload, org_id: ctx.orgId };

        const job = pinned.job && typeof pinned.job === "object" ? (pinned.job as Record<string, unknown>) : undefined;
        const schedule =
            pinned.schedule && typeof pinned.schedule === "object"
                ? (pinned.schedule as Record<string, unknown>)
                : undefined;

        const namedJobId = [job?.id, schedule?.job_id]
            .map((v) => (v != null ? String(v).trim() : ""))
            .find((v) => v.length > 0);
        if (namedJobId && !(await assertRowOrg(supabase, "jobs", namedJobId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const namedScheduleId = schedule?.id != null ? String(schedule.id).trim() : "";
        if (namedScheduleId && !(await assertRowOrg(supabase, "schedules", namedScheduleId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const result = await executeWorkflowRun(supabase, workflowId, pinned);

        if (result.status === "failed") {
            return NextResponse.json(
                { ok: result.ok, error: result.error, status: result.status, workflow_run_id: result.workflow_run_id },
                { status: 500 }
            );
        }
        const json: Record<string, unknown> = {
            ok: result.ok,
            status: result.status,
            workflow_run_id: result.workflow_run_id,
            logs: result.logs,
        };
        if (result.skip_reason) json.skip_reason = result.skip_reason;
        return NextResponse.json(json);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("VALIDATION:")) {
            return NextResponse.json(
                { error: msg.replace(/^VALIDATION:\s*/, ""), code: "validation_error" },
                { status: 400 }
            );
        }
        console.error("[WORKFLOW_RUN]", err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
