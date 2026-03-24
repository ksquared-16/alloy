import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { getAdminAuth, requireAdminOrOps } from "@/lib/adminAuth";

/** PATCH: set assignment status (e.g. accepted, declined). Body: { status_key }. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuth();
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
        .select("id")
        .eq("schedule_id", scheduleId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (aErr || !assignment) return NextResponse.json({ error: "No assignment for this schedule" }, { status: 404 });

    const { data: statusRow } = await supabase.from("assignment_statuses").select("id").eq("key", statusKey).maybeSingle();
    const statusId = (statusRow as { id?: string } | null)?.id ?? null;
    if (!statusId) return NextResponse.json({ error: `Unknown status_key: ${statusKey}` }, { status: 400 });

    const { error: updErr } = await supabase
        .from("assignments")
        .update({ assignment_status_id: statusId, updated_at: new Date().toISOString() })
        .eq("id", (assignment as { id: string }).id)
        .eq("org_id", ctx.orgId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    return NextResponse.json({ ok: true });
}
