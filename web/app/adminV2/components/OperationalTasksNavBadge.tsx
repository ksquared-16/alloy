"use client";

import { useEffect, type CSSProperties } from "react";
import { ListTodo } from "lucide-react";

import { ADMIN_V2_OPEN_TASKS_MODAL } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { useOperationalTasksNavCounts } from "@/lib/adminV2/useOperationalTasksNavCounts";
import { neutral } from "@/styles/tokens/colors";

export default function OperationalTasksNavBadge({
    tabStyle,
    buttonClassName,
    onOpenModal,
}: {
    tabStyle: (active: boolean) => CSSProperties;
    buttonClassName?: string;
    onOpenModal: () => void;
}) {
    const { alertCount, open, enabled } = useOperationalTasksNavCounts();

    useEffect(() => {
        if (!enabled) return;
        const onOpen = () => onOpenModal();
        window.addEventListener(ADMIN_V2_OPEN_TASKS_MODAL, onOpen);
        return () => window.removeEventListener(ADMIN_V2_OPEN_TASKS_MODAL, onOpen);
    }, [enabled, onOpenModal]);

    if (!enabled) return null;

    const title =
        alertCount > 0 ?
            `My tasks — ${alertCount} due soon or overdue (${open} open)`
        :   `My tasks — ${open} open`;

    return (
        <button
            type="button"
            onMouseEnter={() => prefetchWorkspaceOperationalTasks("open")}
            onFocus={() => prefetchWorkspaceOperationalTasks("open")}
            onClick={onOpenModal}
            className={
                buttonClassName ??
                "relative inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium leading-none"
            }
            style={tabStyle(false)}
            title={title}
            data-adminv2-operational-tasks-nav="true"
        >
            <ListTodo className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden strokeWidth={2} />
            Tasks
            {alertCount > 0 ? (
                <span
                    className="ml-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-400/95 px-1 text-[9px] font-bold text-alloy-midnight"
                    data-adminv2-operational-tasks-badge="true"
                >
                    {alertCount > 99 ? "99+" : alertCount}
                </span>
            ) : open > 0 ? (
                <span
                    className="ml-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[9px] font-semibold"
                    style={{ backgroundColor: "rgba(255,255,255,0.22)", color: neutral.surface }}
                    data-adminv2-operational-tasks-open-count="true"
                >
                    {open > 99 ? "99+" : open}
                </span>
            ) : null}
        </button>
    );
}
