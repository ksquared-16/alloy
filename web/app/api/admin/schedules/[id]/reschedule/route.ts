import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuth, requireAdminOrOps } from "@/lib/adminAuth";

/** POST: create a new schedule (reschedule). Body: { start_at, end_at, timezone?, copy_assignment?: boolean }. */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const auth = await getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: oldScheduleId } = await context.params;
    if (!oldScheduleId) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const startAt = body.start_at != null ? String(body.start_at).trim() : null;
    const endAt = body.end_at != null ? String(body.end_at).trim() : null;
    if (!startAt || !endAt) return NextResponse.json({ error: "Missing start_at or end_at" }, { status: 400 });
    if (new Date(endAt) <= new Date(startAt)) return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: oldSchedule, error: fetchErr } = await supabase
        .from("schedules")
        .select("id, job_id, timezone, duration_minutes, org_id")
        .eq("id", oldScheduleId)
        .single();
    if (fetchErr || !oldSchedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

    const jobId = (oldSchedule as { job_id?: string }).job_id;
    if (!jobId) return NextResponse.json({ error: "Schedule has no job_id" }, { status: 400 });

    const durationMs = new Date(endAt).getTime() - new Date(startAt).getTime();
    const durationMinutes = Math.round(durationMs / 60000) || (oldSchedule as { duration_minutes?: number }).duration_minutes || 120;
    const timezone = body.timezone != null ? String(body.timezone).trim() : ((oldSchedule as { timezone?: string }).timezone ?? "UTC");
    const orgId = (oldSchedule as { org_id?: string }).org_id ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;

    const { data: newSchedule, error: insErr } = await supabase
        .from("schedules")
        .insert({
            org_id: orgId,
            job_id: jobId,
            start_at: startAt,
            end_at: endAt,
            timezone,
            duration_minutes: durationMinutes,
            rescheduled_from_schedule_id: oldScheduleId,
        })
        .select("id")
        .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    const newId = (newSchedule as { id: string }).id;

    const copyAssignment = body.copy_assignment === true;
    if (copyAssignment) {
        const { data: oldAssignment } = await supabase
            .from("assignments")
            .select("vendor_id, assignment_status_id")
            .eq("schedule_id", oldScheduleId)
            .maybeSingle();
        if (oldAssignment) {
            const now = new Date().toISOString();
            await supabase.from("assignments").insert({
                schedule_id: newId,
                job_id: jobId,
                vendor_id: (oldAssignment as { vendor_id: string }).vendor_id,
                assignment_status_id: (oldAssignment as { assignment_status_id?: string }).assignment_status_id ?? null,
                updated_at: now,
            });
        }
    } else {
        const { data: jobRow } = await supabase.from("jobs").select("assigned_vendor_id").eq("id", jobId).single();
        const assignedVendorId = (jobRow as { assigned_vendor_id?: string | null } | null)?.assigned_vendor_id ?? null;
        if (assignedVendorId) {
            const { data: assignedStatus } = await supabase.from("assignment_statuses").select("id").eq("key", "assigned").maybeSingle();
            const assignedStatusId = (assignedStatus as { id?: string } | null)?.id ?? null;
            if (assignedStatusId) {
                await supabase.from("assignments").insert({
                    schedule_id: newId,
                    job_id: jobId,
                    vendor_id: assignedVendorId,
                    assignment_status_id: assignedStatusId,
                    updated_at: new Date().toISOString(),
                });
            }
        }
    }

    return NextResponse.json({ ok: true, schedule_id: newId });
}
