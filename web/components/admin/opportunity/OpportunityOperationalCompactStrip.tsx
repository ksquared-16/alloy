"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { buildOpportunityOperationalContext } from "@/lib/adminV2/bos/activeOperationalContext";
import { buildBosAssistHandoffPackage } from "@/lib/adminV2/bos/bosAssistHandoffRouting";
import {
    buildOperationalRecommendationHandoffCopy,
    hasStructuredOperationalHandoff,
    type OperationalRecommendationHandoffCopy,
} from "@/lib/adminV2/bos/operationalRecommendationHandoff";
import { opLabelCaps, opMetadata } from "@/lib/operational/ui/operationalVisualTokens";
import clsx from "clsx";
import OperationalTaskDetailPopover, {
    type OperationalTaskDetail,
} from "@/components/admin/opportunity/OperationalTaskDetailPopover";
import ScheduledSendDetailPopover, {
    type ScheduledSendDetail,
} from "@/components/admin/opportunity/ScheduledSendDetailPopover";
import { scheduledSendAttentionCounts } from "@/lib/agent/taskAssist/taskAssistScheduledSendPresentation";
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
import {
    operationalStripShowEmptyState,
    type OpportunityOperationalStripLayout,
} from "@/lib/admin/drawer/opportunityOperationalStripPresentation";
import type { DrawerInquirySummaryRightColumnRenderModel } from "@/lib/adminV2/drawerPipeline/types";
import {
    INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS,
    INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS,
    INQUIRY_RIGHT_COLUMN_HANDOFF_CARD_INNER_CLASS,
    INQUIRY_RIGHT_COLUMN_HANDOFF_SLOT_CLASS,
    INQUIRY_RIGHT_COLUMN_REMINDERS_BODY_CLASS,
    INQUIRY_RIGHT_COLUMN_REMINDERS_SECTION_CLASS,
} from "@/lib/admin/drawer/opportunityInquiryRightColumnGeometry";

function HandoffRowLabel({ children }: { children: ReactNode }) {
    return <span className={clsx(opLabelCaps, "text-[9px]")}>{children}</span>;
}

