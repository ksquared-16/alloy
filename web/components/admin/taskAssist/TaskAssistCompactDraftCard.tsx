"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { timingHintToDatetimeLocal } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import {
    buildTaskAssistApplyRequestBody,
    buildTaskAssistProposeRequestBody,
    mergeForSendApplyPreview,
    recipientHasChannelHint,
} from "@/lib/agent/taskAssist/taskAssistV1ClientPayloads";
import {
    buildScheduleSendBody,
    createCommunicationScheduledSend,
    persistTaskAssistProposal,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import { validateTaskAssistSuggestionV1ForSendApply } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import {
    computeScheduleSendDisabled,
    computeTaskAssistSendDisabled,
    minDatetimeLocalValue,
} from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

export type TaskAssistCompactDraftCardProps = {
    entityId: string;
    entityLabel: string;
    locationLabel?: string | null;
    bootstrap: TaskAssistCommandBootstrap;
    bootstrapKey: string;
    /** When true, call propose on mount (command bar flow). */
    autoPropose?: boolean;
    onSchedulePrompt?: () => void;
};

const LABEL = "block text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55";

type Phase = "loading" | "review" | "schedule_prompt" | "success";

export default function TaskAssistCompactDraftCard({
    entityId,
    entityLabel,
    locationLabel,
    bootstrap,
    bootstrapKey,
    autoPropose = true,
    onSchedulePrompt,
}: TaskAssistCompactDraftCardProps) {
    const v11 = isTaskAssistV1UiEnabled();
    const proposedRef = useRef<string | null>(null);

    const [phase, setPhase] = useState<Phase>(autoPropose ? "loading" : "review");
    const [channel, setChannel] = useState<"sms" | "email">(
        bootstrap.channel_hint === "email" ? "email" : "sms"
    );
    const [instruction, setInstruction] = useState(bootstrap.instruction?.trim() ?? "");
    const [proposal, setProposal] = useState<TaskAssistSuggestionV1 | null>(null);
    const [proposalValid, setProposalValid] = useState(false);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    const [finalBody, setFinalBody] = useState("");
    const [finalSubject, setFinalSubject] = useState("");
    const [proposeLoading, setProposeLoading] = useState(false);
    const [applyLoading, setApplyLoading] = useState(false);
    const [saveDraftLoading, setSaveDraftLoading] = useState(false);
    const [scheduleSubmitLoading, setScheduleSubmitLoading] = useState(false);
    const [scheduledForLocal, setScheduledForLocal] = useState("");
    const [scheduleTimingText, setScheduleTimingText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const onPropose = useCallback(async () => {
        if (!instruction.trim()) {
            setError("Add a message goal to draft.");
            setPhase("review");
            return;
        }
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
            }
            setPhase("review");
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
            setPhase("review");
        } finally {
            setProposeLoading(false);
        }
    }, [channel, entityId, instruction]);

    useEffect(() => {
        if (!autoPropose || !bootstrapKey) return;
        if (proposedRef.current === bootstrapKey) return;
        proposedRef.current = bootstrapKey;
        setChannel(bootstrap.channel_hint === "email" ? "email" : "sms");
        setInstruction(bootstrap.instruction?.trim() ?? "");
        setPhase("loading");
        void onPropose();
    }, [autoPropose, bootstrapKey, bootstrap, onPropose]);

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
                send?: { communication_message_id?: string };
                error?: string;
                message?: string | null;
            };
            if (!res.ok || !json.ok || !json.send?.communication_message_id) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            setSuccess("Message queued for delivery. Nothing else sends until you approve future actions.");
            setPhase("success");
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setApplyLoading(false);
        }
    }, [proposal, selectedPersonId, sendDisabled, finalBody, finalSubject, channel]);

    const onSaveDraft = useCallback(async () => {
        if (!proposal || !proposalValid || !v11) return;
        setSaveDraftLoading(true);
        setError(null);
        try {
            const res = await persistTaskAssistProposal(proposal);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            setSuccess("Draft saved for later review.");
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setSaveDraftLoading(false);
        }
    }, [proposal, proposalValid, v11]);

    const openSchedulePrompt = useCallback(() => {
        onSchedulePrompt?.();
        const fromBootstrap = timingHintToDatetimeLocal(bootstrap.timing_hint_text);
        if (fromBootstrap) {
            setScheduledForLocal(fromBootstrap);
            setPhase("schedule_prompt");
            return;
        }
        setScheduleTimingText("");
        setScheduledForLocal("");
        setPhase("schedule_prompt");
    }, [bootstrap.timing_hint_text, onSchedulePrompt]);

    const applyScheduleTimingText = useCallback(() => {
        const dt = timingHintToDatetimeLocal(scheduleTimingText.trim() || null);
        if (dt) setScheduledForLocal(dt);
    }, [scheduleTimingText]);

    const onSubmitSchedule = useCallback(async () => {
        if (!v11 || scheduleDisabled || !selectedPersonId) return;
        setScheduleSubmitLoading(true);
        setError(null);
        try {
            const scheduledIso = new Date(scheduledForLocal).toISOString();
            const body = buildScheduleSendBody({
                entityId,
                recipientPersonId: selectedPersonId,
                channel,
                bodySnapshot: finalBody,
                subjectSnapshot: channel === "email" ? finalSubject : null,
                scheduledForIso: scheduledIso,
                proposalId: null,
            });
            const res = await createCommunicationScheduledSend(body);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            setSuccess("Scheduled send saved. It will send at the chosen time — not immediately.");
            setPhase("success");
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setScheduleSubmitLoading(false);
        }
    }, [v11, scheduleDisabled, selectedPersonId, entityId, channel, finalBody, finalSubject, scheduledForLocal]);

    const mergedPreviewErrors = useMemo(() => {
        if (!proposal || !selectedPersonId) return [] as string[];
        return validateTaskAssistSuggestionV1ForSendApply(
            mergeForSendApplyPreview(proposal, selectedPersonId, finalBody, finalSubject, channel)
        );
    }, [proposal, selectedPersonId, finalBody, finalSubject, channel]);

    const targetSummary = locationLabel?.trim() ?
        `${entityLabel} · ${locationLabel.trim()}`
    :   entityLabel;

    if (phase === "loading" || proposeLoading) {
        return (
            <div className="space-y-1" data-task-assist-compact-draft="loading">
                <p className="text-[12px] font-medium text-alloy-midnight/80">Drafting message…</p>
                <p className="text-[10px] text-alloy-midnight/55">{targetSummary}</p>
            </div>
        );
    }

    if (phase === "success") {
        return (
            <div className="space-y-1" data-task-assist-compact-draft="success">
                <p className="text-[12px] font-medium text-emerald-800/90">{success}</p>
            </div>
        );
    }

    if (phase === "schedule_prompt") {
        return (
            <div className="space-y-2" data-task-assist-compact-draft="schedule-prompt">
                <p className="text-[12px] font-medium text-alloy-midnight/85">When should I send it?</p>
                <input
                    type="text"
                    value={scheduleTimingText}
                    onChange={(e) => setScheduleTimingText(e.target.value)}
                    onBlur={applyScheduleTimingText}
                    placeholder="e.g. tomorrow at 9am"
                    className="w-full rounded-md border border-alloy-stone/25 bg-white px-2 py-1.5 text-[12px]"
                />
                <input
                    type="datetime-local"
                    value={scheduledForLocal}
                    min={minDatetimeLocalValue()}
                    onChange={(e) => setScheduledForLocal(e.target.value)}
                    className="w-full rounded-md border border-alloy-stone/25 bg-white px-2 py-1.5 text-[12px]"
                />
                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        disabled={scheduleDisabled}
                        data-task-assist-compact-schedule-submit="true"
                        onClick={() => void onSubmitSchedule()}
                        className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                    >
                        {scheduleSubmitLoading ? "Scheduling…" : "Confirm schedule"}
                    </button>
                    <button
                        type="button"
                        className="rounded-md border border-alloy-stone/30 px-3 py-1.5 text-[11px] font-semibold"
                        onClick={() => setPhase("review")}
                    >
                        Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2" data-task-assist-compact-draft="review">
            {success ? <p className="text-[11px] font-medium text-emerald-800/90">{success}</p> : null}
            {error ? (
                <p className="text-[11px] font-medium text-red-800/90" role="alert" data-task-assist-compact-error="true">
                    {error}
                </p>
            ) : null}

            <p className="text-[10px] text-alloy-midnight/60">{targetSummary}</p>

            <div className="flex gap-3 text-[11px]">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                        type="radio"
                        checked={channel === "sms"}
                        onChange={() => setChannel("sms")}
                    />
                    SMS
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                        type="radio"
                        checked={channel === "email"}
                        onChange={() => setChannel("email")}
                    />
                    Email
                </label>
            </div>

            {channel === "email" ? (
                <div>
                    <label className={LABEL} htmlFor={`ta-compact-subj-${entityId}`}>
                        Subject
                    </label>
                    <input
                        id={`ta-compact-subj-${entityId}`}
                        type="text"
                        value={finalSubject}
                        onChange={(e) => setFinalSubject(e.target.value)}
                        className="mt-0.5 w-full rounded-md border border-alloy-stone/25 bg-white px-2 py-1.5 text-[12px]"
                    />
                </div>
            ) : null}

            <div>
                <label className={LABEL} htmlFor={`ta-compact-body-${entityId}`}>
                    Message
                </label>
                <textarea
                    id={`ta-compact-body-${entityId}`}
                    value={finalBody}
                    onChange={(e) => setFinalBody(e.target.value)}
                    rows={4}
                    className="mt-0.5 w-full resize-y rounded-md border border-alloy-stone/25 bg-white px-2 py-1.5 text-[12px] leading-snug"
                />
            </div>

            {proposal?.recipient_candidates.length ? (
                <div>
                    <span className={LABEL}>Recipient</span>
                    <div className="mt-1 space-y-1">
                        {proposal.recipient_candidates.map((c) => {
                            const eligible = recipientHasChannelHint(proposal.recipient_candidates, c.person_id, channel);
                            return (
                                <label
                                    key={c.person_id}
                                    className={`flex items-center gap-2 text-[11px] ${eligible ? "cursor-pointer" : "opacity-50"}`}
                                >
                                    <input
                                        type="radio"
                                        name={`ta-compact-rec-${entityId}`}
                                        checked={selectedPersonId === c.person_id}
                                        disabled={!eligible}
                                        onChange={() => eligible && setSelectedPersonId(c.person_id)}
                                    />
                                    {c.display_label}
                                </label>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {mergedPreviewErrors.length > 0 && selectedPersonId ? (
                <ul className="list-disc pl-4 text-[10px] text-red-800/85">
                    {mergedPreviewErrors.map((m, i) => (
                        <li key={i}>{m}</li>
                    ))}
                </ul>
            ) : null}

            <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                    type="button"
                    data-task-assist-compact-send-now="true"
                    disabled={sendDisabled}
                    onClick={() => void onApply()}
                    className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                >
                    {applyLoading ? "Sending…" : "Send now"}
                </button>
                <button
                    type="button"
                    data-task-assist-compact-schedule="true"
                    disabled={!proposalValid || !selectedPersonId || !finalBody.trim()}
                    onClick={openSchedulePrompt}
                    className="rounded-md border border-alloy-stone/30 px-3 py-1.5 text-[11px] font-semibold disabled:opacity-45"
                >
                    Schedule for later
                </button>
                {v11 ? (
                    <button
                        type="button"
                        data-task-assist-compact-save-draft="true"
                        disabled={!proposalValid || saveDraftLoading}
                        onClick={() => void onSaveDraft()}
                        className="rounded-md border border-alloy-stone/30 px-3 py-1.5 text-[11px] font-semibold disabled:opacity-45"
                    >
                        {saveDraftLoading ? "Saving…" : "Save draft"}
                    </button>
                ) : null}
            </div>
            <p className="text-[10px] text-alloy-midnight/50">Nothing sends until you confirm Send now or schedule.</p>
        </div>
    );
}
