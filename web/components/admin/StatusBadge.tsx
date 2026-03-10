"use client";

/**
 * Reusable status badge for admin. Alloy status system:
 * Active/Completed/Success → Bend Pine; Scheduled/In Progress/Info → Alloy Blue;
 * Warning/Pending → Ember light; Cancelled/Failed/Lost → Ember; Draft/Neutral → River Stone.
 */
type AssignmentStatusKey = "offered" | "accepted" | "declined" | "removed" | "completed" | "unassigned" | "canceled";

const ASSIGNMENT_STYLES: Record<AssignmentStatusKey, string> = {
    offered: "bg-alloy-ember/10 text-alloy-ember border-alloy-ember/30",
    accepted: "bg-alloy-juniper/12 text-[#007a63] border-alloy-juniper/30",
    declined: "bg-alloy-ember/12 text-alloy-ember border-alloy-ember/35",
    removed: "bg-alloy-stone/60 text-alloy-slate border-admin-border",
    completed: "bg-alloy-juniper/12 text-[#007a63] border-alloy-juniper/30",
    unassigned: "bg-alloy-stone/50 text-alloy-muted border-admin-border",
    canceled: "bg-alloy-ember/12 text-alloy-ember border-alloy-ember/35",
};

function getAssignmentStyle(key: string | null | undefined): string {
    if (!key) return ASSIGNMENT_STYLES.unassigned;
    const k = key.toLowerCase() as AssignmentStatusKey;
    return ASSIGNMENT_STYLES[k] ?? "bg-alloy-stone/50 text-alloy-slate border-admin-border";
}

const PILL_CLASS = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";

/** For assignment status: offered, accepted, declined, unassigned, canceled, etc. */
export function AssignmentStatusBadge({ statusKey, label }: { statusKey: string | null | undefined; label?: string | null }) {
    const display = label ?? statusKey ?? "Unassigned";
    const style = getAssignmentStyle(statusKey ?? "unassigned");
    return <span className={`${PILL_CLASS} ${style}`}>{display}</span>;
}

const STATUS_VARIANTS: Record<string, string> = {
    default: "bg-alloy-stone/50 text-alloy-slate border-admin-border",
    success: "bg-alloy-juniper/12 text-[#007a63] border-alloy-juniper/30",
    info: "bg-alloy-blue/10 text-alloy-blue border-alloy-blue/30",
    warning: "bg-alloy-ember/10 text-alloy-ember border-alloy-ember/30",
    error: "bg-alloy-ember/12 text-alloy-ember border-alloy-ember/35",
    neutral: "bg-alloy-stone/50 text-alloy-forge/70 border-admin-border",
    gold: "bg-alloy-light/50 text-alloy-gold-dark border-alloy-gold/40",
};

/** Map status_key to semantic variant for consistent status badge colors across entities. */
export function getStatusVariant(statusKey: string | null | undefined): "default" | "success" | "warning" | "neutral" | "info" | "error" | "gold" {
    if (!statusKey) return "neutral";
    const k = statusKey.toLowerCase();
    if (["active", "completed", "success", "accepted", "posted"].some((x) => k.includes(x))) return "success";
    if (["pending", "new", "draft", "scheduled", "offered", "in_progress"].some((x) => k.includes(x))) return "info";
    if (["inactive", "archived", "canceled", "cancelled", "removed", "unassigned", "declined"].some((x) => k.includes(x))) return "neutral";
    if (["failed", "error", "lost"].some((x) => k.includes(x))) return "error";
    if (["warning", "attention"].some((x) => k.includes(x))) return "warning";
    return "neutral";
}

/** Semantic variants: success/active/completed=Juniper, info/scheduled=Alloy Blue, warning=Ember light, error/destructive=Ember, neutral=River Stone. */
export function StatusBadge({
    label,
    variant = "default",
}: {
    label: string | null | undefined;
    variant?: "default" | "success" | "warning" | "neutral" | "gold" | "info" | "error";
}) {
    const display = label ?? "—";
    const resolvedVariant = variant === "default" ? getStatusVariant(label ?? null) : variant;
    const style = STATUS_VARIANTS[resolvedVariant] ?? STATUS_VARIANTS.default;
    return <span className={`${PILL_CLASS} ${style}`}>{display}</span>;
}

export default StatusBadge;
