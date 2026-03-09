"use client";

/**
 * Reusable status badge for admin: assignment (offered/accepted/declined/unassigned/canceled),
 * job/opportunity status or stage. Semantic Alloy colors: Juniper (success), Blue (info), amber (warning), Ember (error), neutral (draft).
 */
type AssignmentStatusKey = "offered" | "accepted" | "declined" | "removed" | "completed" | "unassigned" | "canceled";

const ASSIGNMENT_STYLES: Record<AssignmentStatusKey, string> = {
    offered: "bg-amber-50/90 text-amber-800 border-amber-200/70",
    accepted: "bg-alloy-juniper/12 text-[#007a63] border-alloy-juniper/35",
    declined: "bg-alloy-ember/12 text-alloy-ember border-alloy-ember/35",
    removed: "bg-alloy-stone/60 text-alloy-slate border-admin-border",
    completed: "bg-alloy-juniper/12 text-[#007a63] border-alloy-juniper/35",
    unassigned: "bg-alloy-stone/50 text-alloy-muted border-admin-border",
    canceled: "bg-alloy-ember/10 text-alloy-ember/90 border-alloy-ember/30",
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

/** Semantic variants: success/completed/active=Juniper, info/scheduled/in-progress=Blue, warning/pending=amber, error/failed/lost=Ember, neutral/draft=refined muted. */
export function StatusBadge({
    label,
    variant = "default",
}: {
    label: string | null | undefined;
    variant?: "default" | "success" | "warning" | "neutral" | "gold" | "info" | "error";
}) {
    const display = label ?? "—";
    const variants: Record<string, string> = {
        default: "bg-alloy-stone/50 text-alloy-slate border-admin-border",
        success: "bg-alloy-juniper/12 text-[#007a63] border-alloy-juniper/35",
        info: "bg-alloy-blue/10 text-alloy-blue border-alloy-blue/30",
        warning: "bg-amber-50/90 text-amber-800 border-amber-200/70",
        error: "bg-alloy-ember/12 text-alloy-ember border-alloy-ember/35",
        neutral: "bg-alloy-stone/50 text-alloy-muted border-admin-border",
        gold: "bg-alloy-light/50 text-alloy-gold-dark border-alloy-gold/40",
    };
    const style = variants[variant] ?? variants.default;
    return <span className={`${PILL_CLASS} ${style}`}>{display}</span>;
}

export default StatusBadge;
