import { operationalTaskDueUrgency, type OperationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";

export type LayoutRuntimeTaskChipStyle = {
    rowClassName: string;
    badgeClassName: string;
    label: string;
};

const CHIP_BASE =
    "inline-flex w-full max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium leading-snug transition-all hover:shadow-[0_2px_8px_-2px_rgba(24,39,58,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-juniper/25";

const CHIP_BASE_COMPACT =
    "inline-flex w-full max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium leading-tight transition-all hover:shadow-[0_2px_8px_-2px_rgba(24,39,58,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-juniper/25";

const BADGE_BASE =
    "shrink-0 rounded-md border px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide";

const BADGE_BASE_COMPACT =
    "shrink-0 rounded-md border px-1 py-px text-[7px] font-semibold uppercase tracking-[0.04em]";

const STYLES: Record<OperationalTaskDueUrgency, LayoutRuntimeTaskChipStyle> = {
    open: {
        rowClassName: `${CHIP_BASE} border-admin-border bg-white hover:border-alloy-juniper/25`,
        badgeClassName: `${BADGE_BASE} border-alloy-juniper/25 bg-alloy-juniper/8 text-alloy-juniper`,
        label: "Open",
    },
    due_soon: {
        rowClassName: `${CHIP_BASE} border-alloy-ember/20 bg-alloy-ember/[0.04] hover:border-alloy-ember/35`,
        badgeClassName: `${BADGE_BASE} border-alloy-ember/25 bg-alloy-ember/10 text-alloy-ember`,
        label: "Due soon",
    },
    overdue: {
        rowClassName: `${CHIP_BASE} border-alloy-ember/30 bg-alloy-ember/[0.06] hover:border-alloy-ember/45`,
        badgeClassName: `${BADGE_BASE} border-alloy-ember/35 bg-alloy-ember/12 text-alloy-ember`,
        label: "Overdue",
    },
    completed: {
        rowClassName: `${CHIP_BASE} border-alloy-juniper/20 bg-alloy-juniper/[0.05]`,
        badgeClassName: `${BADGE_BASE} border-alloy-juniper/25 bg-alloy-juniper/10 text-alloy-juniper`,
        label: "Done",
    },
    canceled: {
        rowClassName: `${CHIP_BASE} border-admin-border bg-alloy-stone/30 opacity-80`,
        badgeClassName: `${BADGE_BASE} border-alloy-midnight/10 bg-alloy-stone/40 text-alloy-muted`,
        label: "Dismissed",
    },
};

const STYLES_COMPACT: Record<OperationalTaskDueUrgency, LayoutRuntimeTaskChipStyle> = {
    open: {
        rowClassName: `${CHIP_BASE_COMPACT} border-admin-border bg-white hover:border-alloy-juniper/25`,
        badgeClassName: `${BADGE_BASE_COMPACT} border-alloy-juniper/25 bg-alloy-juniper/8 text-alloy-juniper`,
        label: "Open",
    },
    due_soon: {
        rowClassName: `${CHIP_BASE_COMPACT} border-alloy-ember/20 bg-alloy-ember/[0.04] hover:border-alloy-ember/35`,
        badgeClassName: `${BADGE_BASE_COMPACT} border-alloy-ember/25 bg-alloy-ember/10 text-alloy-ember`,
        label: "Due soon",
    },
    overdue: {
        rowClassName: `${CHIP_BASE_COMPACT} border-alloy-ember/30 bg-alloy-ember/[0.06] hover:border-alloy-ember/45`,
        badgeClassName: `${BADGE_BASE_COMPACT} border-alloy-ember/35 bg-alloy-ember/12 text-alloy-ember`,
        label: "Overdue",
    },
    completed: {
        rowClassName: `${CHIP_BASE_COMPACT} border-alloy-juniper/20 bg-alloy-juniper/[0.05]`,
        badgeClassName: `${BADGE_BASE_COMPACT} border-alloy-juniper/25 bg-alloy-juniper/10 text-alloy-juniper`,
        label: "Done",
    },
    canceled: {
        rowClassName: `${CHIP_BASE_COMPACT} border-admin-border bg-alloy-stone/30 opacity-80`,
        badgeClassName: `${BADGE_BASE_COMPACT} border-alloy-midnight/10 bg-alloy-stone/40 text-alloy-muted`,
        label: "Dismissed",
    },
};

export function layoutRuntimeTaskChipStyle(
    task: {
        status: string;
        due_at: string;
    },
    opts?: { compact?: boolean }
): LayoutRuntimeTaskChipStyle {
    const urgency = operationalTaskDueUrgency({
        status: task.status,
        dueAtIso: task.due_at,
    });
    return opts?.compact ? STYLES_COMPACT[urgency] : STYLES[urgency];
}
