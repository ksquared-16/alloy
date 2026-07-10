"use client";

import type { KeyboardEventHandler } from "react";
import type { LucideIcon } from "lucide-react";

export type WorkspaceQueueRowUrgency = "open" | "due_soon" | "overdue" | "completed" | "canceled";

export type WorkspaceQueueRowProps = {
    id: string;
    leadingIcon: LucideIcon;
    title: string;
    badge?: string;
    breadcrumb: string;
    snippet?: string;
    dueOrTime?: string;
    assigneeInitials?: string;
    trailingMeta?: string;
    urgency: WorkspaceQueueRowUrgency;
    isWaiting: boolean;
    selected: boolean;
    completed: boolean;
    onSelect: (id: string) => void;
    onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
};

function urgencyAccent(urgency: WorkspaceQueueRowUrgency, selected: boolean): string {
    if (selected) return "border-alloy-juniper/45 border-l-alloy-juniper bg-alloy-juniper/[0.06] ring-1 ring-alloy-juniper/18";
    if (urgency === "overdue") return "border-alloy-stone/20 border-l-red-400/85 bg-white hover:bg-red-50/35";
    if (urgency === "completed" || urgency === "canceled") {
        return "border-alloy-stone/18 border-l-alloy-stone/45 bg-alloy-stone/[0.02] hover:bg-alloy-stone/[0.04]";
    }
    return "border-alloy-stone/18 border-l-alloy-stone/20 bg-white hover:bg-alloy-stone/[0.04]";
}

export default function WorkspaceQueueRow({
    id,
    leadingIcon: LeadingIcon,
    title,
    badge,
    breadcrumb,
    snippet,
    dueOrTime,
    assigneeInitials,
    trailingMeta,
    urgency,
    isWaiting,
    selected,
    completed,
    onSelect,
    onKeyDown,
}: WorkspaceQueueRowProps) {
    return (
        <button
            type="button"
            data-testid="workspace-queue-row"
            data-workspace-queue-row-id={id}
            data-workspace-queue-row-selected={selected ? "true" : "false"}
            data-workspace-queue-row-waiting={isWaiting ? "true" : "false"}
            data-workspace-queue-row-completed={completed ? "true" : "false"}
            aria-pressed={selected}
            onClick={() => onSelect(id)}
            onKeyDown={onKeyDown}
            className={`w-full rounded-lg border border-l-2 px-2.5 py-2 text-left shadow-sm transition-colors ${urgencyAccent(urgency, selected)}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <LeadingIcon className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/40" aria-hidden strokeWidth={2} />
                        <span
                            className={`truncate text-[12.5px] font-semibold ${completed ? "text-alloy-midnight/45 line-through" : "text-alloy-midnight/90"}`}
                        >
                            {title}
                        </span>
                        {isWaiting ? (
                            <span className="shrink-0 rounded-full border border-amber-200/80 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-950">
                                Waiting
                            </span>
                        ) : null}
                        {badge ? (
                            <span className="shrink-0 rounded-full border border-alloy-stone/20 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-alloy-midnight/62">
                                {badge}
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-alloy-midnight/45">{breadcrumb}</p>
                    {snippet ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/58">{snippet}</p> : null}
                </div>
                <div className="ml-2 flex shrink-0 items-start gap-1.5">
                    {assigneeInitials ? (
                        <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-alloy-juniper/10 px-1 text-[9px] font-bold text-alloy-juniper">
                            {assigneeInitials}
                        </span>
                    ) : null}
                    {(dueOrTime || trailingMeta) ? (
                        <div className="text-right text-[10px] leading-tight text-alloy-midnight/45">
                            {dueOrTime ? <p>{dueOrTime}</p> : null}
                            {trailingMeta ? <p className="mt-0.5">{trailingMeta}</p> : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </button>
    );
}
