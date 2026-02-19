import { NextResponse } from "next/server";
import { getAdminAuth, requireAdminOrOps } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { addWeeks, addMonths } from "date-fns";

export async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const auth = await getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: subscriptionId } = await context.params;
    if (!subscriptionId) return NextResponse.json({ error: "Missing subscription id" }, { status: 400 });

    const supabase = createAdminClient();

    const { data: sub, error: subErr } = await supabase
        .from("customer_subscriptions")
        .select("id, customer_id, primary_contact_id, vertical_id, cadence, interval, status, start_date, org_id")
        .eq("id", subscriptionId)
        .single();
    if (subErr || !sub) {
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const cadence = (sub as { cadence?: string }).cadence ?? "month";
    const interval = Math.max(1, Number((sub as { interval?: number }).interval) || 1);

    const { data: latestSchedules } = await supabase
        .from("schedules")
        .select("id, job_id, start_at, end_at, timezone, duration_minutes, subscription_sequence")
        .eq("customer_subscription_id", subscriptionId)
        .is("canceled_at", null)
        .order("subscription_sequence", { ascending: false })
        .limit(1);
    const lastSchedule = latestSchedules?.[0] as { job_id: string; start_at: string; end_at: string; timezone: string; duration_minutes: number; subscription_sequence: number } | undefined;

    let nextStart: Date;
    let nextEnd: Date;
    let timezone: string;
    let durationMinutes: number;
    let jobId: string;
    let nextSequence: number;

    if (lastSchedule) {
        const lastStart = new Date(lastSchedule.start_at);
        nextStart = cadence === "week" ? addWeeks(lastStart, interval) : addMonths(lastStart, interval);
        const lastEnd = new Date(lastSchedule.end_at);
        const durationMs = lastEnd.getTime() - lastStart.getTime();
        nextEnd = new Date(nextStart.getTime() + durationMs);
        timezone = lastSchedule.timezone ?? "UTC";
        durationMinutes = lastSchedule.duration_minutes ?? 120;
        jobId = lastSchedule.job_id;
        nextSequence = (lastSchedule.subscription_sequence ?? 0) + 1;
    } else {
        const startDate = (sub as { start_date?: string | null }).start_date;
        if (!startDate) {
            return NextResponse.json({ error: "No previous schedule and subscription has no start_date" }, { status: 400 });
        }
        nextStart = cadence === "week" ? addWeeks(new Date(startDate + "T12:00:00Z"), interval) : addMonths(new Date(startDate + "T12:00:00Z"), interval);
        nextEnd = new Date(nextStart.getTime() + 120 * 60 * 1000);
        timezone = "UTC";
        durationMinutes = 120;
        const { data: jobsForCustomer } = await supabase
            .from("jobs")
            .select("id")
            .eq("customer_id", sub.customer_id)
            .order("created_at", { ascending: false })
            .limit(1);
        const firstJob = (jobsForCustomer ?? [])[0] as { id: string } | undefined;
        if (!firstJob) {
            return NextResponse.json({ error: "No job found for subscription customer" }, { status: 400 });
        }
        jobId = firstJob.id;
        nextSequence = 1;
    }

    const nextStartIso = nextStart.toISOString();
    const nextEndIso = nextEnd.toISOString();

    const { data: existing } = await supabase
        .from("schedules")
        .select("id")
        .eq("customer_subscription_id", subscriptionId)
        .eq("start_at", nextStartIso)
        .maybeSingle();
    if (existing?.id) {
        return NextResponse.json({ ok: true, schedule_id: existing.id });
    }

    const scheduleOrgId = (sub as { org_id?: string | null }).org_id ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;
    const { data: newSchedule, error: insertErr } = await supabase
        .from("schedules")
        .insert({
            org_id: scheduleOrgId,
            job_id: jobId,
            start_at: nextStartIso,
            end_at: nextEndIso,
            timezone,
            duration_minutes: durationMinutes,
            customer_subscription_id: subscriptionId,
            subscription_sequence: nextSequence,
        })
        .select("id")
        .single();

    if (insertErr) {
        console.error("[GENERATE_NEXT_SCHEDULE]", insertErr);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const newScheduleId = (newSchedule as { id: string }).id;
    const { data: jobRow } = await supabase.from("jobs").select("id, assigned_vendor_id").eq("id", jobId).single();
    const { data: newScheduleRow } = await supabase.from("schedules").select("*").eq("id", newScheduleId).single();
    const orgIdForWf = scheduleOrgId ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;
    let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "schedule_created").eq("entity_type", "schedule");
    if (orgIdForWf) wq = wq.or(`org_id.eq.${orgIdForWf},org_id.is.null`);
    const { data: wfs } = await wq;
    const eventPayload: Record<string, unknown> = {
        event_type: "schedule_created",
        occurred_at: new Date().toISOString(),
        org_id: orgIdForWf,
        schedule_id: newScheduleId,
        job_id: jobId,
        job: jobRow ?? null,
        schedule: newScheduleRow ?? { id: newScheduleId, job_id: jobId },
    };
    const occurredAt = ((eventPayload as Record<string, unknown>)?.occurred_at as string) ?? new Date().toISOString();
    let eventId: string | null = null;
    try {
        eventId = await emitEvent({
            org_id: orgIdForWf ?? null,
            event_type: "schedule_created",
            entity_type: "schedule",
            entity_id: newScheduleId ?? ((eventPayload as Record<string, unknown>)?.schedule as { id?: string } | undefined)?.id ?? null,
            action_type: null,
            occurred_at: occurredAt,
            payload: eventPayload,
        });
    } catch (emitErr) {
        console.error("[SCHEDULE_CREATED_EMIT_EVENT]", emitErr);
        eventId = null;
    }
    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                event_id: eventId,
                org_id: orgIdForWf ?? null,
            });
        } catch (_) {}
    }

    return NextResponse.json({ ok: true, schedule_id: newScheduleId });
}
