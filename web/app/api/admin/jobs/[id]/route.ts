import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { executeWorkflowRun } from "@/lib/workflowRun";

const ALLOWED_KEYS = [
    "title",
    "description",
    "job_status_id",
    "is_recurring",
    "assigned_vendor_id",
    "metadata",
    "scheduled_at",
    "service_frequency_key",
    "internal_notes",
    "completed_at",
] as const;

const JOB_ACTIONS = ["assign_vendor", "mark_completed"] as const;

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (ctx instanceof NextResponse) return ctx;
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const body = (await request.json()) as Record<string, unknown>;
        const supabase = createAdminClient();
        const updates: Record<string, unknown> = {};

        const action = body.action as string | undefined;
        if (action && (JOB_ACTIONS as readonly string[]).includes(action)) {
            const { data: jobRow } = await supabase
                .from("jobs")
                .select("*")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .single();
            if (jobRow) {
                let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "job_action").eq("entity_type", "job");
                wq = wq.or(`org_id.eq.${ctx.orgId},org_id.is.null`);
                const { data: wfs } = await wq;
                const eventPayload: Record<string, unknown> = {
                    event_type: "job_action",
                    occurred_at: new Date().toISOString(),
                    org_id: ctx.orgId,
                    action,
                    job: jobRow,
                };
                for (const wf of wfs ?? []) {
                    try {
                        await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload);
                    } catch (_) {
                        // log and continue
                    }
                }
                const { data: jobAfter } = await supabase.from("jobs").select("*").eq("id", id).eq("org_id", ctx.orgId).single();
                if (jobAfter && Object.keys(updates).length === 0) {
                    logAdminAudit({ entity: "jobs", id, changed_fields: ["action:" + action], actor_user_id: ctx.user.id, role: ctx.role });
                    return NextResponse.json(jobAfter);
                }
            }
        }

        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "assigned_vendor_id") {
                updates[key] = body[key] === "" || body[key] == null ? null : body[key];
                continue;
            }
            if (key === "internal_notes") {
                const { data: existing } = await supabase.from("jobs").select("metadata").eq("id", id).eq("org_id", ctx.orgId).single();
                const meta = ((existing as { metadata?: unknown })?.metadata as Record<string, unknown>) || {};
                updates.metadata = { ...meta, internal_notes: body.internal_notes === "" ? null : body.internal_notes };
                continue;
            }
            updates[key] = body[key];
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("jobs")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
        logAdminAudit({
            entity: "jobs",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: ctx.user.id,
            role: ctx.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_JOB]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
