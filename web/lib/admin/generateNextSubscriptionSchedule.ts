import { addWeeks, addMonths } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";

type LastScheduleRow = {
    job_id: string;
    start_at: string;
    end_at: string;
    timezone: string | null;
    duration_minutes: number | null;
    subscription_sequence: number | null;
    location_id?: string | null;
    price_cents?: number | null;
    assigned_vendor_id?: string | null;
};

export type GenerateNextSubscriptionScheduleResult =
    | { ok: true; schedule_id: string; duplicate: boolean }
    | { ok: false; error: string; code?: string };

/**
 * Creates the next schedules row for a customer_subscription from the latest non-canceled
 * occurrence (by subscription_sequence). Idempotent when a row already exists for the
 * computed start_at. Also emits schedule_created + runs matching workflows (same as POST generate-next).
 */
export async function generateNextSubscriptionSchedule(
    supabase: SupabaseClient,
    subscriptionId: string
): Promise<GenerateNextSubscriptionScheduleResult> {
    const { data: sub, error: subErr } = await supabase
        .from("customer_subscriptions")
        .select("id, customer_id, primary_contact_id, vertical_id, cadence, interval, status, start_date, org_id")
        .eq("id", subscriptionId)
        .single();
    if (subErr || !sub) {
        return { ok: false, error: "Subscription not found", code: "not_found" };
    }

    const cadence = (sub as { cadence?: string }).cadence ?? "month";
    const interval = Math.max(1, Number((sub as { interval?: number }).interval) || 1);

    const { data: latestSchedules } = await supabase
        .from("schedules")
        .select(
            "id, job_id, start_at, end_at, timezone, duration_minutes, subscription_sequence, location_id, price_cents, assigned_vendor_id"
        )
        .eq("customer_subscription_id", subscriptionId)
        .is("canceled_at", null)
        .order("subscription_sequence", { ascending: false })
        .limit(1);
    const lastSchedule = latestSchedules?.[0] as LastScheduleRow | undefined;

    let nextStart: Date;
    let nextEnd: Date;
    let timezone: string;
    let durationMinutes: number;
    let jobId: string;
    let nextSequence: number;
    let locationId: string | null = null;
    let priceCents: number | null = null;
    let assignedVendorId: string | null = null;

    if (lastSchedule) {
        const lastStart = new Date(lastSchedule.start_at);
        nextStart = cadence === "week" ? addWeeks(lastStart, interval) : addMonths(lastStart, interval);
        const lastEnd = new Date(lastSchedule.end_at);
        const durationMs = lastEnd.getTime() - lastStart.getTime();
        nextEnd = new Date(nextStart.getTime() + durationMs);
        timezone = lastSchedule.timezone ?? "UTC";
        durationMinutes = lastSchedule.duration_minutes ?? 120;
        jobId = lastSchedule.job_id;
        // Treat null subscription_sequence as 1 (first visit) so the next row is sequence 2+ and gets recurring pricing.
        const prevSeq =
            lastSchedule.subscription_sequence != null && lastSchedule.subscription_sequence > 0
                ? lastSchedule.subscription_sequence
                : 1;
        nextSequence = prevSeq + 1;
        locationId = lastSchedule.location_id ?? null;
        assignedVendorId = lastSchedule.assigned_vendor_id ?? null;
    } else {
        const startDate = (sub as { start_date?: string | null }).start_date;
        if (!startDate) {
            return {
                ok: false,
                error: "No previous schedule and subscription has no start_date",
                code: "no_anchor",
            };
        }
        nextStart =
            cadence === "week"
                ? addWeeks(new Date(startDate + "T12:00:00Z"), interval)
                : addMonths(new Date(startDate + "T12:00:00Z"), interval);
        nextEnd = new Date(nextStart.getTime() + 120 * 60 * 1000);
        timezone = "UTC";
        durationMinutes = 120;
        const { data: jobsForCustomer } = await supabase
            .from("jobs")
            .select("id")
            .eq("customer_id", (sub as { customer_id: string }).customer_id)
            .order("created_at", { ascending: false })
            .limit(1);
        const firstJob = (jobsForCustomer ?? [])[0] as { id: string } | undefined;
        if (!firstJob) {
            return { ok: false, error: "No job found for subscription customer", code: "no_job" };
        }
        jobId = firstJob.id;
        nextSequence = 1;
    }

    const { data: jobRow } = await supabase
        .from("jobs")
        .select("id, assigned_vendor_id, recurring_total_cents, gross_price_cents")
        .eq("id", jobId)
        .maybeSingle();
    const recurringTotalCents =
        jobRow?.recurring_total_cents != null && Number.isFinite(Number(jobRow.recurring_total_cents))
            ? Math.round(Number(jobRow.recurring_total_cents))
            : null;

    // Follow-up visits must use jobs.recurring_total_cents — never copy seq-1 price_cents (often net / promo first visit).
    if (lastSchedule) {
        if (recurringTotalCents != null && Number.isFinite(recurringTotalCents) && recurringTotalCents >= 0) {
            priceCents = Math.round(recurringTotalCents);
        } else {
            priceCents = null;
        }
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
        return { ok: true, schedule_id: (existing as { id: string }).id, duplicate: true };
    }

    const scheduleOrgId = (sub as { org_id?: string | null }).org_id ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;
    const insertPayload: Record<string, unknown> = {
        org_id: scheduleOrgId,
        job_id: jobId,
        start_at: nextStartIso,
        end_at: nextEndIso,
        timezone,
        duration_minutes: durationMinutes,
        customer_subscription_id: subscriptionId,
        subscription_sequence: nextSequence,
    };
    if (locationId) insertPayload.location_id = locationId;
    if (priceCents != null) insertPayload.price_cents = priceCents;
    if (assignedVendorId) insertPayload.assigned_vendor_id = assignedVendorId;

    const { data: newSchedule, error: insertErr } = await supabase
        .from("schedules")
        .insert(insertPayload)
        .select("id")
        .single();

    if (insertErr) {
        console.error("[GENERATE_NEXT_SUBSCRIPTION_SCHEDULE]", insertErr);
        return { ok: false, error: insertErr.message, code: "insert_failed" };
    }

    const newScheduleId = (newSchedule as { id: string }).id;
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
        job: jobRow ? { id: jobRow.id, assigned_vendor_id: jobRow.assigned_vendor_id ?? null } : null,
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
        } catch (_) {
            /* workflow best-effort */
        }
    }

    return { ok: true, schedule_id: newScheduleId, duplicate: false };
}
