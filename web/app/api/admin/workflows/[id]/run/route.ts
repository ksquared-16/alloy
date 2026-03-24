import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { executeWorkflowRun } from "@/lib/workflowRun";

/** POST: run workflow (admin or ops). Body: { event_payload: object } */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
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
        const result = await executeWorkflowRun(supabase, workflowId, eventPayload);

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
