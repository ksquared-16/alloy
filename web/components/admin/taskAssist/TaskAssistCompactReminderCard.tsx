"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import {
    ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS,
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import type { TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { timingHintToDatetimeLocal } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import { detectOperationalAnomalies } from "@/lib/agent/taskAssist/taskAssistOperationalAnomalies";
import { fetchEntityOperationalAnomalyContext } from "@/lib/agent/taskAssist/taskAssistEntityOperationalFetch";
import { buildOperationalTaskBody, createOperationalTask, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import TaskAssistAnomalyWarningCard from "@/components/admin/taskAssist/TaskAssistAnomalyWarningCard";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import { computeReminderSubmitDisabled, minDatetimeLocalValue } from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";
import OperationalProposalCardFrame from "@/app/adminV2/components/bos/OperationalProposalCardFrame";
import { STALE_OPERATIONAL_PROPOSAL_MESSAGE } from "@/lib/adminV2/bos/activeOperationalContext";
import { BosExecutionReceiptFrameReceipt } from "@/app/adminV2/components/bos/BosExecutionReceiptNotice";
import type { BosExecutionReceiptPresentation } from "@/lib/adminV2/bos/bosExecutionReceipt";
import {
    buildTaskAssistFailedReceipt,
    buildTaskAssistReminderCreatedReceipt,
} from "@/lib/adminV2/bos/bosExecutionReceipt";
import {
    TASK_ASSIST_PROPOSAL_SOURCE_LABEL,
    TASK_ASSIST_REMINDER_PROPOSAL_TYPE_LABEL,
    taskAssistReminderMutationBoundaryCopy,
    taskAssistReminderProposalTitle,
} from "@/lib/adminV2/bos/taskAssistOperationalProposalPresentation";
import { COMMAND_SURFACE_INTERACTIVE_CARD_CLASS } from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";

const LABEL = "block text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55";

export type TaskAssistCompactReminderCardProps = {
    entityId: string;
    entityLabel: string;
    locationLabel?: string | null;
    bootstrap: TaskAssistCommandBootstrap;
    bootstrapKey: string;
    mutationsBlocked?: boolean;
    onExecutionReceipt?: (receipt: BosExecutionReceiptPresentation) => void;
};

export default function TaskAssistCompactReminderCard({
    entityId,
    entityLabel,
    locationLabel,
    bootstrap,
    bootstrapKey,
    mutationsBlocked = false,
    onExecutionReceipt,
}: TaskAssistCompactReminderCardProps) {
    const v11 = isTaskAssistV1UiEnabled();
    // Selection is still read from the ONE selection authority — it says who the operator is
    // attending, which decides whether a movement is needed at all. Only the OPEN verb changed.
    const adminDrawer = useAdminDrawerOptional();
    const attendedEntityId =
        adminDrawer?.drawer.type === "opportunities" && adminDrawer.drawer.id != null
            ? String(adminDrawer.drawer.id)
            : null;
    const focusRecord = useOperatorRecordFocus();

    const [title, setTitle] = useState("");
    const [dueLocal, setDueLocal] = useState("");
    const [notes, setNotes] = useState("");
    const [submitLoading, setSubmitLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [executionReceipt, setExecutionReceipt] = useState<BosExecutionReceiptPresentation | null>(null);
    const [lastCreated, setLastCreated] = useState<{ id: string; title: string; due_at: string; status: string } | null>(null);
    const [anomaly, setAnomaly] = useState<ReturnType<typeof detectOperationalAnomalies>>(null);
    const [anomalyAcknowledged, setAnomalyAcknowledged] = useState(false);

    useEffect(() => {
        setTitle(bootstrap.reminder_title?.trim() || "Follow up");
        const due =
            timingHintToDatetimeLocal(bootstrap.reminder_due_hint ?? bootstrap.timing_hint_text ?? null) ??
            "";
        setDueLocal(due);
        setNotes("");
        setError(null);
        setExecutionReceipt(null);
        setLastCreated(null);
        setAnomaly(null);
        setAnomalyAcknowledged(false);
    }, [bootstrapKey, bootstrap.reminder_title, bootstrap.reminder_due_hint, bootstrap.timing_hint_text]);

    const entityScopeLabel = locationLabel?.trim() ? `Site · ${locationLabel.trim()}` : null;

    const reminderDisabled = useMemo(
        () => mutationsBlocked || computeReminderSubmitDisabled(title, dueLocal) || submitLoading,
        [mutationsBlocked, title, dueLocal, submitLoading]
    );

    const onSubmit = useCallback(async () => {
        if (!v11 || reminderDisabled) return;
        setSubmitLoading(true);
        setError(null);
        setExecutionReceipt(null);
        try {
            const dueIso = new Date(dueLocal).toISOString();
            if (!anomalyAcknowledged) {
                const ctx = await fetchEntityOperationalAnomalyContext(entityId);
                const warning = detectOperationalAnomalies({
                    intent: "create_reminder",
                    title,
                    dueAtIso: dueIso,
                    openTasks: ctx.openTasks,
                    pendingScheduledSends: ctx.pendingScheduledSends,
                    openProposals: ctx.openProposals,
                });
                if (warning) {
                    setAnomaly(warning);
                    setSubmitLoading(false);
                    return;
                }
            }
            const body = buildOperationalTaskBody({
                entityId,
                title,
                dueAtIso: dueIso,
                proposalId: null,
                description: notes.trim() || null,
            });
            const res = await createOperationalTask(body);
            const json = await readJson<{
                ok?: boolean;
                task?: { id: string; title: string; due_at: string; status: string };
                error?: string;
                message?: string | null;
            }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            const receipt = buildTaskAssistReminderCreatedReceipt(entityLabel, title);
            setExecutionReceipt(receipt);
            onExecutionReceipt?.(receipt);
            if (json.task) {
                setLastCreated({
                    id: String(json.task.id),
                    title: String(json.task.title),
                    due_at: String(json.task.due_at),
                    status: String(json.task.status),
                });
            } else {
                setLastCreated(null);
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, { detail: { opportunity_id: entityId } })
                );
            }
        } catch (e: unknown) {
            const msg = formatTaskAssistClientError((e as Error).message);
            setError(msg);
            const failReceipt = buildTaskAssistFailedReceipt(entityLabel, msg);
            setExecutionReceipt(failReceipt);
            onExecutionReceipt?.(failReceipt);
        } finally {
            setSubmitLoading(false);
        }
    }, [v11, reminderDisabled, entityId, title, dueLocal, notes, anomalyAcknowledged]);

    const onViewCreated = useCallback(() => {
        if (!lastCreated || typeof window === "undefined") return;
        window.dispatchEvent(
            new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, { detail: { opportunity_id: entityId } })
        );
        // The record may not be the one the operator is attending. Move attention to it first,
        // landing on Current Work — where a task is worked — and only then ask that card to focus
        // the new task. The focus event is fire-and-forget, so it must follow the movement rather
        // than race a surface that has not composed yet.
        const focusTask = () =>
            window.dispatchEvent(
                new CustomEvent(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, {
                    detail: { opportunity_id: entityId, task_id: lastCreated.id },
                })
            );
        if (attendedEntityId === entityId) {
            focusTask();
            return;
        }
        void focusRecord({
            entity_type: "opportunities",
            entity_id: entityId,
            card_focus: { card_key: OPERATOR_FOCUS_CARDS.currentWork },
        }).then((moved) => {
            if (moved) window.setTimeout(focusTask, 120);
            else focusTask();
        });
    }, [attendedEntityId, focusRecord, entityId, lastCreated]);

    if (!v11) return null;

    const receipt =
        lastCreated ?
            <div data-task-assist-compact-reminder-success="true">
                <div className="font-semibold text-alloy-midnight/90">{lastCreated.title}</div>
                <div className="mt-1 text-alloy-midnight/70">
                    Due {new Date(lastCreated.due_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                    <span className="capitalize">{lastCreated.status}</span>
                </div>
                <div className="mt-1 text-alloy-midnight/65">Linked: {entityLabel}</div>
                <button
                    type="button"
                    data-task-assist-compact-reminder-view-task="true"
                    className="mt-2 rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-alloy-midnight"
                    onClick={onViewCreated}
                >
                    View task
                </button>
            </div>
        : executionReceipt ?
            <BosExecutionReceiptFrameReceipt receipt={executionReceipt} />
        :   null;

    return (
        <div data-task-assist-compact-reminder="true">
            <OperationalProposalCardFrame
                proposalTitle={taskAssistReminderProposalTitle(bootstrap)}
                proposalTypeLabel={TASK_ASSIST_REMINDER_PROPOSAL_TYPE_LABEL}
                capabilityKey="task_assist"
                status={lastCreated ? "applied" : "validated"}
                presentationVariant={
                    lastCreated ? "applied"
                    : mutationsBlocked ? undefined
                    : "review_required"
                }
                entityContextLabel={entityLabel}
                scope={entityScopeLabel}
                sourceLabel={TASK_ASSIST_PROPOSAL_SOURCE_LABEL}
                requiresApproval
                mutationBoundaryCopy={taskAssistReminderMutationBoundaryCopy()}
                stale={mutationsBlocked}
                blockedCopy={mutationsBlocked ? STALE_OPERATIONAL_PROPOSAL_MESSAGE : null}
                validationErrors={error ? [error] : null}
                footer={
                    !lastCreated ?
                        <button
                            type="button"
                            data-task-assist-compact-reminder-submit="true"
                            disabled={reminderDisabled}
                            onClick={() => void onSubmit()}
                            className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                        >
                            {submitLoading ? "Creating…" : "Create reminder"}
                        </button>
                    :   null
                }
                receipt={receipt}
                className={COMMAND_SURFACE_INTERACTIVE_CARD_CLASS}
            >
                {anomaly && !anomalyAcknowledged ?
                    <TaskAssistAnomalyWarningCard
                        warning={anomaly}
                        busy={submitLoading}
                        onKeepBoth={() => {
                            setAnomalyAcknowledged(true);
                            setAnomaly(null);
                            void onSubmit();
                        }}
                        onCancel={() => {
                            setAnomaly(null);
                            setAnomalyAcknowledged(false);
                        }}
                    />
                :   null}
                {!lastCreated ?
                    <div className="space-y-2">
                        <div>
                            <label className={LABEL} htmlFor={`ta-crm-title-${entityId}`}>
                                Task title
                            </label>
                            <input
                                id={`ta-crm-title-${entityId}`}
                                type="text"
                                data-task-assist-compact-reminder-title="true"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="mt-0.5 w-full rounded border border-alloy-stone/25 px-2 py-1 text-[12px]"
                            />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor={`ta-crm-due-${entityId}`}>
                                Due
                            </label>
                            <input
                                id={`ta-crm-due-${entityId}`}
                                type="datetime-local"
                                data-task-assist-compact-reminder-due="true"
                                min={minDatetimeLocalValue()}
                                value={dueLocal}
                                onChange={(e) => setDueLocal(e.target.value)}
                                className="mt-0.5 w-full rounded border border-alloy-stone/25 px-2 py-1 text-[12px]"
                            />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor={`ta-crm-notes-${entityId}`}>
                                Notes (optional)
                            </label>
                            <textarea
                                id={`ta-crm-notes-${entityId}`}
                                rows={2}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="mt-0.5 w-full resize-y rounded border border-alloy-stone/25 px-2 py-1 text-[12px]"
                                placeholder="Internal context — not sent to the family."
                            />
                        </div>
                    </div>
                :   null}
            </OperationalProposalCardFrame>
        </div>
    );
}
