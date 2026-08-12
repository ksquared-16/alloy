"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { GlobalAssistantSourceSurface } from "@/contexts/GlobalAssistantContext";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import {
    ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS,
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import {
    buildTaskAssistApplyRequestBody,
    buildTaskAssistProposeRequestBody,
    mergeForSendApplyPreview,
    recipientHasChannelHint,
} from "@/lib/agent/taskAssist/taskAssistV1ClientPayloads";
import {
    buildOperationalTaskBody,
    buildScheduleSendBody,
    cancelCommunicationScheduledSend,
    createCommunicationScheduledSend,
    createOperationalTask,
    fetchCommunicationScheduledSends,
    fetchOperationalTasks,
    fetchTaskAssistProposals,
    patchOperationalTaskStatus,
    persistTaskAssistProposal,
    postTaskAssistProposalApprove,
    postTaskAssistProposalReject,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import {
    MUTATION_BOUNDARY_APPLIES_THROUGH_COMMS,
    MUTATION_BOUNDARY_TASK_ASSIST_DRAFT_SAVE,
} from "@/lib/adminV2/bos/bosMutationBoundaryCopy";
import type { TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { timingHintToDatetimeLocal } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import { validateTaskAssistSuggestionV1ForSendApply } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";

export type TaskAssistOpportunityWorkspaceProps = {
    entityId: string;
    /** When false, skip network calls (parent scopes panel visibility). @default true */
    active?: boolean;
    className?: string;
    /** Provenance for operator context; propose route still uses server defaults today. */
    source_surface?: GlobalAssistantSourceSurface | "opportunity_drawer";
    /** Card 9c — prefills from command bar after target confirm (does not auto-propose or send). */
    command_bootstrap?: TaskAssistCommandBootstrap | null;
    /** Bumps when a new bootstrap should apply (e.g. entity id + timestamp). */
    command_bootstrap_key?: string | null;
    /** Command bar compact flow — hides heavy V1.1 list chrome until operator expands more options. */
    command_bar_surface?: "compact" | "full";
    show_v11_lists?: boolean;
    /** Display label for success / navigation (command bar). */
    entity_display_label?: string | null;
};

function listText(lines: string[]): ReactNode {
    if (!lines.length) return null;
    return (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-alloy-midnight/75">
            {lines.map((t, i) => (
                <li key={i}>{t}</li>
            ))}
        </ul>
    );
}

export function computeTaskAssistSendDisabled(params: {
    proposal: TaskAssistSuggestionV1 | null;
    proposalValid: boolean;
    proposeLoading: boolean;
    applyLoading: boolean;
    selectedPersonId: string | null;
    finalBody: string;
    finalSubject: string;
    channel: "sms" | "email";
}): boolean {
    const bodyOk = params.finalBody.trim().length > 0;
    const subOk = params.channel === "sms" || params.finalSubject.trim().length > 0;
    if (params.proposeLoading || params.applyLoading) return true;
    if (!params.proposal || !params.proposalValid) return true;
    if (!params.selectedPersonId || !bodyOk || !subOk) return true;
    if (!recipientHasChannelHint(params.proposal.recipient_candidates, params.selectedPersonId, params.channel)) return true;
    const merged = mergeForSendApplyPreview(
        params.proposal,
        params.selectedPersonId,
        params.finalBody,
        params.finalSubject,
        params.channel
    );
    return validateTaskAssistSuggestionV1ForSendApply(merged).length > 0;
}

/** Same gates as send for body/recipient; requires a future `datetime-local` value. */
export function computeScheduleSendDisabled(params: {
    proposalValid: boolean;
    selectedPersonId: string | null;
    finalBody: string;
    finalSubject: string;
    channel: "sms" | "email";
    scheduledForLocal: string;
}): boolean {
    if (!params.proposalValid || !params.selectedPersonId) return true;
    if (!params.finalBody.trim()) return true;
    if (params.channel === "email" && !params.finalSubject.trim()) return true;
    const t = Date.parse(params.scheduledForLocal);
    if (!params.scheduledForLocal.trim() || Number.isNaN(t)) return true;
    if (t <= Date.now()) return true;
    return false;
}

export function computeReminderSubmitDisabled(title: string, dueAtLocal: string): boolean {
    if (!title.trim()) return true;
    const t = Date.parse(dueAtLocal);
    if (!dueAtLocal.trim() || Number.isNaN(t)) return true;
    if (t <= Date.now()) return true;
    return false;
}

export function minDatetimeLocalValue(): string {
    const d = new Date(Date.now() + 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const COMPACT_LABEL = "block text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55";

type TaskAssistProposalRow = {
    id: string;
    status: string;
    payload: TaskAssistSuggestionV1;
    created_at?: string;
    expires_at?: string | null;
};

type CommunicationScheduledSendRow = {
    id: string;
    status: string;
    scheduled_for: string;
    channel?: string;
    body_snapshot?: string;
};

type OperationalTaskRow = {
    id: string;
    status: string;
    title: string;
    due_at: string;
};

/**
 * Task Assist V1 + V1.1 — opportunity workspace (global assistant shell). Parent should gate with {@link isTaskAssistV1UiEnabled}.
 */
export default function TaskAssistOpportunityWorkspace({
    entityId,
    active = true,
    className = "",
    source_surface = "global_shell",
    command_bootstrap = null,
    command_bootstrap_key = null,
    command_bar_surface = "full",
    show_v11_lists = true,
    entity_display_label = null,
}: TaskAssistOpportunityWorkspaceProps) {
    const v11 = isTaskAssistV1UiEnabled();
    // Selection is still read from the ONE selection authority — it says who the operator is
    // attending, which decides whether a movement is needed at all. Only the OPEN verb changed.
    const adminDrawer = useAdminDrawerOptional();
    const attendedEntityId =
        adminDrawer?.drawer.type === "opportunities" && adminDrawer.drawer.id != null
            ? String(adminDrawer.drawer.id)
            : null;
    const focusRecord = useOperatorRecordFocus();

    const [channel, setChannel] = useState<"sms" | "email">("sms");
    const [instruction, setInstruction] = useState("");
    const [proposal, setProposal] = useState<TaskAssistSuggestionV1 | null>(null);
    const [proposalValid, setProposalValid] = useState(false);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    const [finalBody, setFinalBody] = useState("");
    const [finalSubject, setFinalSubject] = useState("");
    const [proposeLoading, setProposeLoading] = useState(false);
    const [applyLoading, setApplyLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [proposals, setProposals] = useState<TaskAssistProposalRow[]>([]);
    const [scheduledSends, setScheduledSends] = useState<CommunicationScheduledSendRow[]>([]);
    const [opTasks, setOpTasks] = useState<OperationalTaskRow[]>([]);
    const [listsLoading, setListsLoading] = useState(false);
    const [saveDraftLoading, setSaveDraftLoading] = useState(false);
    const [proposalActionId, setProposalActionId] = useState<string | null>(null);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [scheduledForLocal, setScheduledForLocal] = useState("");
    const [scheduleProposalId, setScheduleProposalId] = useState<string>("");
    const [scheduleSubmitLoading, setScheduleSubmitLoading] = useState(false);
    const [cancelSendId, setCancelSendId] = useState<string | null>(null);
    const [reminderTitle, setReminderTitle] = useState("");
    const [reminderDueLocal, setReminderDueLocal] = useState("");
    const [reminderProposalId, setReminderProposalId] = useState<string>("");
    const [reminderSubmitLoading, setReminderSubmitLoading] = useState(false);
    const [taskActionId, setTaskActionId] = useState<string | null>(null);
    const [intentClarify, setIntentClarify] = useState<string | null>(null);
    const [lastCreatedOperationalTask, setLastCreatedOperationalTask] = useState<{
        id: string;
        title: string;
        due_at: string;
        status: string;
    } | null>(null);

    const refreshLists = useCallback(async () => {
        if (!active || !v11) return;
        setListsLoading(true);
        setError(null);
        try {
            const [pr, ss, tk] = await Promise.all([
                fetchTaskAssistProposals(entityId),
                fetchCommunicationScheduledSends(entityId),
                fetchOperationalTasks(entityId),
            ]);
            const pj = await readJson<{ ok?: boolean; proposals?: TaskAssistProposalRow[]; error?: string; message?: string }>(pr);
            const sj = await readJson<{ ok?: boolean; scheduled_sends?: CommunicationScheduledSendRow[]; error?: string; message?: string }>(ss);
            const tj = await readJson<{ ok?: boolean; tasks?: OperationalTaskRow[]; error?: string; message?: string }>(tk);
            if (pr.ok && pj.ok && Array.isArray(pj.proposals)) setProposals(pj.proposals);
            else if (!pr.ok) setProposals([]);
            if (ss.ok && sj.ok && Array.isArray(sj.scheduled_sends)) setScheduledSends(sj.scheduled_sends);
            else if (!ss.ok) setScheduledSends([]);
            if (tk.ok && tj.ok && Array.isArray(tj.tasks)) setOpTasks(tj.tasks);
            else if (!tk.ok) setOpTasks([]);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setListsLoading(false);
        }
    }, [active, entityId, v11]);

    useEffect(() => {
        setProposal(null);
        setProposalValid(false);
        setSelectedPersonId(null);
        setFinalBody("");
        setFinalSubject("");
        setInstruction("");
        setError(null);
        setSuccess(null);
        setChannel("sms");
        setScheduledForLocal("");
        setScheduleOpen(false);
        setScheduleProposalId("");
        setReminderTitle("");
        setReminderDueLocal("");
        setReminderProposalId("");
        setIntentClarify(null);
        setLastCreatedOperationalTask(null);
    }, [entityId]);

    useEffect(() => {
        if (!active || !command_bootstrap || !command_bootstrap_key) return;
        const b = command_bootstrap;
        setIntentClarify(
            b.intent_type === "unknown" ?
                "Choose draft a message, schedule a send, or create a reminder below — nothing runs until you confirm in this panel."
            :   null,
        );
        if (b.channel_hint === "sms" || b.channel_hint === "email") {
            setChannel(b.channel_hint);
        }
        if (b.instruction?.trim()) {
            setInstruction(b.instruction.trim());
        }
        if (b.intent_type === "schedule_message") {
            setScheduleOpen(true);
            const dt = timingHintToDatetimeLocal(b.timing_hint_text);
            if (dt) setScheduledForLocal(dt);
        }
        if (b.intent_type === "create_reminder") {
            if (b.reminder_title?.trim()) setReminderTitle(b.reminder_title.trim());
            const due = timingHintToDatetimeLocal(b.reminder_due_hint ?? b.timing_hint_text);
            if (due) setReminderDueLocal(due);
        }
    }, [active, command_bootstrap, command_bootstrap_key]);

    useEffect(() => {
        if (!active || !v11) return;
        void refreshLists();
    }, [active, entityId, v11, refreshLists]);

    const onChannelChange = useCallback((next: "sms" | "email") => {
        setChannel(next);
        setProposal(null);
        setProposalValid(false);
        setSelectedPersonId(null);
        setFinalBody("");
        setFinalSubject("");
        setError(null);
        setSuccess(null);
    }, []);

    const proposeDisabled = proposeLoading || !instruction.trim() || !active;

    const sendDisabled = useMemo(
        () =>
            computeTaskAssistSendDisabled({
                proposal,
                proposalValid,
                proposeLoading,
                applyLoading,
                selectedPersonId,
                finalBody,
                finalSubject,
                channel,
            }),
        [proposal, proposalValid, proposeLoading, applyLoading, selectedPersonId, finalBody, finalSubject, channel]
    );

    const scheduleDisabled = useMemo(
        () =>
            computeScheduleSendDisabled({
                proposalValid,
                selectedPersonId,
                finalBody,
                finalSubject,
                channel,
                scheduledForLocal,
            }) || scheduleSubmitLoading,
        [proposalValid, selectedPersonId, finalBody, finalSubject, channel, scheduledForLocal, scheduleSubmitLoading]
    );

    const reminderDisabled = useMemo(
        () => computeReminderSubmitDisabled(reminderTitle, reminderDueLocal) || reminderSubmitLoading,
        [reminderTitle, reminderDueLocal, reminderSubmitLoading]
    );

    const approvedProposals = useMemo(() => proposals.filter((p) => p.status === "approved"), [proposals]);

    const onPropose = useCallback(async () => {
        if (!active || !instruction.trim()) return;
        setProposeLoading(true);
        setError(null);
        setSuccess(null);
        setProposal(null);
        setProposalValid(false);
        setSelectedPersonId(null);
        try {
            const body = buildTaskAssistProposeRequestBody({ entityId, channel, instruction });
            const res = await fetch("/api/admin/ai/task-assist/propose", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                proposal?: TaskAssistSuggestionV1;
                proposal_valid?: boolean;
                error?: string;
                message?: string | null;
            };
            if (!res.ok || !json.ok || !json.proposal) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            setProposal(json.proposal);
            setProposalValid(json.proposal_valid === true);
            setFinalBody(String(json.proposal.draft_body ?? ""));
            setFinalSubject(json.proposal.channel === "email" ? String(json.proposal.draft_subject ?? "") : "");
            const def =
                json.proposal.recipient_candidates.find((c) => c.has_sms && channel === "sms") ||
                json.proposal.recipient_candidates.find((c) => c.has_email && channel === "email") ||
                json.proposal.recipient_candidates[0];
            if (def && recipientHasChannelHint(json.proposal.recipient_candidates, def.person_id, channel)) {
                setSelectedPersonId(def.person_id);
            } else {
                setSelectedPersonId(null);
            }
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setProposeLoading(false);
        }
    }, [active, channel, entityId, instruction]);

    const onApply = useCallback(async () => {
        if (!proposal || !selectedPersonId || sendDisabled) return;
        setApplyLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const body = buildTaskAssistApplyRequestBody({
                proposal,
                selectedPersonId,
                finalBody,
                finalSubject,
                channel,
            });
            const res = await fetch("/api/admin/ai/task-assist/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                send?: { communication_message_id?: string; process_trigger_attempted_note?: string };
                error?: string;
                message?: string | null;
            };
            if (!res.ok || !json.ok || !json.send?.communication_message_id) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            setSuccess("Sent — message queued through Communications.");
            setProposal(null);
            setProposalValid(false);
            setSelectedPersonId(null);
            setFinalBody("");
            setFinalSubject("");
            setInstruction("");
            if (v11) void refreshLists();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setApplyLoading(false);
        }
    }, [proposal, selectedPersonId, sendDisabled, finalBody, finalSubject, channel, v11, refreshLists]);

    const onSaveDraft = useCallback(async () => {
        if (!proposal || !proposalValid || !v11) return;
        setSaveDraftLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await persistTaskAssistProposal(proposal);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) {
                throw new Error(json.message || json.error || `Save failed (${res.status})`);
            }
            setSuccess(MUTATION_BOUNDARY_TASK_ASSIST_DRAFT_SAVE);
            await refreshLists();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaveDraftLoading(false);
        }
    }, [proposal, proposalValid, v11, refreshLists]);

    const onApproveProposal = useCallback(
        async (id: string) => {
            if (!v11) return;
            setProposalActionId(id);
            setError(null);
            setSuccess(null);
            try {
                const res = await postTaskAssistProposalApprove(id);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(json.message || json.error || `Approve failed (${res.status})`);
                setSuccess("Approved for review — does not send until you apply from Communications.");
                await refreshLists();
            } catch (e: unknown) {
                setError((e as Error).message);
            } finally {
                setProposalActionId(null);
            }
        },
        [v11, refreshLists]
    );

    const onRejectProposal = useCallback(
        async (id: string) => {
            if (!v11) return;
            setProposalActionId(id);
            setError(null);
            setSuccess(null);
            try {
                const res = await postTaskAssistProposalReject(id);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(json.message || json.error || `Reject failed (${res.status})`);
                setSuccess("Proposal rejected.");
                await refreshLists();
            } catch (e: unknown) {
                setError((e as Error).message);
            } finally {
                setProposalActionId(null);
            }
        },
        [v11, refreshLists]
    );

    const onSubmitSchedule = useCallback(async () => {
        if (!v11 || scheduleDisabled || !selectedPersonId) return;
        setScheduleSubmitLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const scheduledIso = new Date(scheduledForLocal).toISOString();
            const body = buildScheduleSendBody({
                entityId,
                recipientPersonId: selectedPersonId,
                channel,
                bodySnapshot: finalBody,
                subjectSnapshot: channel === "email" ? finalSubject : null,
                scheduledForIso: scheduledIso,
                proposalId: scheduleProposalId.trim() || null,
            });
            const res = await createCommunicationScheduledSend(body);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(json.message || json.error || `Schedule failed (${res.status})`);
            setSuccess("Scheduled — sends through Communications at the chosen time.");
            setScheduledForLocal("");
            setScheduleProposalId("");
            await refreshLists();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setScheduleSubmitLoading(false);
        }
    }, [v11, scheduleDisabled, selectedPersonId, entityId, channel, finalBody, finalSubject, scheduledForLocal, scheduleProposalId, refreshLists]);

    const onCancelScheduled = useCallback(
        async (id: string) => {
            if (!v11) return;
            setCancelSendId(id);
            setError(null);
            setSuccess(null);
            try {
                const res = await cancelCommunicationScheduledSend(id);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(json.message || json.error || `Cancel failed (${res.status})`);
                setSuccess("Scheduled send canceled.");
                await refreshLists();
            } catch (e: unknown) {
                setError((e as Error).message);
            } finally {
                setCancelSendId(null);
            }
        },
        [v11, refreshLists]
    );

    const onSubmitReminder = useCallback(async () => {
        if (!v11 || reminderDisabled) return;
        setReminderSubmitLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const body = buildOperationalTaskBody({
                entityId,
                title: reminderTitle,
                dueAtIso: new Date(reminderDueLocal).toISOString(),
                proposalId: reminderProposalId.trim() || null,
            });
            const res = await createOperationalTask(body);
            const json = await readJson<{
                ok?: boolean;
                task?: { id: string; title: string; due_at: string; status: string };
                error?: string;
                message?: string | null;
            }>(res);
            if (!res.ok || !json.ok) throw new Error(json.message || json.error || `Reminder failed (${res.status})`);
            setSuccess("Created — operational reminder on this record (not a family message).");
            if (json.task) {
                setLastCreatedOperationalTask({
                    id: String(json.task.id),
                    title: String(json.task.title),
                    due_at: String(json.task.due_at),
                    status: String(json.task.status),
                });
            } else {
                setLastCreatedOperationalTask(null);
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, { detail: { opportunity_id: entityId } })
                );
            }
            setReminderTitle("");
            setReminderDueLocal("");
            setReminderProposalId("");
            await refreshLists();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setReminderSubmitLoading(false);
        }
    }, [v11, reminderDisabled, entityId, reminderTitle, reminderDueLocal, reminderProposalId, refreshLists]);

    const onCompleteTask = useCallback(
        async (id: string) => {
            if (!v11) return;
            setTaskActionId(id);
            setError(null);
            setSuccess(null);
            try {
                const res = await patchOperationalTaskStatus(id, "completed");
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(json.message || json.error || `Update failed (${res.status})`);
                setSuccess("Task marked complete.");
                await refreshLists();
            } catch (e: unknown) {
                setError((e as Error).message);
            } finally {
                setTaskActionId(null);
            }
        },
        [v11, refreshLists]
    );

    const onCancelTask = useCallback(
        async (id: string) => {
            if (!v11) return;
            setTaskActionId(id);
            setError(null);
            setSuccess(null);
            try {
                const res = await patchOperationalTaskStatus(id, "canceled");
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(json.message || json.error || `Update failed (${res.status})`);
                setSuccess("Task canceled.");
                await refreshLists();
            } catch (e: unknown) {
                setError((e as Error).message);
            } finally {
                setTaskActionId(null);
            }
        },
        [v11, refreshLists]
    );

    const mergedPreviewErrors = useMemo(() => {
        if (!proposal || !selectedPersonId) return [] as string[];
        return validateTaskAssistSuggestionV1ForSendApply(
            mergeForSendApplyPreview(proposal, selectedPersonId, finalBody, finalSubject, channel)
        );
    }, [proposal, selectedPersonId, finalBody, finalSubject, channel]);

    const opportunityLinkLabel = (entity_display_label?.trim() || "This opportunity").trim();

    const onViewCreatedOperationalTask = useCallback(() => {
        if (!lastCreatedOperationalTask || typeof window === "undefined") return;
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
                    detail: { opportunity_id: entityId, task_id: lastCreatedOperationalTask.id },
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
    }, [attendedEntityId, focusRecord, entityId, lastCreatedOperationalTask]);

    return (
        <div
            className={`mb-3 rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.04] px-3 py-2.5 shadow-sm ${className}`}
            data-task-assist-v1-root="true"
            data-task-assist-source-surface={source_surface}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-alloy-stone/15 pb-2 mb-2">
                <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/55">Task Assist</h3>
                    <p className="text-[11px] text-alloy-midnight/60 mt-0.5">
                        Draft and review required — nothing sends until you approve and the server accepts the request.
                    </p>
                </div>
            </div>

            {success ? (
                <p className="text-xs font-medium text-emerald-800/90 bg-emerald-50/80 border border-emerald-200/60 rounded-md px-2 py-1.5 mb-2">{success}</p>
            ) : null}
            {lastCreatedOperationalTask ? (
                <div
                    className="mb-2 rounded-lg border border-emerald-200/70 bg-white/90 px-2.5 py-2 text-[11px] shadow-sm"
                    data-task-assist-reminder-created-card="true"
                >
                    <div className="font-semibold text-alloy-midnight/90">{lastCreatedOperationalTask.title}</div>
                    <div className="mt-1 text-alloy-midnight/70">
                        Due {new Date(lastCreatedOperationalTask.due_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                        <span className="capitalize">{lastCreatedOperationalTask.status}</span>
                    </div>
                    <div className="mt-1 text-alloy-midnight/65">Linked: {opportunityLinkLabel}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            type="button"
                            data-task-assist-view-created-operational-task="true"
                            className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-alloy-midnight"
                            onClick={onViewCreatedOperationalTask}
                        >
                            View task
                        </button>
                    </div>
                </div>
            ) : null}
            {error ? (
                <p className="text-xs font-medium text-red-800/90 bg-red-50/80 border border-red-200/60 rounded-md px-2 py-1.5 mb-2" role="alert">
                    {error}
                </p>
            ) : null}
            {intentClarify ? (
                <p
                    className="text-xs text-alloy-midnight/75 bg-alloy-stone/[0.08] border border-alloy-stone/20 rounded-md px-2 py-1.5 mb-2"
                    data-task-assist-intent-clarify="true"
                >
                    {intentClarify}
                </p>
            ) : null}

            <div className="space-y-2.5">
                <div>
                    <span className={COMPACT_LABEL}>Channel</span>
                    <div className="mt-1 flex gap-3 text-[12px]">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name={`task-assist-ch-${entityId}`} checked={channel === "sms"} onChange={() => onChannelChange("sms")} />
                            SMS
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name={`task-assist-ch-${entityId}`} checked={channel === "email"} onChange={() => onChannelChange("email")} />
                            Email
                        </label>
                    </div>
                </div>

                <div>
                    <label className={COMPACT_LABEL} htmlFor={`task-assist-instr-${entityId}`}>
                        Instruction / goal
                    </label>
                    <textarea
                        id={`task-assist-instr-${entityId}`}
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        rows={2}
                        disabled={!active}
                        placeholder="e.g. Confirm tour time and thank them for visiting"
                        className="mt-1 w-full resize-none rounded-md border border-alloy-stone/25 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-50"
                    />
                </div>

                <div>
                    <button
                        type="button"
                        onClick={() => void onPropose()}
                        disabled={proposeDisabled}
                        className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-midnight disabled:opacity-45 disabled:pointer-events-none"
                    >
                        {proposeLoading ? "Drafting…" : "Draft message"}
                    </button>
                </div>

                {proposal ? (
                    <div className="space-y-2 rounded-lg border border-alloy-stone/15 bg-white/70 p-2">
                        <p className="text-[11px] font-semibold text-alloy-midnight/70">Draft preview</p>
                        {!proposalValid ? (
                            <p className="text-[11px] text-amber-900/85 bg-amber-50/70 border border-amber-200/50 rounded px-2 py-1">
                                This draft did not pass server validation — edit instruction or channel and try again, or fix issues below.
                            </p>
                        ) : null}

                        {proposal.warnings?.length ? (
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Warnings</p>
                                {listText(proposal.warnings)}
                            </div>
                        ) : null}
                        {proposal.missing_inputs?.length ? (
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/65">Missing inputs</p>
                                {listText(proposal.missing_inputs)}
                            </div>
                        ) : null}
                        {(proposal.validation_errors?.length ?? 0) > 0 ? (
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-red-800/85">Validation</p>
                                {listText(proposal.validation_errors ?? [])}
                            </div>
                        ) : null}

                        {channel === "email" ? (
                            <div>
                                <label className={COMPACT_LABEL} htmlFor={`task-assist-subj-${entityId}`}>
                                    Final subject (required)
                                </label>
                                <input
                                    id={`task-assist-subj-${entityId}`}
                                    type="text"
                                    value={finalSubject}
                                    onChange={(e) => setFinalSubject(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-alloy-stone/25 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20"
                                />
                            </div>
                        ) : null}

                        <div>
                            <label className={COMPACT_LABEL} htmlFor={`task-assist-body-${entityId}`}>
                                Final message body
                            </label>
                            <textarea
                                id={`task-assist-body-${entityId}`}
                                value={finalBody}
                                onChange={(e) => setFinalBody(e.target.value)}
                                rows={5}
                                className="mt-1 w-full resize-y rounded-md border border-alloy-stone/25 bg-white px-2 py-1.5 text-[12px] leading-snug text-alloy-midnight/85 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20"
                            />
                        </div>

                        <div data-task-assist-recipients="true">
                            <span className={COMPACT_LABEL}>Recipient (one)</span>
                            <div className="mt-1 space-y-1.5">
                                {proposal.recipient_candidates.map((c) => {
                                    const eligible = recipientHasChannelHint(proposal.recipient_candidates, c.person_id, channel);
                                    const id = `task-assist-rec-${entityId}-${c.person_id}`;
                                    return (
                                        <label
                                            key={c.person_id}
                                            className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-[12px] ${
                                                eligible ? "border-alloy-stone/20 cursor-pointer" : "border-alloy-stone/10 opacity-55 cursor-not-allowed"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name={`task-assist-recipient-${entityId}`}
                                                id={id}
                                                checked={selectedPersonId === c.person_id}
                                                disabled={!eligible}
                                                onChange={() => eligible && setSelectedPersonId(c.person_id)}
                                            />
                                            <span>
                                                <span className="font-medium text-alloy-midnight/85">{c.display_label}</span>
                                                {!eligible ? (
                                                    <span className="ml-1 text-[10px] text-alloy-midnight/50">
                                                        ({channel === "sms" ? "no SMS on file" : "no email on file"})
                                                    </span>
                                                ) : null}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {mergedPreviewErrors.length > 0 && selectedPersonId ? (
                            <div data-task-assist-client-validation="true">
                                <p className="text-[10px] font-semibold text-red-800/85">Fix before send</p>
                                {listText(mergedPreviewErrors)}
                            </div>
                        ) : null}

                        {v11 ? (
                            <div className="border-t border-alloy-stone/15 pt-2 space-y-2" data-task-assist-v11="true">
                                <button
                                    type="button"
                                    data-task-assist-save-draft="true"
                                    disabled={!proposalValid || saveDraftLoading}
                                    onClick={() => void onSaveDraft()}
                                    className="rounded-md border border-alloy-stone/30 bg-white px-3 py-1.5 text-[12px] font-semibold text-alloy-midnight/85 hover:bg-alloy-stone/5 disabled:opacity-45 disabled:pointer-events-none"
                                >
                                    {saveDraftLoading ? "Saving…" : "Save draft for review"}
                                </button>
                                <p className="text-[10px] text-alloy-midnight/50">{MUTATION_BOUNDARY_TASK_ASSIST_DRAFT_SAVE}</p>
                            </div>
                        ) : null}

                        <div>
                            <button
                                type="button"
                                data-task-assist-send="true"
                                data-task-assist-send-disabled={sendDisabled ? "true" : "false"}
                                onClick={() => void onApply()}
                                disabled={sendDisabled}
                                className="rounded-md border border-alloy-blue/35 bg-alloy-blue/10 px-3 py-1.5 text-[12px] font-semibold text-alloy-blue hover:bg-alloy-blue/15 disabled:opacity-45 disabled:pointer-events-none"
                            >
                                {applyLoading ? "Sending…" : "Send approved draft"}
                            </button>
                            <p className="mt-1 text-[10px] text-alloy-midnight/50">{MUTATION_BOUNDARY_APPLIES_THROUGH_COMMS}</p>
                        </div>
                    </div>
                ) : null}
            </div>

            {v11 && (command_bar_surface !== "compact" || show_v11_lists) ? (
                <div className="mt-3 space-y-3 border-t border-alloy-stone/15 pt-3" data-task-assist-v11-lists="true">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Saved drafts & scheduled sends</p>
                    {listsLoading ? <p className="text-[11px] text-alloy-midnight/55">Loading lists…</p> : null}

                    <div>
                        <p className={COMPACT_LABEL}>Saved proposals</p>
                        <ul className="mt-1 space-y-1.5 text-[11px]">
                            {proposals.length === 0 && !listsLoading ? (
                                <li className="text-alloy-midnight/50">No saved drafts yet.</li>
                            ) : null}
                            {proposals.map((p) => (
                                <li key={p.id} className="rounded border border-alloy-stone/15 bg-white/60 px-2 py-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-1">
                                        <span className="font-mono text-[10px] text-alloy-midnight/60">{p.id.slice(0, 8)}…</span>
                                        <span className="text-[10px] uppercase tracking-wide text-alloy-midnight/70">{p.status}</span>
                                    </div>
                                    {p.status === "draft" ? (
                                        <div className="mt-1 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                data-task-assist-approve-proposal="true"
                                                disabled={proposalActionId === p.id}
                                                onClick={() => void onApproveProposal(p.id)}
                                                className="rounded bg-emerald-700/90 px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                data-task-assist-reject-proposal="true"
                                                disabled={proposalActionId === p.id}
                                                onClick={() => void onRejectProposal(p.id)}
                                                className="rounded border border-alloy-stone/30 px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/75 disabled:opacity-50"
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <button
                            type="button"
                            data-task-assist-schedule-toggle="true"
                            onClick={() => setScheduleOpen((o) => !o)}
                            className="text-[11px] font-semibold text-alloy-blue underline-offset-2 hover:underline"
                        >
                            {scheduleOpen ? "Hide schedule send" : "Schedule send (later)"}
                        </button>
                        {scheduleOpen ? (
                            <div className="mt-2 space-y-2 rounded-md border border-alloy-stone/15 bg-white/50 p-2" data-task-assist-schedule-panel="true">
                                <p className="text-[10px] text-alloy-midnight/60">
                                    Uses the recipient and final message above. A worker sends later — not now. Cancel only works while status is
                                    pending.
                                </p>
                                {approvedProposals.length ? (
                                    <div>
                                        <label className={COMPACT_LABEL} htmlFor={`task-assist-sched-prop-${entityId}`}>
                                            Link to approved proposal (optional)
                                        </label>
                                        <select
                                            id={`task-assist-sched-prop-${entityId}`}
                                            className="mt-1 w-full rounded border border-alloy-stone/25 bg-white px-2 py-1 text-[11px]"
                                            value={scheduleProposalId}
                                            onChange={(e) => setScheduleProposalId(e.target.value)}
                                        >
                                            <option value="">None</option>
                                            {approvedProposals.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.id.slice(0, 8)}… approved
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : null}
                                <div>
                                    <label className={COMPACT_LABEL} htmlFor={`task-assist-sched-when-${entityId}`}>
                                        Send at (local)
                                    </label>
                                    <input
                                        id={`task-assist-sched-when-${entityId}`}
                                        type="datetime-local"
                                        data-task-assist-schedule-when="true"
                                        min={minDatetimeLocalValue()}
                                        value={scheduledForLocal}
                                        onChange={(e) => setScheduledForLocal(e.target.value)}
                                        className="mt-1 w-full rounded border border-alloy-stone/25 bg-white px-2 py-1 text-[11px]"
                                    />
                                </div>
                                <button
                                    type="button"
                                    data-task-assist-schedule-submit="true"
                                    disabled={scheduleDisabled}
                                    onClick={() => void onSubmitSchedule()}
                                    className="rounded-md bg-alloy-midnight/85 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-45"
                                >
                                    {scheduleSubmitLoading ? "Saving schedule…" : "Save scheduled send"}
                                </button>
                            </div>
                        ) : null}
                    </div>

                    <div>
                        <p className={COMPACT_LABEL}>Scheduled sends</p>
                        <ul className="mt-1 space-y-1 text-[11px]">
                            {scheduledSends.length === 0 && !listsLoading ? (
                                <li className="text-alloy-midnight/50">None scheduled.</li>
                            ) : null}
                            {scheduledSends.map((s) => (
                                <li key={s.id} className="flex flex-wrap items-center justify-between gap-1 rounded border border-alloy-stone/12 px-2 py-1">
                                    <span>
                                        {s.status} · {new Date(s.scheduled_for).toLocaleString()}
                                    </span>
                                    {s.status === "pending" ? (
                                        <button
                                            type="button"
                                            data-task-assist-cancel-scheduled="true"
                                            disabled={cancelSendId === s.id}
                                            onClick={() => void onCancelScheduled(s.id)}
                                            className="text-[10px] font-semibold text-red-800/90 underline disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <p className={COMPACT_LABEL}>Reminder / task</p>
                        <p className="text-[10px] text-alloy-midnight/55 mb-1">
                            Creates an operational task. Opportunity follow-up signals may update from open task due dates when synced.
                        </p>
                        <div className="space-y-1.5 rounded-md border border-alloy-stone/15 bg-white/50 p-2">
                            <input
                                type="text"
                                data-task-assist-reminder-title="true"
                                placeholder="Title (required)"
                                value={reminderTitle}
                                onChange={(e) => setReminderTitle(e.target.value)}
                                className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                            />
                            <input
                                type="datetime-local"
                                data-task-assist-reminder-due="true"
                                min={minDatetimeLocalValue()}
                                value={reminderDueLocal}
                                onChange={(e) => setReminderDueLocal(e.target.value)}
                                className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                            />
                            {approvedProposals.length ? (
                                <select
                                    className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                                    value={reminderProposalId}
                                    onChange={(e) => setReminderProposalId(e.target.value)}
                                >
                                    <option value="">Link proposal (optional)</option>
                                    {approvedProposals.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.id.slice(0, 8)}…
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                            <button
                                type="button"
                                data-task-assist-reminder-submit="true"
                                disabled={reminderDisabled}
                                onClick={() => void onSubmitReminder()}
                                className="rounded-md bg-alloy-midnight/85 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-45"
                            >
                                {reminderSubmitLoading ? "Creating…" : "Create reminder task"}
                            </button>
                        </div>
                        <ul className="mt-2 space-y-1 text-[11px]">
                            {opTasks.length === 0 && !listsLoading ? <li className="text-alloy-midnight/50">No tasks yet.</li> : null}
                            {opTasks.map((t) => (
                                <li key={t.id} className="flex flex-wrap items-center justify-between gap-1 rounded border border-alloy-stone/12 px-2 py-1">
                                    <span>
                                        <span className="font-medium">{t.title}</span> · {t.status} · due {new Date(t.due_at).toLocaleString()}
                                    </span>
                                    {t.status === "open" ? (
                                        <span className="flex gap-2">
                                            <button
                                                type="button"
                                                data-task-assist-task-complete="true"
                                                disabled={taskActionId === t.id}
                                                onClick={() => void onCompleteTask(t.id)}
                                                className="text-[10px] font-semibold text-emerald-800 underline disabled:opacity-50"
                                            >
                                                Complete
                                            </button>
                                            <button
                                                type="button"
                                                data-task-assist-task-cancel="true"
                                                disabled={taskActionId === t.id}
                                                onClick={() => void onCancelTask(t.id)}
                                                className="text-[10px] font-semibold text-alloy-midnight/70 underline disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        </span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
