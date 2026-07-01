"use client";

import { useCallback, useEffect, useState } from "react";

import {
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
    type OpportunityOperationalTasksRefreshDetail,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import { fetchOperationalTasks, patchOperationalTaskStatus, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";

type OperationalTaskRow = {
    id: string;
    title: string;
    due_at: string;
    status: string;
    source: string;
};

function statusBadgeClass(status: string): string {
    const s = status.toLowerCase();
    if (s === "open") return "bg-sky-100/90 text-sky-900/90 border-sky-200/80";
    if (s === "completed") return "bg-emerald-100/85 text-emerald-900/85 border-emerald-200/70";
    if (s === "canceled") return "bg-alloy-stone/15 text-alloy-midnight/70 border-alloy-stone/25";
    return "bg-alloy-stone/10 text-alloy-midnight/75 border-alloy-stone/20";
}

function formatDue(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export type OpportunityOperationalTasksSectionProps = {
    opportunityId: string;
};

/**
 * Lists org-scoped operational tasks for an opportunity (Task Assist + other sources when present).
 */
export default function OpportunityOperationalTasksSection({ opportunityId }: OpportunityOperationalTasksSectionProps) {
    const v11 = isTaskAssistV1UiEnabled();
    const [tasks, setTasks] = useState<OperationalTaskRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!v11 || !opportunityId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchOperationalTasks(opportunityId);
            const json = await readJson<{ ok?: boolean; tasks?: OperationalTaskRow[]; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok || !Array.isArray(json.tasks)) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            setTasks(json.tasks);
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [opportunityId, v11]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const onRefresh = (ev: Event) => {
            const d = (ev as CustomEvent<OpportunityOperationalTasksRefreshDetail>).detail;
            if (!d || d.opportunity_id !== opportunityId) return;
            void load();
        };
        window.addEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh as EventListener);
        return () => window.removeEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh as EventListener);
    }, [load, opportunityId]);

    const onPatch = useCallback(
        async (id: string, status: "completed" | "canceled") => {
            if (!v11) return;
            setActionId(id);
            setError(null);
            try {
                const res = await patchOperationalTaskStatus(id, status);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
                await load();
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setActionId(null);
            }
        },
        [load, v11]
    );

    if (!v11) return null;

    return (
        <div className="min-w-0 space-y-2" data-admin-opportunity-operational-tasks="true">
            {loading && tasks.length === 0 ? <p className="text-xs text-alloy-midnight/60">Loading tasks…</p> : null}
            {error ? (
                <p className="text-xs font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            ) : null}
            {!loading && tasks.length === 0 ? (
                <p className="text-xs text-alloy-midnight/60">No operational tasks yet. Create a reminder from the command bar to track follow-ups here.</p>
            ) : null}
            {tasks.length > 0 ? (
                <ul className="space-y-2">
                    {tasks.map((t) => {
                        const open = t.status === "open";
                        return (
                            <li
                                key={t.id}
                                className="rounded-lg border border-alloy-stone/15 bg-white/[0.97] px-2.5 py-2 text-[12px] shadow-sm ring-1 ring-alloy-stone/[0.06]"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-alloy-midnight/90">{t.title}</div>
                                        <div className="mt-0.5 text-[11px] text-alloy-midnight/65">
                                            Due {formatDue(t.due_at)} · {t.source}
                                        </div>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadgeClass(t.status)}`}
                                    >
                                        {t.status}
                                    </span>
                                </div>
                                {open ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            disabled={actionId === t.id}
                                            className="rounded-md border border-alloy-stone/30 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight/85 hover:bg-alloy-stone/[0.06] disabled:opacity-45"
                                            onClick={() => void onPatch(t.id, "completed")}
                                        >
                                            {actionId === t.id ? "Updating…" : "Complete"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={actionId === t.id}
                                            className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[11px] font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/[0.06] disabled:opacity-45"
                                            onClick={() => void onPatch(t.id, "canceled")}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}
