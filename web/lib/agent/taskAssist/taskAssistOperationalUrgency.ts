/**
 * Presentation-only urgency for operational_tasks vs communication_scheduled_sends.
 *
 * Doctrine:
 * - Task overdue = human action is late (open + due_at in the past).
 * - Scheduled send after scheduled_for = delivery pipeline state, never "Overdue task".
 */

/** Human-action operational task due presentation. */
export type OperationalTaskDueUrgency = "open" | "due_soon" | "overdue" | "completed" | "canceled";

/** Delivery pipeline state for communication_scheduled_sends. */
export type ScheduledSendDeliveryUrgency =
    | "scheduled"
    | "processing"
    | "needs_attention"
    | "queued"
    | "sent_to_provider"
    | "delivered"
    | "failed"
    | "canceled";

export type OperationalUrgencyBadge<T extends string> = {
    urgency: T;
    label: string;
    className: string;
};

/** Grace after scheduled_for while pending/claimed before "Needs attention" (worker claim/enqueue). */
export const SCHEDULED_SEND_PROCESSING_GRACE_MS = 15 * 60 * 1000;

const TASK_BADGE: Record<OperationalTaskDueUrgency, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-sky-100 text-sky-900 border-sky-200/80" },
    due_soon: { label: "Due soon", className: "bg-amber-100 text-amber-950 border-amber-200/80" },
    overdue: { label: "Overdue", className: "bg-red-100 text-red-900 border-red-200/80" },
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-900 border-emerald-200/80" },
    canceled: { label: "Dismissed", className: "bg-alloy-stone/15 text-alloy-midnight/55 border-alloy-stone/25" },
};

const SEND_BADGE: Record<ScheduledSendDeliveryUrgency, { label: string; className: string }> = {
    scheduled: { label: "Scheduled", className: "bg-violet-100 text-violet-900 border-violet-200/80" },
    processing: { label: "Processing", className: "bg-amber-100 text-amber-950 border-amber-200/80" },
    needs_attention: { label: "Scheduled but not processed", className: "bg-amber-100 text-amber-950 border-amber-300/90" },
    queued: { label: "Queued", className: "bg-slate-100 text-slate-900 border-slate-200/80" },
    sent_to_provider: { label: "Sent", className: "bg-sky-100 text-sky-900 border-sky-200/80" },
    delivered: { label: "Delivered", className: "bg-emerald-100 text-emerald-900 border-emerald-200/80" },
    failed: { label: "Failed", className: "bg-red-100 text-red-900 border-red-200/80" },
    canceled: { label: "Canceled", className: "bg-alloy-stone/15 text-alloy-midnight/55 border-alloy-stone/25" },
};

export function operationalTaskDueUrgency(params: {
    status: string;
    dueAtIso: string;
    now?: Date;
}): OperationalTaskDueUrgency {
    const st = params.status.trim().toLowerCase();
    if (st === "completed") return "completed";
    if (st === "canceled" || st === "cancelled") return "canceled";
    if (st !== "open") return "open";
    const dueMs = Date.parse(params.dueAtIso);
    if (Number.isNaN(dueMs)) return "open";
    const nowMs = (params.now ?? new Date()).getTime();
    if (dueMs < nowMs) return "overdue";
    const soonCutoff = nowMs + 24 * 60 * 60 * 1000;
    if (dueMs <= soonCutoff) return "due_soon";
    return "open";
}

export function scheduledSendDeliveryUrgency(params: {
    status: string;
    scheduledForIso: string;
    now?: Date;
    graceMs?: number;
}): ScheduledSendDeliveryUrgency {
    const st = params.status.trim().toLowerCase();
    if (st === "failed") return "failed";
    if (st === "delivered") return "delivered";
    if (st === "canceled" || st === "cancelled") return "canceled";
    if (st === "queued") return "queued";
    if (st === "sent_to_provider") return "sent_to_provider";

    const schedMs = Date.parse(params.scheduledForIso);
    const nowMs = (params.now ?? new Date()).getTime();
    const grace = params.graceMs ?? SCHEDULED_SEND_PROCESSING_GRACE_MS;

    if (st === "pending" || st === "claimed") {
        if (Number.isNaN(schedMs) || schedMs > nowMs) return "scheduled";
        if (nowMs - schedMs <= grace) return "processing";
        return "needs_attention";
    }

    return "queued";
}

/** Compact strip: in-flight / attention sends only (not terminal delivered/canceled). */
export function scheduledSendStripVisible(status: string): boolean {
    const st = status.trim().toLowerCase();
    return st !== "delivered" && st !== "canceled" && st !== "cancelled";
}

export function operationalTaskUrgencyBadge(
    task: { status: string; due_at: string },
    now?: Date
): OperationalUrgencyBadge<OperationalTaskDueUrgency> {
    const urgency = operationalTaskDueUrgency({ status: task.status, dueAtIso: task.due_at, now });
    const b = TASK_BADGE[urgency];
    return { urgency, label: b.label, className: b.className };
}

export function scheduledSendUrgencyBadge(
    send: { status: string; scheduled_for: string },
    now?: Date,
    graceMs?: number
): OperationalUrgencyBadge<ScheduledSendDeliveryUrgency> {
    const urgency = scheduledSendDeliveryUrgency({
        status: send.status,
        scheduledForIso: send.scheduled_for,
        now,
        graceMs,
    });
    const b = SEND_BADGE[urgency];
    return { urgency, label: b.label, className: b.className };
}
