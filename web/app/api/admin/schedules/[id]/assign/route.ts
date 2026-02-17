import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuth, requireAdminOrOps } from "@/lib/adminAuth";

/** POST: assign a vendor to this schedule. Body: { vendor_id }. Creates or updates assignment with status "assigned". */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const auth = await getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: scheduleId } = await context.params;
    if (!scheduleId) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const vendorId = body.vendor_id != null ? String(body.vendor_id).trim() : null;
    if (!vendorId) return NextResponse.json({ error: "Missing vendor_id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: schedule, error: sErr } = await supabase
        .from("schedules")
        .select("id, job_id")
        .eq("id", scheduleId)
        .single();
    if (sErr || !schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    const jobId = (schedule as { job_id?: string }).job_id;
    if (!jobId) return NextResponse.json({ error: "Schedule has no job_id" }, { status: 400 });

    const { data: statusRow } = await supabase
        .from("assignment_statuses")
        .select("id")
        .eq("key", "assigned")
        .maybeSingle();
    const assignedStatusId = (statusRow as { id?: string } | null)?.id ?? null;
    if (!assignedStatusId) return NextResponse.json({ error: "Assignment status 'assigned' not found" }, { status: 500 });

    const { data: existing } = await supabase
        .from("assignments")
        .select("id")
        .eq("schedule_id", scheduleId)
        .maybeSingle();

    const now = new Date().toISOString();
    if (existing?.id) {
        const { error: updErr } = await supabase
            .from("assignments")
            .update({ vendor_id: vendorId, assignment_status_id: assignedStatusId, updated_at: now })
            .eq("id", (existing as { id: string }).id);
        if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
        return NextResponse.json({ ok: true, assignment_id: (existing as { id: string }).id });
    }

    const { data: inserted, error: insErr } = await supabase
        .from("assignments")
        .insert({
            schedule_id: scheduleId,
            job_id: jobId,
            vendor_id: vendorId,
            assignment_status_id: assignedStatusId,
            updated_at: now,
        })
        .select("id")
        .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, assignment_id: (inserted as { id: string }).id });
}
