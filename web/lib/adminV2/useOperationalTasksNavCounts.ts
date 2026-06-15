"use client";

import { useCallback, useEffect, useState } from "react";

import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";
import {
    readOperationalTasksNavCountsCache,
    writeOperationalTasksNavCountsCache,
} from "@/lib/adminV2/operationalTasksNavCountsCache";
import { fetchOperationalTasksSummary, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { isAdminV2SidecarNetworkBlocked } from "@/lib/perf/adminV2PrimarySurfaceGate";

export type OperationalTasksNavCounts = { open: number; due_soon: number; overdue: number };

export function useOperationalTasksNavCounts(enabled = isOperationalWorkV1Enabled()) {
    const [counts, setCounts] = useState<OperationalTasksNavCounts | null>(() =>
        enabled ? readOperationalTasksNavCountsCache("open") : null,
    );

    const load = useCallback(async () => {
        if (!enabled) return;
        if (isAdminV2SidecarNetworkBlocked()) return;
        try {
            const res = await fetchOperationalTasksSummary();
            const json = await readJson<{ ok?: boolean; counts?: OperationalTasksNavCounts }>(res);
            if (res.ok && json.ok && json.counts) {
                setCounts(json.counts);
                writeOperationalTasksNavCountsCache("open", json.counts);
            }
        } catch {
            /* non-fatal */
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        const cancelDefer = runWhenAdminV2PrimarySurfaceReady(() => load(), "operational_tasks_nav");
        const id = window.setInterval(() => {
            if (!isAdminV2SidecarNetworkBlocked()) void load();
        }, 120_000);
        const onRefresh = () => void load();
        window.addEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
        return () => {
            cancelDefer();
            window.clearInterval(id);
            window.removeEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
        };
    }, [enabled, load]);

    const alertCount = (counts?.overdue ?? 0) + (counts?.due_soon ?? 0);
    const open = counts?.open ?? 0;

    return { counts, alertCount, open, enabled, reload: load };
}
