import {
    scheduledSendDeliveryUrgency,
    type ScheduledSendDeliveryUrgency,
} from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";

export type ScheduledSendAttentionRow = {
    status: string;
    scheduled_for: string;
    metadata?: Record<string, unknown> | null;
};

export function scheduledSendProcessErrorMessage(metadata: Record<string, unknown> | null | undefined): string | null {
    if (!metadata || typeof metadata !== "object") return null;
    const err = metadata.last_process_error;
    if (!err || typeof err !== "object") return null;
    const rec = err as Record<string, unknown>;
    const msg = typeof rec.message === "string" ? rec.message.trim() : "";
    const code = typeof rec.error === "string" ? rec.error.trim() : "";
    if (msg) return msg;
    if (code) return code;
    return null;
}

export function scheduledSendAttentionHeadline(
    urgency: ScheduledSendDeliveryUrgency,
    metadata?: Record<string, unknown> | null
): string {
    switch (urgency) {
        case "needs_attention":
            return "Scheduled but not processed. Edit and reschedule, process now, or cancel the send.";
        case "failed": {
            const detail = scheduledSendProcessErrorMessage(metadata);
            return detail ? `Delivery failed: ${detail}` : "Delivery failed. Review the message and reschedule or cancel.";
        }
        case "processing":
            return "Send is being processed by the delivery worker.";
        case "scheduled":
            return "Message is scheduled for delivery.";
        case "queued":
            return "Message is queued for delivery.";
        case "sent_to_provider":
            return "Message was handed off to the provider.";
        case "delivered":
            return "Message was delivered.";
        default:
            return "";
    }
}

/** Pending rows only — full edit of schedule/body/subject. */
export function scheduledSendCanEditContent(status: string): boolean {
    const st = status.trim().toLowerCase();
    return st === "pending";
}

/** Failed or stuck pending may be rescheduled (status reset to pending). */
export function scheduledSendCanReschedule(status: string, scheduledForIso: string, now?: Date): boolean {
    const st = status.trim().toLowerCase();
    if (st === "failed") return true;
    if (st === "pending") {
        const urgency = scheduledSendDeliveryUrgency({ status: st, scheduledForIso, now });
        return urgency === "needs_attention";
    }
    return false;
}

export function scheduledSendCanCancel(status: string): boolean {
    const st = status.trim().toLowerCase();
    return st === "pending" || st === "failed";
}

/** Admin session may trigger org-scoped process-due for pending/claimed past schedule. */
export function scheduledSendCanProcessNow(status: string, scheduledForIso: string, now?: Date): boolean {
    const st = status.trim().toLowerCase();
    if (st !== "pending" && st !== "claimed") return false;
    const schedMs = Date.parse(scheduledForIso);
    const nowMs = (now ?? new Date()).getTime();
    return !Number.isNaN(schedMs) && schedMs <= nowMs;
}

export function scheduledSendAttentionCounts(rows: ScheduledSendAttentionRow[], now?: Date): {
    failed: number;
    needs_attention: number;
} {
    let failed = 0;
    let needs_attention = 0;
    for (const r of rows) {
        const u = scheduledSendDeliveryUrgency({
            status: r.status,
            scheduledForIso: r.scheduled_for,
            now,
        });
        if (u === "failed") failed += 1;
        else if (u === "needs_attention") needs_attention += 1;
    }
    return { failed, needs_attention };
}
