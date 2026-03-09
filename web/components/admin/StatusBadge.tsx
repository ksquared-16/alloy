"use client";

/**
 * Reusable status badge for admin: assignment (offered/accepted/declined/unassigned/canceled),
 * job/opportunity status or stage. Brand-aware semantic colors. Purely visual; no DB changes.
 */
type AssignmentStatusKey = "offered" | "accepted" | "declined" | "removed" | "completed" | "unassigned" | "canceled";

const ASSIGNMENT_STYLES: Record<AssignmentStatusKey, string> = {
    offered: "bg-amber-50 text-amber-800 border-amber-200/80",
    accepted: "bg-alloy-juniper/15 text-[#007a63] border-alloy-juniper/40",
    declined: "bg-alloy-ember/15 text-alloy-ember border-alloy-ember/40",
    removed: "bg-alloy-stone/50 text-alloy-slate border-alloy-stone",
    completed: "bg-alloy-juniper/15 text-[#007a63] border-alloy-juniper/40",
    unassigned: "bg-alloy-stone/40 text-alloy-muted border-alloy-stone/60",
    canceled: "bg-alloy-stone/50 text-alloy-slate border-alloy-stone/60",
};

function getAssignmentStyle(key: string | null | undefined): string {
    if (!key) return ASSIGNMENT_STYLES.unassigned;
    const k = key.toLowerCase() as AssignmentStatusKey;
    return ASSIGNMENT_STYLES[k] ?? "bg-alloy-stone/40 text-alloy-slate border-alloy-stone/50";
}

const PILL_CLASS = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";

/** For assignment status: offered, accepted, declined, unassigned, canceled, etc. */
export function AssignmentStatusBadge({ statusKey, label }: { statusKey: string | null | undefined; label?: string | null }) {
    const display = label ?? statusKey ?? "Unassigned";
    const style = getAssignmentStyle(statusKey ?? "unassigned");
    return <span className={`${PILL_CLASS} ${style}`}>{display}</span>;
}

/** Semantic variants aligned with Alloy brand: success (Juniper), info (Blue), warning (amber), error (Ember), neutral (stone). */
export function StatusBadge({
    label,
    variant = "default",
}: {
    label: string | null | undefined;
    variant?: "default" | "success" | "warning" | "neutral" | "gold" | "info" | "error";
}) {
    const display = label ?? "—";
    const variants: Record<string, string> = {
        default: "bg-alloy-stone/50 text-alloy-slate border-alloy-stone/60",
        success: "bg-alloy-juniper/15 text-[#007a63] border-alloy-juniper/40",
        info: "bg-alloy-blue/10 text-alloy-blue border-alloy-blue/30",
        warning: "bg-amber-50 text-amber-800 border-amber-200/80",
        error: "bg-alloy-ember/15 text-alloy-ember border-alloy-ember/40",
        neutral: "bg-alloy-stone/50 text-alloy-slate border-alloy-stone/60",
        gold: "bg-alloy-light/50 text-alloy-gold-dark border-alloy-gold/40",
    };
    const style = variants[variant] ?? variants.default;
    return <span className={`${PILL_CLASS} ${style}`}>{display}</span>;
}

export default StatusBadge;
