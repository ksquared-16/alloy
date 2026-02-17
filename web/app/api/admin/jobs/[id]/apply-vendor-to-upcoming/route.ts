import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuth, requireAdminOrOps } from "@/lib/adminAuth";

const ASSIGNED_STATUS_KEY = "assigned";

/**
 * POST: apply job.assigned_vendor_id to all upcoming schedules (safe rules).
 * - No assignment -> create with vendor_id and status 'assigned'.
 * - Assignment exists and status = 'assigned' -> update vendor_id only.
 * - Any other status -> leave unchanged.
 */
export async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const auth = await getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, assigned_vendor_id")
        .eq("id", jobId)
        .single();
    if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const vendorId = (job as { assigned_vendor_id?: string | null }).assigned_vendor_id;
    if (!vendorId) return NextResponse.json({ error: "Job has no assigned_vendor_id; set it first" }, { status: 400 });

    const { data: assignedStatus } = await supabase
        .from("assignment_statuses")
        .select("id")
        .eq("key", ASSIGNED_STATUS_KEY)
        .maybeSingle();
    const assignedStatusId = (assignedStatus as { id?: string } | null)?.id ?? null;
    if (!assignedStatusId) return NextResponse.json({ error: `Assignment status '${ASSIGNED_STATUS_KEY}' not found` }, { status: 500 });

    const now = new Date().toISOString();
    const { data: upcomingSchedules } = await supabase
        .from("schedules")
        .select("id")
        .eq("job_id", jobId)
        .is("canceled_at", null)
        .gte("start_at", now);
    const scheduleIds = (upcomingSchedules ?? []).map((s) => (s as { id: string }).id);
    if (scheduleIds.length === 0) return NextResponse.json({ ok: true, applied: 0 });

    const { data: existingAssignments } = await supabase
        .from("assignments")
        .select("id, schedule_id, assignment_status_id")
        .in("schedule_id", scheduleIds);
    const assignmentBySchedule = new Map(
        (existingAssignments ?? []).map((a) => [(a as { schedule_id: string }).schedule_id, a as { id: string; assignment_status_id?: string | null }])
    );

    const { data: statusRows } = await supabase
        .from("assignment_statuses")
        .select("id, key")
        .in("id", [...new Set((existingAssignments ?? []).map((a) => (a as { assignment_status_id?: string }).assignment_status_id).filter(Boolean))]);
    const statusKeyById = new Map((statusRows ?? []).map((s) => [(s as { id: string }).id, (s as { key: string }).key]));

    let created = 0;
    let updated = 0;
    for (const scheduleId of scheduleIds) {
        const existing = assignmentBySchedule.get(scheduleId);
        if (!existing) {
            const { error: insErr } = await supabase.from("assignments").insert({
                schedule_id: scheduleId,
                job_id: jobId,
                vendor_id: vendorId,
                assignment_status_id: assignedStatusId,
                updated_at: now,
            });
            if (!insErr) created++;
            continue;
        }
        const currentKey = existing.assignment_status_id ? statusKeyById.get(existing.assignment_status_id) : null;
        if (currentKey === ASSIGNED_STATUS_KEY) {
            const { error: updErr } = await supabase
                .from("assignments")
                .update({ vendor_id: vendorId, updated_at: now })
                .eq("id", existing.id);
            if (!updErr) updated++;
        }
    }

    return NextResponse.json({ ok: true, applied: created + updated, created, updated });
}
