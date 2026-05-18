"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import OperationalTaskDetailPopover, {
    type OperationalTaskDetail,
} from "@/components/admin/opportunity/OperationalTaskDetailPopover";
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
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import {
    operationalTaskUrgencyBadge,
    scheduledSendStripVisible,
    scheduledSendUrgencyBadge,
} from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";

type OperationalTaskRow = {
    id: string;
    title: string;
    due_at: string;
    status: string;
    source: string;
    description?: string | null;
    created_at?: string;
    created_by?: string;
    entity_id?: string;
    entity_type?: string;
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
    entityLabel?: string | null;
};

export default function OpportunityOperationalCompactStrip({
    opportunityId,
    overviewData = null,
    entityLabel = null,
}: OpportunityOperationalCompactStripProps) {
    const v11 = isTaskAssistV1UiEnabled();
    const adminDrawer = useAdminDrawerOptional();
    const [tasks, setTasks] = useState<OperationalTaskRow[]>([]);
    const [scheduledSends, setScheduledSends] = useState<ScheduledSendRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [popoverTaskId, setPopoverTaskId] = useState<string | null>(null);
    const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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
    const stripSends = useMemo(
        () => scheduledSends.filter((s) => scheduledSendStripVisible(s.status)),
        [scheduledSends]
    );
    const nextFollowUpIso = useMemo(() => parseNextFollowUpAt(overviewData), [overviewData]);
    const showNextFollowUp = useMemo(() => {
        if (!nextFollowUpIso) return false;
        if (openTasks.length > 0) return false;
        const t = Date.parse(nextFollowUpIso);
        return !Number.isNaN(t);
    }, [nextFollowUpIso, openTasks.length]);

    const popoverTask = useMemo(
        () => openTasks.find((t) => t.id === popoverTaskId) ?? null,
        [openTasks, popoverTaskId]
    );

    const popoverDetail: OperationalTaskDetail | null = useMemo(() => {
        if (!popoverTask) return null;
        return {
            id: popoverTask.id,
            title: popoverTask.title,
            description: popoverTask.description ?? null,
            due_at: popoverTask.due_at,
            status: popoverTask.status,
            source: popoverTask.source,
            entity_id: opportunityId,
            entity_type: "opportunities",
            created_at: popoverTask.created_at,
            created_by: popoverTask.created_by,
            entity_label: entityLabel,
        };
    }, [popoverTask, opportunityId, entityLabel]);

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
            if (taskId) setPopoverTaskId(taskId);
        };
        window.addEventListener(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, onFocus as EventListener);
        return () => window.removeEventListener(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, onFocus as EventListener);
    }, [opportunityId]);

    const popoverAnchorRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        popoverAnchorRef.current =
            popoverTaskId ? chipRefs.current.get(popoverTaskId) ?? null : null;
    }, [popoverTaskId, openTasks]);

    useEffect(() => {
        if (!popoverTaskId) return;
        requestAnimationFrame(() => {
            chipRefs.current.get(popoverTaskId)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        });
    }, [popoverTaskId, openTasks]);

    if (!v11) return null;

    const hasChips = openTasks.length > 0 || stripSends.length > 0 || showNextFollowUp;
    if (!hasChips && !loading && !error) return null;

    return (
        <div
            className="relative flex w-full min-w-0 max-w-[min(100%,28rem)] flex-col items-end gap-1"
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
                    const selected = popoverTaskId === t.id;
                    const taskBadge = operationalTaskUrgencyBadge(t);
                    return (
                        <div key={t.id} className="relative">
                            <button
                                type="button"
                                ref={(el) => {
                                    if (el) chipRefs.current.set(t.id, el);
                                    else chipRefs.current.delete(t.id);
                                }}
                                data-operational-task-chip={t.id}
                                data-operational-task-urgency={taskBadge.urgency}
                                onClick={() => setPopoverTaskId((prev) => (prev === t.id ? null : t.id))}
                                className={`${CHIP} cursor-pointer text-left border ${
                                    selected ?
                                        "border-alloy-blue/45 bg-alloy-blue/10 text-alloy-midnight/90 ring-2 ring-alloy-blue/25"
                                    :   `${taskBadge.className} hover:opacity-95`
                                }`}
                            >
                                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide opacity-80">
                                    Task
                                </span>
                                <span className="truncate font-semibold">{t.title}</span>
                                <span
                                    className={`shrink-0 rounded-full border px-1 py-0 text-[8px] font-semibold ${taskBadge.className}`}
                                >
                                    {taskBadge.label}
                                </span>
                                <span className="shrink-0 opacity-75">· {shortWhen(t.due_at)}</span>
                            </button>
                            {selected && popoverDetail ? (
                                <OperationalTaskDetailPopover
                                    task={popoverDetail}
                                    anchorRef={popoverAnchorRef}
                                    onClose={() => setPopoverTaskId(null)}
                                    onUpdated={() => void load()}
                                />
                            ) : null}
                        </div>
                    );
                })}
                {stripSends.map((s) => {
                    const sendBadge = scheduledSendUrgencyBadge(s);
                    return (
                        <span
                            key={s.id}
                            className={`${CHIP} border ${sendBadge.className}`}
                            data-operational-scheduled-send-chip={s.id}
                            data-scheduled-send-urgency={sendBadge.urgency}
                        >
                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide opacity-80">
                                {(s.channel ?? "msg").toUpperCase()}
                            </span>
                            <span className="truncate font-semibold">{sendBadge.label}</span>
                            <span className="shrink-0 opacity-75">· {shortWhen(s.scheduled_for)}</span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
