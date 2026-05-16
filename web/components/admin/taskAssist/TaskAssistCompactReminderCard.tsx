"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
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

const LABEL = "block text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55";

export type TaskAssistCompactReminderCardProps = {
    entityId: string;
    entityLabel: string;
    locationLabel?: string | null;
    bootstrap: TaskAssistCommandBootstrap;
    bootstrapKey: string;
};

export default function TaskAssistCompactReminderCard({
    entityId,
    entityLabel,
    locationLabel,
    bootstrap,
    bootstrapKey,
}: TaskAssistCompactReminderCardProps) {
    const v11 = isTaskAssistV1UiEnabled();
    const adminDrawer = useAdminDrawerOptional();

    const [title, setTitle] = useState("");
    const [dueLocal, setDueLocal] = useState("");
    const [notes, setNotes] = useState("");
    const [submitLoading, setSubmitLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
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
        setSuccess(null);
        setLastCreated(null);
        setAnomaly(null);
        setAnomalyAcknowledged(false);
    }, [bootstrapKey, bootstrap.reminder_title, bootstrap.reminder_due_hint, bootstrap.timing_hint_text]);

    const targetSummary = useMemo(() => {
        const loc = locationLabel?.trim();
        return loc ? `${entityLabel} · ${loc}` : entityLabel;
    }, [entityLabel, locationLabel]);

    const reminderDisabled = useMemo(
        () => computeReminderSubmitDisabled(title, dueLocal) || submitLoading,
        [title, dueLocal, submitLoading]
    );

    const onSubmit = useCallback(async () => {
        if (!v11 || reminderDisabled) return;
        setSubmitLoading(true);
        setError(null);
        setSuccess(null);
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
            setSuccess("Reminder created.");
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
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setSubmitLoading(false);
        }
    }, [v11, reminderDisabled, entityId, title, dueLocal, notes, anomalyAcknowledged]);

    const onViewCreated = useCallback(() => {
        if (!lastCreated || typeof window === "undefined") return;
        window.dispatchEvent(
            new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, { detail: { opportunity_id: entityId } })
        );
        const needsOpen = !adminDrawer || adminDrawer.drawer.type !== "opportunities" || adminDrawer.drawer.id !== entityId;
        if (needsOpen && adminDrawer) {
            adminDrawer.openDrawer({ type: "opportunities", id: entityId, opportunityWorkspaceContext: null });
            window.setTimeout(() => {
                window.dispatchEvent(
                    new CustomEvent(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, {
                        detail: { opportunity_id: entityId, task_id: lastCreated.id },
                    })
                );
            }, 120);
        } else {
            window.dispatchEvent(
                new CustomEvent(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, {
                    detail: { opportunity_id: entityId, task_id: lastCreated.id },
                })
            );
        }
    }, [adminDrawer, entityId, lastCreated]);

    if (!v11) return null;

    return (
        <div className="space-y-2" data-task-assist-compact-reminder="true">
            <p className="text-[10px] text-alloy-midnight/60">{targetSummary}</p>
            <p className="text-[11px] font-semibold text-alloy-midnight/85">Reminder / follow-up task</p>
            {anomaly && !anomalyAcknowledged ? (
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
            ) : null}
            {success ? (
                <p className="text-[11px] font-medium text-emerald-800/90" data-task-assist-compact-reminder-success="true">
                    {success}
                </p>
            ) : null}
            {lastCreated ? (
                <div className="rounded-lg border border-emerald-200/70 bg-white/90 px-2.5 py-2 text-[11px] shadow-sm">
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
            ) : null}
            {error ? (
                <p className="text-[11px] font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            ) : null}
            {!lastCreated ? (
                <div className="space-y-2 rounded-md border border-alloy-stone/15 bg-white/80 p-2">
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
                    <button
                        type="button"
                        data-task-assist-compact-reminder-submit="true"
                        disabled={reminderDisabled}
                        onClick={() => void onSubmit()}
                        className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                    >
                        {submitLoading ? "Creating…" : "Create reminder"}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
