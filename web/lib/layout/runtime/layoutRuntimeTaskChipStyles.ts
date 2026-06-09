import { operationalTaskDueUrgency, type OperationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";

export type LayoutRuntimeTaskChipStyle = {
    rowClassName: string;
    badgeClassName: string;
    label: string;
};

const CHIP_BASE =
    "inline-flex w-full max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium leading-snug transition-all hover:shadow-[0_2px_8px_-2px_rgba(24,39,58,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-juniper/25";

const STYLES: Record<OperationalTaskDueUrgency, LayoutRuntimeTaskChipStyle> = {
    open: {
        rowClassName: `${CHIP_BASE} border-admin-border bg-white hover:border-alloy-juniper/25`,
        badgeClassName: "rounded-md border border-alloy-juniper/25 bg-alloy-juniper/8 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-alloy-juniper",
        label: "Open",
    },
    due_soon: {
        rowClassName: `${CHIP_BASE} border-alloy-ember/20 bg-alloy-ember/[0.04] hover:border-alloy-ember/35`,
        badgeClassName: "rounded-md border border-alloy-ember/25 bg-alloy-ember/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-alloy-ember",
        label: "Due soon",
    },
    overdue: {
        rowClassName: `${CHIP_BASE} border-alloy-ember/30 bg-alloy-ember/[0.06] hover:border-alloy-ember/45`,
        badgeClassName: "rounded-md border border-alloy-ember/35 bg-alloy-ember/12 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-alloy-ember",
        label: "Overdue",
    },
    completed: {
        rowClassName: `${CHIP_BASE} border-alloy-juniper/20 bg-alloy-juniper/[0.05]`,
        badgeClassName: "rounded-md border border-alloy-juniper/25 bg-alloy-juniper/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-alloy-juniper",
        label: "Done",
    },
    canceled: {
        rowClassName: `${CHIP_BASE} border-admin-border bg-alloy-stone/30 opacity-80`,
        badgeClassName: "rounded-md border border-alloy-midnight/10 bg-alloy-stone/40 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-alloy-muted",
        label: "Dismissed",
    },
};

export function layoutRuntimeTaskChipStyle(task: {
    status: string;
    due_at: string;
}): LayoutRuntimeTaskChipStyle {
    const urgency = operationalTaskDueUrgency({
        status: task.status,
        dueAtIso: task.due_at,
    });
    return STYLES[urgency];
}
