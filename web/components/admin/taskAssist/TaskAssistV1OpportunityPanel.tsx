"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import {
    buildTaskAssistApplyRequestBody,
    buildTaskAssistProposeRequestBody,
    mergeForSendApplyPreview,
    recipientHasChannelHint,
} from "@/lib/agent/taskAssist/taskAssistV1ClientPayloads";
import { validateTaskAssistSuggestionV1ForSendApply } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";

export type TaskAssistV1OpportunityPanelProps = {
    entityId: string;
    /** When false, skip network calls (parent scopes to visible tab). @default true */
    active?: boolean;
    className?: string;
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

const COMPACT_LABEL = "block text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55";

/**
 * Task Assist V1 — opportunity drawer only. Parent should gate with {@link isTaskAssistV1UiEnabled}.
 */
export default function TaskAssistV1OpportunityPanel({ entityId, active = true, className = "" }: TaskAssistV1OpportunityPanelProps) {
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
    }, [entityId]);

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
                throw new Error(json.message || json.error || `Draft request failed (${res.status})`);
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
            setError((e as Error).message);
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
                throw new Error(json.message || json.error || `Send failed (${res.status})`);
            }
            setSuccess(
                `Message queued for delivery (id ${json.send.communication_message_id}). ${json.send.process_trigger_attempted_note ?? ""}`.trim()
            );
            setProposal(null);
            setProposalValid(false);
            setSelectedPersonId(null);
            setFinalBody("");
            setFinalSubject("");
            setInstruction("");
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setApplyLoading(false);
        }
    }, [proposal, selectedPersonId, sendDisabled, finalBody, finalSubject, channel]);

    const mergedPreviewErrors = useMemo(() => {
        if (!proposal || !selectedPersonId) return [] as string[];
        return validateTaskAssistSuggestionV1ForSendApply(
            mergeForSendApplyPreview(proposal, selectedPersonId, finalBody, finalSubject, channel)
        );
    }, [proposal, selectedPersonId, finalBody, finalSubject, channel]);

    return (
        <div
            className={`mb-3 rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.04] px-3 py-2.5 shadow-sm ${className}`}
            data-task-assist-v1-root="true"
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
            {error ? (
                <p className="text-xs font-medium text-red-800/90 bg-red-50/80 border border-red-200/60 rounded-md px-2 py-1.5 mb-2" role="alert">
                    {error}
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
                        {proposeLoading ? "Drafting…" : "Draft with Task Assist"}
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
                            <p className="mt-1 text-[10px] text-alloy-midnight/50">
                                Sends through the same communications path as the composer — queued until processed.
                            </p>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
