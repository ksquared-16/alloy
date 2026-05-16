"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS,
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
    type OpportunityFocusOperationalTasksDetail,
    type OpportunityOperationalTasksRefreshDetail,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import {
    fetchCommunicationScheduledSends,
    fetchOperationalTasks,
    patchOperationalTaskStatus,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";

type OperationalTaskRow = {
    id: string;
    title: string;
    due_at: string;
    status: string;
};

type ScheduledSendRow = {
    id: string;
    status: string;
    scheduled_for: string;
    channel?: string;
};

function parseNextFollowUpAt(overviewData: Record<string, unknown> | null | undefined): string | null {
    if (!overviewData) return null;
    const top = overviewData.next_follow_up_at;
    if (typeof top === "string" && top.trim()) return top.trim();
    const md = overviewData.metadata;
    if (md && typeof md === "object") {
        const nested = (md as { next_follow_up_at?: unknown }).next_follow_up_at;
        if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
    return null;
}

function shortWhen(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

const CHIP =
    "inline-flex max-w-[min(100%,18rem)] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-snug transition-colors";

export type OpportunityOperationalCompactStripProps = {
    opportunityId: string;
    overviewData?: Record<string, unknown> | null;
};

/**
 * Lightweight operational status chips beside opportunity header actions (tasks, scheduled sends, record follow-up).
 */
export default function OpportunityOperationalCompactStrip({
    opportunityId,
    overviewData = null,
}: OpportunityOperationalCompactStripProps) {
    const v11 = isTaskAssistV1UiEnabled();
    const [tasks, setTasks] = useState<OperationalTaskRow[]>([]);
    const [scheduledSends, setScheduledSends] = useState<ScheduledSendRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!v11 || !opportunityId) return;
        setLoading(true);
        setError(null);
        try {
            const [taskRes, sendRes] = await Promise.all([
                fetchOperationalTasks(opportunityId),
                fetchCommunicationScheduledSends(opportunityId),
            ]);
            const taskJson = await readJson<{ ok?: boolean; tasks?: OperationalTaskRow[]; error?: string; message?: string }>(
                taskRes
            );
            const sendJson = await readJson<{
                ok?: boolean;
                scheduled_sends?: ScheduledSendRow[];
                error?: string;
                message?: string;
            }>(sendRes);
            if (!taskRes.ok || !taskJson.ok || !Array.isArray(taskJson.tasks)) {
                throw new Error(formatTaskAssistClientError(taskJson.message || taskJson.error, taskJson.error));
            }
            if (!sendRes.ok || !sendJson.ok || !Array.isArray(sendJson.scheduled_sends)) {
                throw new Error(formatTaskAssistClientError(sendJson.message || sendJson.error, sendJson.error));
            }
            setTasks(taskJson.tasks);
            setScheduledSends(sendJson.scheduled_sends);
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
            setTasks([]);
            setScheduledSends([]);
        } finally {
            setLoading(false);
        }
    }, [opportunityId, v11]);

    const openTasks = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
    const pendingSends = useMemo(
        () => scheduledSends.filter((s) => s.status === "pending"),
        [scheduledSends]
    );
    const nextFollowUpIso = useMemo(() => parseNextFollowUpAt(overviewData), [overviewData]);
    const showNextFollowUp = useMemo(() => {
        if (!nextFollowUpIso) return false;
        if (openTasks.length > 0) return false;
        const t = Date.parse(nextFollowUpIso);
        return !Number.isNaN(t);
    }, [nextFollowUpIso, openTasks.length]);

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

    useEffect(() => {
        const onFocus = (ev: Event) => {
            const d = (ev as CustomEvent<OpportunityFocusOperationalTasksDetail>).detail;
            if (!d || d.opportunity_id !== opportunityId) return;
            const taskId = d.task_id?.trim() || null;
            setFocusedTaskId(taskId);
        };
        window.addEventListener(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, onFocus as EventListener);
        return () => window.removeEventListener(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, onFocus as EventListener);
    }, [opportunityId]);

    useEffect(() => {
        if (!focusedTaskId) return;
        requestAnimationFrame(() => {
            document
                .querySelector(`[data-operational-task-chip="${focusedTaskId}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        });
    }, [focusedTaskId, openTasks]);

    const onCompleteTask = useCallback(
        async (id: string) => {
            if (!v11) return;
            setActionId(id);
            setError(null);
            try {
                const res = await patchOperationalTaskStatus(id, "completed");
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
                setFocusedTaskId(null);
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

    const hasChips = openTasks.length > 0 || pendingSends.length > 0 || showNextFollowUp;
    if (!hasChips && !loading && !error) return null;

    return (
        <div
            className="flex w-full min-w-0 max-w-[min(100%,28rem)] flex-col items-end gap-1"
            data-admin-opportunity-operational-strip="true"
        >
            {error ? (
                <p className="text-[10px] font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            ) : null}
            <div className="flex w-full flex-wrap justify-end gap-1">
                {loading && !hasChips ? (
                    <span className="text-[10px] text-alloy-midnight/50">Loading follow-ups…</span>
                ) : null}
                {showNextFollowUp && nextFollowUpIso ? (
                    <span
                        className={`${CHIP} border-alloy-stone/25 bg-alloy-stone/[0.06] text-alloy-midnight/75`}
                        data-operational-next-follow-up="true"
                    >
                        <span className="text-alloy-midnight/50">Next follow-up</span>
                        <span className="truncate">{shortWhen(nextFollowUpIso)}</span>
                    </span>
                ) : null}
                {openTasks.map((t) => {
                    const focused = focusedTaskId === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            data-operational-task-chip={t.id}
                            disabled={actionId === t.id}
                            onClick={() => setFocusedTaskId((prev) => (prev === t.id ? null : t.id))}
                            className={`${CHIP} cursor-pointer text-left ${
                                focused ?
                                    "border-alloy-blue/45 bg-alloy-blue/10 text-alloy-midnight/90 ring-2 ring-alloy-blue/25"
                                :   "border-sky-200/80 bg-sky-50/90 text-sky-950/90 hover:border-sky-300/90"
                            } disabled:opacity-50`}
                        >
                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-sky-800/70">
                                Task
                            </span>
                            <span className="truncate font-semibold">{t.title}</span>
                            <span className="shrink-0 text-sky-900/65">· {shortWhen(t.due_at)}</span>
                        </button>
                    );
                })}
                {pendingSends.map((s) => (
                    <span
                        key={s.id}
                        className={`${CHIP} border-violet-200/75 bg-violet-50/85 text-violet-950/90`}
                        data-operational-scheduled-send-chip={s.id}
                    >
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-violet-800/70">
                            {(s.channel ?? "msg").toUpperCase()}
                        </span>
                        <span className="truncate">Scheduled</span>
                        <span className="shrink-0 text-violet-900/65">· {shortWhen(s.scheduled_for)}</span>
                    </span>
                ))}
            </div>
            {focusedTaskId && openTasks.some((t) => t.id === focusedTaskId) ? (
                <div className="flex flex-wrap justify-end gap-1">
                    <button
                        type="button"
                        disabled={actionId === focusedTaskId}
                        className="rounded-md border border-alloy-stone/30 bg-white px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/85 hover:bg-alloy-stone/[0.06] disabled:opacity-45"
                        onClick={() => void onCompleteTask(focusedTaskId)}
                    >
                        {actionId === focusedTaskId ? "Updating…" : "Mark complete"}
                    </button>
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/55 hover:text-alloy-midnight/80"
                        onClick={() => setFocusedTaskId(null)}
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}
        </div>
    );
}
