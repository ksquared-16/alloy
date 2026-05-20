"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { ListTodo } from "lucide-react";

import {
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import { ADMIN_V2_OPEN_TASKS_MODAL, fetchOperationalTasksSummary, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import { neutral } from "@/styles/tokens/colors";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { isAdminV2OperNavigationActive } from "@/lib/perf/alloyPerfGlobal";

type TaskCounts = { open: number; due_soon: number; overdue: number };

export default function OperationalTasksNavBadge({
    tabStyle,
    onOpenModal,
}: {
    tabStyle: (active: boolean) => CSSProperties;
    onOpenModal: () => void;
}) {
    const enabled = isTaskAssistV1UiEnabled();
    const [counts, setCounts] = useState<TaskCounts | null>(null);

    const load = useCallback(async () => {
        if (!enabled) return;
        if (isAdminV2OperNavigationActive(10_000)) return;
        try {
            const res = await fetchOperationalTasksSummary();
            const json = await readJson<{ ok?: boolean; counts?: TaskCounts }>(res);
            if (res.ok && json.ok && json.counts) {
                setCounts(json.counts);
            }
        } catch {
            /* non-fatal */
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        const cancelDefer = scheduleAdminV2BackgroundWork(() => load(), { idleTimeoutMs: 4000, fallbackMs: 500 });
        const id = window.setInterval(() => void load(), 120_000);
        const onRefresh = () => void load();
        const onOpen = () => onOpenModal();
        window.addEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
        window.addEventListener(ADMIN_V2_OPEN_TASKS_MODAL, onOpen);
        return () => {
            cancelDefer();
            window.clearInterval(id);
            window.removeEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
            window.removeEventListener(ADMIN_V2_OPEN_TASKS_MODAL, onOpen);
        };
    }, [enabled, load, onOpenModal]);

    if (!enabled) return null;

    const alertCount = (counts?.overdue ?? 0) + (counts?.due_soon ?? 0);
    const open = counts?.open ?? 0;
    const title =
        alertCount > 0 ?
            `My tasks — ${alertCount} due soon or overdue (${open} open)`
        :   `My tasks — ${open} open`;

    return (
        <button
            type="button"
            onClick={onOpenModal}
            className="relative inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium leading-none"
            style={tabStyle(false)}
            title={title}
            data-adminv2-operational-tasks-nav="true"
        >
            <ListTodo className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden strokeWidth={2} />
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
