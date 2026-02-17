"use client";

/**
 * Reusable status badge for admin: assignment (offered/accepted/declined/unassigned/canceled),
 * job/opportunity status or stage. Purely visual; no DB changes.
 */
type AssignmentStatusKey = "offered" | "accepted" | "declined" | "removed" | "completed" | "unassigned" | "canceled";

const ASSIGNMENT_STYLES: Record<AssignmentStatusKey, string> = {
    offered: "bg-amber-100 text-amber-800 border-amber-200",
    accepted: "bg-green-100 text-green-800 border-green-200",
    declined: "bg-red-100 text-red-800 border-red-200",
    removed: "bg-alloy-stone/30 text-alloy-midnight/70 border-alloy-stone/40",
    completed: "bg-alloy-juniper/20 text-alloy-midnight border-alloy-juniper/40",
    unassigned: "bg-alloy-stone/20 text-alloy-midnight/60 border-alloy-stone/30",
    canceled: "bg-alloy-stone/30 text-alloy-midnight/60 border-alloy-stone/40",
};

function getAssignmentStyle(key: string | null | undefined): string {
    if (!key) return ASSIGNMENT_STYLES.unassigned;
    const k = key.toLowerCase() as AssignmentStatusKey;
    return ASSIGNMENT_STYLES[k] ?? "bg-alloy-stone/20 text-alloy-midnight/70 border-alloy-stone/30";
}

/** For assignment status: offered, accepted, declined, unassigned, canceled, etc. */
export function AssignmentStatusBadge({ statusKey, label }: { statusKey: string | null | undefined; label?: string | null }) {
    const display = label ?? statusKey ?? "Unassigned";
    const style = getAssignmentStyle(statusKey ?? "unassigned");
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}>
            {display}
        </span>
    );
}

/** Generic status/stage badge for job status, opportunity stage, customer status, etc. */
export function StatusBadge({ label, variant = "default" }: { label: string | null | undefined; variant?: "default" | "success" | "warning" | "neutral" | "gold" }) {
    const display = label ?? "—";
    const variants: Record<string, string> = {
        default: "bg-alloy-stone/20 text-[#31394d] border-[#e6e8ec]",
        success: "bg-green-100 text-green-800 border-green-200",
        warning: "bg-amber-100 text-amber-800 border-amber-200",
        neutral: "bg-alloy-stone/30 text-[#45506c] border-[#e6e8ec]",
        gold: "bg-[#e6d3a0]/40 text-[#31394d] border-[#DBC078]",
    };
    const style = variants[variant] ?? variants.default;
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}>
            {display}
        </span>
    );
}

export default StatusBadge;
