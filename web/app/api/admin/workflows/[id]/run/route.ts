import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { executeWorkflowRun } from "@/lib/workflowRun";

/** POST: run workflow (admin or ops). Body: { event_payload: object } */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id: workflowId } = await context.params;
    if (!workflowId) return NextResponse.json({ error: "Missing workflow id" }, { status: 400 });

    try {
        const body = await request.json();
        const eventPayload = body.event_payload != null && typeof body.event_payload === "object"
            ? (body.event_payload as Record<string, unknown>)
            : {};

        const supabase = createAdminClient();
        const result = await executeWorkflowRun(supabase, workflowId, eventPayload);

        if (result.status === "failed") {
            return NextResponse.json(
                { ok: result.ok, error: result.error, status: result.status, workflow_run_id: result.workflow_run_id },
                { status: 500 }
            );
        }
        return NextResponse.json({
            ok: result.ok,
            status: result.status,
            workflow_run_id: result.workflow_run_id,
            logs: result.logs,
        });
    } catch (err: unknown) {
        console.error("[WORKFLOW_RUN]", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
