/** Deterministic due/status presentation for operational tasks and scheduled sends. */

export type OperationalDueUrgency = "open" | "due_soon" | "overdue" | "completed" | "canceled" | "scheduled_send";

export type OperationalUrgencyBadge = {
    urgency: OperationalDueUrgency;
    label: string;
    className: string;
};

const BADGE: Record<OperationalDueUrgency, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-sky-100 text-sky-900 border-sky-200/80" },
    due_soon: { label: "Due soon", className: "bg-amber-100 text-amber-950 border-amber-200/80" },
    overdue: { label: "Overdue", className: "bg-red-100 text-red-900 border-red-200/80" },
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-900 border-emerald-200/80" },
    canceled: { label: "Dismissed", className: "bg-alloy-stone/15 text-alloy-midnight/55 border-alloy-stone/25" },
    scheduled_send: { label: "Scheduled", className: "bg-violet-100 text-violet-900 border-violet-200/80" },
};

export function operationalTaskDueUrgency(params: {
    status: string;
    dueAtIso: string;
    now?: Date;
}): OperationalDueUrgency {
    const st = params.status.trim().toLowerCase();
    if (st === "completed") return "completed";
    if (st === "canceled" || st === "cancelled") return "canceled";
    if (st !== "open") return "open";
    const dueMs = Date.parse(params.dueAtIso);
    if (Number.isNaN(dueMs)) return "open";
    const now = params.now ?? new Date();
    const nowMs = now.getTime();
    if (dueMs < nowMs) return "overdue";
    const soonCutoff = nowMs + 24 * 60 * 60 * 1000;
    if (dueMs <= soonCutoff) return "due_soon";
    return "open";
}

export function operationalUrgencyBadge(urgency: OperationalDueUrgency): OperationalUrgencyBadge {
    const b = BADGE[urgency];
    return { urgency, label: b.label, className: b.className };
}

export function operationalTaskUrgencyBadge(task: { status: string; due_at: string }, now?: Date): OperationalUrgencyBadge {
    return operationalUrgencyBadge(operationalTaskDueUrgency({ status: task.status, dueAtIso: task.due_at, now }));
}

export function scheduledSendUrgencyBadge(): OperationalUrgencyBadge {
    return operationalUrgencyBadge("scheduled_send");
}