function OrchestratorHandoffCard(props: {
    entityLabel?: string | null;
    layout: OpportunityOperationalStripLayout;
    handoffCopy: OperationalRecommendationHandoffCopy | null;
    showStructuredCopy: boolean;
    onContinue: () => void;
    /** Inquiry summary atomic column: outer slot owns fixed height + separator. */
    embeddedInRightColumnSlot?: boolean;
    continueDisabled?: boolean;
}) {
    const {
        entityLabel,
        layout,
        handoffCopy,
        showStructuredCopy,
        onContinue,
        embeddedInRightColumnSlot = false,
        continueDisabled = false,
    } = props;
    const recordHint = entityLabel?.trim() ? entityLabel.trim() : "this inquiry";

    const outerClass =
        embeddedInRightColumnSlot ?
            "flex h-full min-h-0 flex-col"
        : layout === "inquiry_summary" ?
            "mt-2 border-t border-alloy-stone/10 pt-2"
        :   "mt-2 w-full max-w-[min(100%,28rem)] border-t border-alloy-stone/10 pt-2";

    return (
        <div
            className={outerClass}
            data-drawer-slot="operational_orchestrator_handoff"
            data-operational-orchestrator-handoff-card="true"
        >
            <div className={embeddedInRightColumnSlot ? INQUIRY_RIGHT_COLUMN_HANDOFF_CARD_INNER_CLASS : "rounded-lg border border-alloy-blue/22 bg-gradient-to-br from-alloy-blue/[0.06] via-white to-alloy-stone/[0.03] px-2.5 py-2 shadow-[0_1px_0_rgba(39,63,82,0.04)]"}>
                <p
                    className="text-[9px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/45"
                    data-operational-orchestrator-handoff-eyebrow="true"
                >
                    {handoffCopy?.eyebrow ?? "Review assist"}
                </p>
                {showStructuredCopy && handoffCopy ? (
                    <div className="mt-1 space-y-1" data-operational-orchestrator-handoff-body="structured">
                        <div data-handoff-row="operational_read">
                            <HandoffRowLabel>Operational read</HandoffRowLabel>
                            <p className="mt-0.5 text-[10px] font-medium leading-snug text-alloy-midnight/88">
                                {handoffCopy.operationalRead}
                            </p>
                        </div>
                        <div data-handoff-row="why_now">
                            <HandoffRowLabel>Why now</HandoffRowLabel>
                            <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/75">{handoffCopy.whyNow}</p>
                        </div>
                        <div data-handoff-row="do_next">
                            <HandoffRowLabel>Do next</HandoffRowLabel>
                            <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/80">{handoffCopy.doNext}</p>
                        </div>
                        {handoffCopy.likelyOutcome?.trim() ? (
                            <div data-handoff-row="likely_outcome" className="text-alloy-midnight/55">
                                <HandoffRowLabel>Likely</HandoffRowLabel>
                                <p className={clsx("mt-0.5", opMetadata)}>{handoffCopy.likelyOutcome.trim()}</p>
                            </div>
                        ) : null}
                        <p className={opMetadata}>
                            <span className="font-medium text-alloy-midnight/70">Supporting context · </span>
                            {handoffCopy.supportingContext ?? handoffCopy.contextLine}
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="mt-1 text-[10px] leading-snug text-alloy-midnight/70">
                            <span className="font-medium text-alloy-midnight/85">Active record · </span>
                            {recordHint}
                        </p>
                        <p className="mt-1 text-[9px] leading-snug text-alloy-midnight/55">
                            Uses this active record in the Orchestrator. Review before anything sends.
                        </p>
                    </>
                )}
                <div className="mt-2 flex justify-end">
                    <button
                        type="button"
                        data-operational-orchestrator-handoff="true"
                        disabled={continueDisabled}
                        aria-disabled={continueDisabled || undefined}
                        className="inline-flex items-center gap-1.5 rounded-md border border-alloy-blue/35 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-alloy-blue shadow-sm transition-colors hover:border-alloy-blue/50 hover:bg-alloy-blue/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-blue/30 disabled:cursor-default disabled:opacity-70"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (continueDisabled) return;
                            onContinue();
                        }}
                    >
                        Continue in Orchestrator
                        <ArrowRight className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2.25} aria-hidden />
                    </button>
                </div>
            </div>
        </div>
    );
}

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
    body_snapshot?: string;
    subject_snapshot?: string | null;
    recipient_person_id?: string;
    metadata?: Record<string, unknown> | null;
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
    /** `inquiry_summary`: grouped Tasks / Reminders under inquiry summary column. */
    layout?: OpportunityOperationalStripLayout;
    /** When false, defers task-assist operational fetches until summary column is visible. */
    fetchEnabled?: boolean;
    /** Inquiry summary: no fetch until operator expands — avoids late pop-in / resize. */
    tasksLoadMode?: "auto" | "on_demand";
    /** When true, tasks render from shell preview; strip loads reminders/sends only. */
    hideTasksSection?: boolean;
    /** Pipeline-owned right-column structure (reminders + handoff slots). */
    rightColumnModel?: DrawerInquirySummaryRightColumnRenderModel;
};

function ReminderRowSkeleton() {
    return (
        <span
            className="inline-flex h-[1.75rem] min-w-[8rem] max-w-[16rem] flex-1 items-center rounded-full skeleton-pulse bg-alloy-stone/10 px-2 py-1"
            aria-hidden
            data-reminders-row-skeleton="true"
        />
    );
}

export default function OpportunityOperationalCompactStrip({
    opportunityId,
    overviewData = null,
    entityLabel = null,
    layout = "header_chips",
    fetchEnabled = true,
    tasksLoadMode = "auto",
    hideTasksSection = false,
    rightColumnModel,
}: OpportunityOperationalCompactStripProps) {
    const v11 = isTaskAssistV1UiEnabled();
    const onDemandTasks = tasksLoadMode === "on_demand";
    const [tasksExpanded, setTasksExpanded] = useState(false);
    const adminDrawer = useAdminDrawerOptional();
    const globalAssistant = useGlobalAssistantOptional();
    const [tasks, setTasks] = useState<OperationalTaskRow[]>([]);
    const [scheduledSends, setScheduledSends] = useState<ScheduledSendRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [popoverTaskId, setPopoverTaskId] = useState<string | null>(null);
    const [popoverSendId, setPopoverSendId] = useState<string | null>(null);
    const taskChipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const sendChipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    const load = useCallback(async () => {
        if (!fetchEnabled || !v11 || !opportunityId) return;
        if (onDemandTasks && !tasksExpanded) return;
        setLoading(true);
        setError(null);
        try {
            const [taskRes, sendRes] = await Promise.all([
                hideTasksSection ?
                    Promise.resolve(
                        new Response(JSON.stringify({ ok: true, tasks: [] }), { status: 200 })
                    )
                :   fetchOperationalTasks(opportunityId),
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
    }, [fetchEnabled, hideTasksSection, onDemandTasks, opportunityId, tasksExpanded, v11]);

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

    const sendAttention = useMemo(() => scheduledSendAttentionCounts(stripSends), [stripSends]);

    const popoverSend = useMemo(
        () => stripSends.find((s) => s.id === popoverSendId) ?? null,
        [stripSends, popoverSendId]
    );

    const popoverSendDetail: ScheduledSendDetail | null = useMemo(() => {
        if (!popoverSend) return null;
        const ch = popoverSend.channel === "email" ? "email" : "sms";
        return {
            id: popoverSend.id,
            channel: ch,
            status: popoverSend.status,
            scheduled_for: popoverSend.scheduled_for,
            body_snapshot: popoverSend.body_snapshot?.trim() || "(empty)",
            subject_snapshot: popoverSend.subject_snapshot ?? null,
            recipient_person_id: popoverSend.recipient_person_id?.trim() || "—",
            entity_id: opportunityId,
            entity_label: entityLabel,
            metadata: popoverSend.metadata ?? null,
        };
    }, [popoverSend, opportunityId, entityLabel]);

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
        if (!fetchEnabled) {
            setTasks([]);
            setScheduledSends([]);
            setLoading(false);
            setError(null);
            return;
        }
        void load();
    }, [fetchEnabled, load]);

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

    const taskPopoverAnchorRef = useRef<HTMLButtonElement | null>(null);
    const [sendPopoverAnchorEl, setSendPopoverAnchorEl] = useState<HTMLButtonElement | null>(null);

    useEffect(() => {
        taskPopoverAnchorRef.current =
            popoverTaskId ? taskChipRefs.current.get(popoverTaskId) ?? null : null;
    }, [popoverTaskId, openTasks]);

    useEffect(() => {
        if (!popoverSendId) setSendPopoverAnchorEl(null);
    }, [popoverSendId]);

    useEffect(() => {
        if (!popoverTaskId) return;
        requestAnimationFrame(() => {
            taskChipRefs.current.get(popoverTaskId)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        });
    }, [popoverTaskId, openTasks]);

    const handoffCopy = useMemo(
        () =>
            buildOperationalRecommendationHandoffCopy({
                entityLabel,
                overviewData,
            }),
        [entityLabel, overviewData]
    );

    const showStructuredHandoffCopy = useMemo(
        () => hasStructuredOperationalHandoff(overviewData),
        [overviewData]
    );

    const onContinueInOrchestrator = useCallback(() => {
        if (!globalAssistant || !opportunityId) return;
        globalAssistant.setAssistantContext(
            buildOpportunityOperationalContext({
                entityId: opportunityId,
                overviewData,
                queuePreviewSeed: null,
                opportunitySingular: "Opportunity",
                sourceSurface: "opportunity_drawer",
            })
        );
        const handoff = buildBosAssistHandoffPackage({
            entityLabel,
            overviewData,
        });
        globalAssistant.focusCommandBar({
            expandThread: true,
            seedCommand: handoff.seedCommand,
            preferMode: "task_assist",
            autoSubmitSeedCommand: true,
            taskAssistHandoffIntent: handoff.taskAssistIntent,
            taskAssistHandoffBootstrap: handoff.taskAssistBootstrap,
        });
    }, [globalAssistant, opportunityId, entityLabel, overviewData]);

    if (!v11) return null;

    const inquirySummary = layout === "inquiry_summary";
    const atomicRightColumn = inquirySummary && hideTasksSection && rightColumnModel != null;

    if (inquirySummary && hideTasksSection && !atomicRightColumn) {
        /* Legacy path without pipeline right_column model. */
    } else if (inquirySummary && onDemandTasks && !tasksExpanded && !atomicRightColumn) {
        const nextFollowUpIso = parseNextFollowUpAt(overviewData);
        return (
            <div
                className="mt-2 min-h-[2.75rem] border-t border-alloy-stone/10 pt-2"
                data-drawer-slot="operational_tasks_collapsed"
            >
                <button
                    type="button"
                    className="text-[10px] font-semibold text-alloy-blue hover:underline"
                    onClick={() => setTasksExpanded(true)}
                >
                    Tasks & reminders
                    {nextFollowUpIso ? ` · follow-up ${shortWhen(nextFollowUpIso)}` : ""}
                </button>
            </div>
        );
    }
    const hasChips = openTasks.length > 0 || stripSends.length > 0 || showNextFollowUp;
    const showEmpty = operationalStripShowEmptyState({
        loading,
        openTaskCount: openTasks.length,
        stripSendCount: stripSends.length,
        showNextFollowUp,
        hasError: Boolean(error),
    });
    if (!inquirySummary && !hasChips && !loading && !error) return null;

    const chipRowClass = inquirySummary ? "flex w-full flex-wrap gap-1" : "flex w-full flex-wrap justify-end gap-1";
    const hasReminderValues = stripSends.length > 0 || showNextFollowUp;
    const remindersFetchSettled = !loading || hasReminderValues || Boolean(error);
    const showRemindersSection =
        atomicRightColumn ?
            rightColumnModel.reminders.visible
        :   hasReminderValues;
    /** Orchestrator entry lives on record header actions (refinement pass). */
    const showHandoffCard = false;

    const renderTaskChips = () =>
        openTasks.map((t) => {
            const selected = popoverTaskId === t.id;
            const taskBadge = operationalTaskUrgencyBadge(t);
            return (
                <div key={t.id} className="relative">
                    <button
                        type="button"
                        ref={(el) => {
                            if (el) taskChipRefs.current.set(t.id, el);
                            else taskChipRefs.current.delete(t.id);
                        }}
                        data-operational-task-chip={t.id}
                        data-operational-task-urgency={taskBadge.urgency}
                        onClick={(e) => {
                            e.stopPropagation();
                            setPopoverSendId(null);
                            setSendPopoverAnchorEl(null);
                            setPopoverTaskId((prev) => (prev === t.id ? null : t.id));
                        }}
                        className={`${CHIP} cursor-pointer text-left border ${selected ?
                                "border-alloy-blue/45 bg-alloy-blue/10 text-alloy-midnight/90 ring-2 ring-alloy-blue/25"
                                : `${taskBadge.className} hover:opacity-95`
                            }`}
                    >
                        {!inquirySummary ? (
                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide opacity-80">
                                Task
                            </span>
                        ) : null}
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
                            anchorRef={taskPopoverAnchorRef}
                            onClose={() => setPopoverTaskId(null)}
                            onUpdated={() => void load()}
                        />
                    ) : null}
                </div>
            );
        });

    const renderReminderChips = () => (
        <>
            {showNextFollowUp && nextFollowUpIso ? (
                <span
                    className={`${CHIP} border-alloy-stone/25 bg-alloy-stone/[0.06] text-alloy-midnight/75`}
                    data-operational-next-follow-up="true"
                >
                    <span className="text-alloy-midnight/50">Next follow-up</span>
                    <span className="truncate">{shortWhen(nextFollowUpIso)}</span>
                </span>
            ) : null}
            {stripSends.map((s) => {
                const sendBadge = scheduledSendUrgencyBadge(s);
                const selected = popoverSendId === s.id;
                return (
                    <div key={s.id} className="relative">
                        <button
                            type="button"
                            ref={(el) => {
                                if (el) sendChipRefs.current.set(s.id, el);
                                else sendChipRefs.current.delete(s.id);
                            }}
                            data-operational-scheduled-send-chip={s.id}
                            data-scheduled-send-urgency={sendBadge.urgency}
                            onClick={(e) => {
                                e.stopPropagation();
                                setPopoverTaskId(null);
                                const nextId = popoverSendId === s.id ? null : s.id;
                                setSendPopoverAnchorEl(nextId ? (e.currentTarget as HTMLButtonElement) : null);
                                setPopoverSendId(nextId);
                            }}
                            className={`${CHIP} cursor-pointer text-left border ${selected ?
                                    "border-alloy-blue/45 bg-alloy-blue/10 text-alloy-midnight/90 ring-2 ring-alloy-blue/25"
                                    : `${sendBadge.className} hover:opacity-95`
                                }`}
                        >
                            {!inquirySummary ? (
                                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide opacity-80">
                                    {(s.channel ?? "msg").toUpperCase()}
                                </span>
                            ) : null}
                            <span className="truncate font-semibold">{sendBadge.label}</span>
                            <span className="shrink-0 opacity-75">· {shortWhen(s.scheduled_for)}</span>
                        </button>
                        {selected && popoverSendDetail ? (
                            <ScheduledSendDetailPopover
                                send={popoverSendDetail}
                                anchorEl={sendPopoverAnchorEl}
                                onClose={() => {
                                    setPopoverSendId(null);
                                    setSendPopoverAnchorEl(null);
                                }}
                                onUpdated={() => void load()}
                            />
                        ) : null}
                    </div>
                );
            })}
        </>
    );

    return (
        <div
            className={
                inquirySummary ?
                    "relative flex w-full min-w-0 flex-col gap-2"
                    : "relative flex w-full min-w-0 max-w-[min(100%,28rem)] flex-col items-end gap-1"
            }
            data-admin-opportunity-operational-strip="true"
            data-operational-strip-layout={layout}
        >
            {error ? (
                <p className="text-[10px] font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            ) : null}
            {!atomicRightColumn &&
            (sendAttention.failed > 0 || sendAttention.needs_attention > 0) ? (
                <p
                    className="pointer-events-none w-full rounded border border-amber-200/70 bg-amber-50/90 px-2 py-1 text-[10px] leading-snug text-amber-950/90"
                    data-scheduled-send-attention-banner="true"
                >
                    {sendAttention.failed > 0 ?
                        `${sendAttention.failed} scheduled message${sendAttention.failed === 1 ? "" : "s"} failed delivery.`
                        : null}
                    {sendAttention.failed > 0 && sendAttention.needs_attention > 0 ? " " : null}
                    {sendAttention.needs_attention > 0 ?
                        `${sendAttention.needs_attention} scheduled message${sendAttention.needs_attention === 1 ? "" : "s"} not processed.`
                        : null}{" "}
                    Open a chip to edit, cancel, or process.
                </p>
            ) : null}
            {inquirySummary ? (
                <>
                    {loading && !hasChips && !atomicRightColumn ? (
                        <p className="text-[11px] text-alloy-midnight/50">Loading tasks and reminders…</p>
                    ) : null}
                    {!hideTasksSection && openTasks.length > 0 ? (
                        <div data-operational-strip-group="tasks">
                            <div className={INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS}>Tasks</div>
                            <div className={`mt-1 ${chipRowClass}`}>{renderTaskChips()}</div>
                        </div>
                    ) : null}
                    {showRemindersSection ? (
                        <div
                            className={
                                atomicRightColumn ?
                                    INQUIRY_RIGHT_COLUMN_REMINDERS_SECTION_CLASS
                                :   "min-h-[3.25rem]"
                            }
                            data-operational-strip-group="reminders"
                            data-right-column-slot="reminders"
                        >
                            <div className={INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS}>Reminders</div>
                            <div
                                className={
                                    atomicRightColumn ?
                                        `mt-1 ${INQUIRY_RIGHT_COLUMN_REMINDERS_BODY_CLASS}`
                                    :   `mt-1 min-h-[1.75rem] ${chipRowClass}`
                                }
                            >
                                {atomicRightColumn && !remindersFetchSettled ? (
                                    <ReminderRowSkeleton />
                                ) : hasReminderValues ? (
                                    renderReminderChips()
                                ) : atomicRightColumn || hideTasksSection ? (
                                    <span
                                        className={INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS}
                                        data-reminders-empty="true"
                                    >
                                        No scheduled reminders
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                    {showEmpty && !hideTasksSection ? (
                        <p className="text-[11px] text-alloy-midnight/50" data-operational-strip-empty="true">
                            No active tasks or reminders.
                        </p>
                    ) : null}
                </>
            ) : (
                <div className={chipRowClass}>
                    {loading && !hasChips ? (
                        <span className="text-[10px] text-alloy-midnight/50">Loading follow-ups…</span>
                    ) : null}
                    {renderReminderChips()}
                    {renderTaskChips()}
                </div>
            )}
            {atomicRightColumn && rightColumnModel.orchestrator_handoff.visible ? (
                <div
                    className={INQUIRY_RIGHT_COLUMN_HANDOFF_SLOT_CLASS}
                    data-right-column-slot="orchestrator_handoff"
                >
                    <OrchestratorHandoffCard
                        entityLabel={entityLabel}
                        layout={layout}
                        handoffCopy={handoffCopy}
                        showStructuredCopy={showStructuredHandoffCopy}
                        embeddedInRightColumnSlot
                        continueDisabled={!globalAssistant}
                        onContinue={onContinueInOrchestrator}
                    />
                </div>
            ) : globalAssistant && showHandoffCard ? (
                <OrchestratorHandoffCard
                    entityLabel={entityLabel}
                    layout={layout}
                    handoffCopy={handoffCopy}
                    showStructuredCopy={showStructuredHandoffCopy}
                    onContinue={onContinueInOrchestrator}
                />
            ) : null}
        </div>
    );
}
