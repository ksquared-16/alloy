"use client";

import { Users, Mail, MessageSquare, Phone, StickyNote, Settings2, Bold, Italic, List, Link2, Smile, Paperclip, FileText, Sparkles, Send, Clock, Check, UserPlus, ChevronDown } from "lucide-react";
import { relTime, statusDisplay, consentTone, consentMark } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";
import { isRecipientEligible, isRecipientSelected, selectionSummary } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type { ConsentState, RecipientGroup, ComposerChannel } from "@/lib/communications/v2/familyWorkspace/types";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";

/**
 * UI-6.1 — canonical Family Communication Workspace MARKUP (conversation | composer two-column body).
 * Presentational: rendered by BOTH the full Communications modal (CommandCenterShell, column 2) and the
 * drawer tabs (FamilyCommunicationWorkspace). All timeline/composer UI changes happen HERE, once.
 * Ported verbatim from the locked UI-4H modal workspace; callers supply data + handlers.
 */
export type WorkspaceTimelineMessage = {
    id?: string | null;
    direction?: string | null;
    channel?: string | null;
    body?: string | null;
    created_at?: string | null;
    kind?: string | null;
    thread_id?: string | null;
    status?: string | null;
};
export type WorkspaceDetail = {
    owner: string;
    contactName: string;
    program?: string | null;
    stage?: string | null;
    consent: { email: ConsentState; sms: ConsentState; marketing: ConsentState };
};
export type WorkspaceSelected = { id: string; family_label?: string | null; sla_state?: string | null; assignment_state?: string | null };

const toolbarBtn = "rounded-md p-1.5 text-alloy-midnight/55 transition hover:bg-alloy-stone/12 hover:text-alloy-midnight";
type IconType = typeof Mail;
const channelIcon = (m: WorkspaceTimelineMessage): IconType => {
    const k = m.kind && m.kind !== "message" ? m.kind : null;
    if (k === "note") return StickyNote;
    if (k === "system") return Settings2;
    if (k === "call") return Phone;
    if (m.channel === "sms") return MessageSquare;
    return Mail;
};

export type FamilyCommunicationWorkspaceViewProps = {
    selected: WorkspaceSelected;
    detail?: WorkspaceDetail;
    childNames: string[];
    healthTone: string;
    healthDot: string;
    healthLabel: string;
    LIVE_WORKSPACE: boolean;
    selectedThreadId: string | null;
    messages: WorkspaceTimelineMessage[];
    liveRecipientGroups: RecipientGroup[] | null;
    selectedRecipientIds: string[];
    liveChannel: ComposerChannel;
    subjectDraft: string;
    bodyDraft: string;
    sendResult: FamilySendResult | null;
    sendError: string | null;
    sending: boolean;
    assignBusy: boolean;
    onClaim: (id: string) => void;
    onAllMessages: () => void;
    onOpenThread: (threadId: string) => void;
    onToggleRecipient: (id: string) => void;
    onSubjectChange: (v: string) => void;
    onBodyChange: (v: string) => void;
    onSendNow: () => void;
    onConfirmSend: () => void;
    onDismissSend: () => void;
};

export default function FamilyCommunicationWorkspaceView(props: FamilyCommunicationWorkspaceViewProps) {
    const {
        selected, detail, childNames, healthTone, healthDot, healthLabel, LIVE_WORKSPACE, selectedThreadId, messages,
        liveRecipientGroups, selectedRecipientIds, liveChannel, subjectDraft, bodyDraft, sendResult, sendError, sending, assignBusy,
        onClaim, onAllMessages, onOpenThread, onToggleRecipient, onSubjectChange, onBodyChange, onSendNow, onConfirmSend, onDismissSend,
    } = props;
    const allLiveRecipients = liveRecipientGroups ? liveRecipientGroups.flatMap((g) => g.recipients) : [];

    return (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(380px,1.35fr)]">
            {/* CONVERSATION — compact snapshot band + chat history */}
            <div className="flex min-h-0 flex-col bg-[#f6f7f5]">
                <div data-cc-ws-section="snapshot" className="shrink-0 border-b border-alloy-stone/20 bg-gradient-to-br from-[#eef7f3] via-white to-[#eef6f4] px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#dff2ea] text-[#0f6b4a] ring-1 ring-[#7fc9b6]/60">
                            <Users className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <h3 className="truncate text-[15px] font-semibold leading-tight text-alloy-midnight">{selected.family_label ?? "Family"}</h3>
                                {childNames.map((n) => (
                                    <span key={n} className="inline-flex items-center rounded-full border border-[#7fc9b6]/60 bg-[#f0faf6] px-1.5 py-px text-[10px] font-medium text-[#0f6b4a]">{n}</span>
                                ))}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-alloy-midnight/60">
                                <span data-cc-ws-section="health" className={`inline-flex items-center gap-1 font-semibold ${healthTone}`}>
                                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${healthDot}`} />{healthLabel}
                                </span>
                                <span className="text-alloy-midnight/25">•</span>
                                <span><span className="text-alloy-midnight/40">Assigned</span> {detail ? detail.owner : (selected.assignment_state ?? "—")}</span>
                                <span className="text-alloy-midnight/25">•</span>
                                <span data-cc-ws-section="consent" className="inline-flex items-center gap-1.5">
                                    <span className={`font-bold ${consentTone(detail ? detail.consent.email : "unset")}`}>E{consentMark(detail ? detail.consent.email : "unset")}</span>
                                    <span className={`font-bold ${consentTone(detail ? detail.consent.sms : "unset")}`}>S{consentMark(detail ? detail.consent.sms : "unset")}</span>
                                    <span className={`font-bold ${consentTone(detail ? detail.consent.marketing : "unset")}`}>M{consentMark(detail ? detail.consent.marketing : "unset")}</span>
                                </span>
                                {detail ? <><span className="text-alloy-midnight/25">•</span><span className="truncate text-alloy-midnight/50">{detail.program} · {detail.stage}</span></> : null}
                            </div>
                        </div>
                        <button
                            type="button"
                            data-cc-claim
                            disabled={assignBusy || selected.assignment_state === "assigned"}
                            onClick={() => onClaim(selected.id)}
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm transition ${
                                selected.assignment_state === "assigned"
                                    ? "border border-[#7fc9b6] bg-[#eafaf3] text-[#0f6b4a]"
                                    : "bg-[#00A283] text-white hover:bg-[#009276]"
                            }`}
                        >
                            {selected.assignment_state === "assigned" ? "Assigned" : "Claim"}
                        </button>
                    </div>
                </div>

                {/* conversation history — reads like a chat */}
                <div data-cc-ws-section="timeline" className="min-h-0 flex-1 overflow-auto px-3.5 py-3">
                    {LIVE_WORKSPACE && selectedThreadId ? (
                        <div className="mb-2 flex items-center justify-between rounded-md border border-[#7fc9b6]/50 bg-[#f0faf6] px-2 py-1 text-[10px] text-[#0f6b4a]">
                            <span>Viewing one thread</span>
                            <button type="button" onClick={onAllMessages} className="font-semibold underline">All messages</button>
                        </div>
                    ) : null}
                    {messages.length === 0 ? (
                        <div className="text-[11px] text-alloy-midnight/45">No communication yet.</div>
                    ) : (
                        <ol data-cc-timeline className="space-y-3">
                            {messages.map((m, i) => {
                                const isSystem = m.kind === "system";
                                const isNote = m.kind === "note";
                                const out = m.direction === "outbound";
                                const Icon = channelIcon(m);
                                if (isSystem) {
                                    return (
                                        <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} className="flex items-center justify-center gap-1.5 text-[10px] text-alloy-midnight/45">
                                            <Settings2 className="h-3 w-3" /> {m.body ?? ""} · {relTime(m.created_at)}
                                        </li>
                                    );
                                }
                                if (isNote) {
                                    return (
                                        <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} className="rounded-lg border border-[#e6c98a]/60 bg-[#fbf6ea] px-3 py-1.5 text-[11px] text-[#9a6b16]">
                                            <span className="font-semibold">Internal note</span> · {m.body ?? ""}
                                        </li>
                                    );
                                }
                                const sender = out ? (detail?.owner ?? "Staff") : (detail?.contactName ?? selected.family_label ?? "Family");
                                return (
                                    <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} data-cc-thread-open={m.thread_id ?? undefined} onClick={() => { if (LIVE_WORKSPACE && m.thread_id) onOpenThread(m.thread_id); }} className={`flex ${out ? "justify-end" : "justify-start"} ${LIVE_WORKSPACE && m.thread_id ? "cursor-pointer" : ""}`}>
                                        <div className="max-w-[88%]">
                                            <div className={`mb-0.5 flex items-center gap-1 text-[10px] text-alloy-midnight/45 ${out ? "justify-end" : ""}`}>
                                                <Icon className="h-3 w-3" />
                                                <span className="font-semibold text-alloy-midnight/60">{sender}</span>
                                                <span>· {relTime(m.created_at)}</span>
                                                {out && statusDisplay(m.status) ? <span className={statusDisplay(m.status)!.cls}>· {statusDisplay(m.status)!.label}</span> : null}
                                            </div>
                                            <div className={`rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${out ? "rounded-tr-sm bg-[#e7f5ef] text-alloy-midnight" : "rounded-tl-sm border border-alloy-stone/15 bg-white text-alloy-midnight"}`}>
                                                {m.body ?? ""}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            </div>

            {/* COMPOSER — top-anchored, full height, body dominant */}
            <div data-cc-ws-section="composer" className="flex min-h-0 flex-col border-l border-alloy-stone/15 bg-gradient-to-b from-[#fbfcfb] to-[#f3f5f2] px-4 py-3">
                <div className="inline-flex w-fit overflow-hidden rounded-lg border border-alloy-stone/20 bg-white text-[11px] shadow-sm">
                    <span className="bg-[#00A283] px-2.5 py-1 font-semibold text-white">Email</span>
                    <span className="border-l border-alloy-stone/15 px-2.5 py-1 text-alloy-midnight/55">SMS</span>
                    <span className="border-l border-alloy-stone/15 px-2.5 py-1 text-alloy-midnight/55">Note</span>
                </div>

                {LIVE_WORKSPACE && liveRecipientGroups ? (
                    <div data-cc-recipient-selector className="mt-2 rounded-lg border border-alloy-stone/20 bg-white px-2 py-2 shadow-sm">
                        <div className="mb-1 text-[10px] font-medium text-alloy-midnight/45">To · <span className="text-alloy-midnight/70">{selectionSummary(selectedRecipientIds, allLiveRecipients)}</span></div>
                        {liveRecipientGroups.map((g) => (
                            <div key={g.tier} className="mb-1.5 last:mb-0">
                                <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">{g.uiLabel}</div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    {g.recipients.map((r) => {
                                        const elig = isRecipientEligible(r, liveChannel);
                                        const sel = isRecipientSelected(selectedRecipientIds, r.id);
                                        if (!elig) {
                                            const reason = r.channels[liveChannel === "note" ? "email" : liveChannel].unavailableReason ?? "Unavailable";
                                            return (
                                                <span key={r.id} title={reason} data-cc-recipient-disabled={r.id} className="inline-flex items-center gap-1 rounded-full border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-0.5 text-[10px] text-alloy-midnight/40">
                                                    {r.displayName} · <span className="text-alloy-midnight/35">{reason}</span>
                                                </span>
                                            );
                                        }
                                        return (
                                            <button key={r.id} type="button" data-cc-recipient={r.id} aria-pressed={sel} onClick={() => onToggleRecipient(r.id)}
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${sel ? "bg-[#00A283] text-white" : "bg-[#eafaf3] text-[#0f6b4a] ring-1 ring-[#7fc9b6]/50 hover:ring-[#00A283]"}`}>
                                                {sel ? <Check className="h-3 w-3" /> : null}{r.displayName}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 shadow-sm">
                        <span className="text-[10px] font-medium text-alloy-midnight/40">To</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eafaf3] px-2 py-0.5 text-[10px] font-medium text-[#0f6b4a] ring-1 ring-[#7fc9b6]/50">
                            {detail ? detail.contactName : (selected.family_label ?? "")}
                            {detail ? <span className={`font-bold ${consentTone(detail.consent.email)}`}>{consentMark(detail.consent.email)}</span> : null}
                        </span>
                        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-alloy-stone/30 px-2 py-0.5 text-[10px] text-alloy-midnight/50 hover:border-[#7fc9b6] hover:text-[#0f6b4a]">
                            <UserPlus className="h-3 w-3" />Add recipient
                        </button>
                        <ChevronDown className="ml-auto h-3.5 w-3.5 text-alloy-midnight/35" />
                    </div>
                )}

                <input
                    aria-label="Subject"
                    placeholder="Subject"
                    value={subjectDraft}
                    onChange={(e) => onSubjectChange(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm placeholder:text-alloy-midnight/35"
                />

                <div className="mt-2 flex min-h-[240px] flex-1 flex-col overflow-hidden rounded-lg border border-alloy-stone/20 bg-white shadow-sm">
                    <div className="flex items-center gap-0.5 border-b border-alloy-stone/12 bg-[#fbfcfb] px-1.5 py-1">
                        <button type="button" aria-label="Bold" className={toolbarBtn}><Bold className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Italic" className={toolbarBtn}><Italic className="h-3.5 w-3.5" /></button>
                        <span className="mx-1 h-4 w-px bg-alloy-stone/20" />
                        <button type="button" aria-label="Bulleted list" className={toolbarBtn}><List className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Insert link" className={toolbarBtn}><Link2 className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Emoji" className={toolbarBtn}><Smile className="h-3.5 w-3.5" /></button>
                        <span className="ml-auto flex items-center gap-0.5">
                            <button type="button" aria-label="Attach" className={toolbarBtn}><Paperclip className="h-3.5 w-3.5" /></button>
                            <button type="button" aria-label="Templates" className={toolbarBtn}><FileText className="h-3.5 w-3.5" /></button>
                        </span>
                    </div>
                    <textarea
                        aria-label="Message body"
                        placeholder={`Write a message to ${detail ? detail.contactName : (selected.family_label ?? "the family")}…`}
                        value={bodyDraft}
                        onChange={(e) => onBodyChange(e.target.value)}
                        className="w-full min-h-0 flex-1 resize-none border-0 bg-white px-3.5 py-3 text-sm leading-relaxed text-alloy-midnight placeholder:text-alloy-midnight/35 focus:outline-none"
                    />
                </div>

                {LIVE_WORKSPACE && (sendResult || sendError) ? (
                    <div data-cc-send-review className="mt-2 rounded-lg border border-alloy-stone/20 bg-white px-2.5 py-2 text-[11px] shadow-sm">
                        {sendError ? <div className="text-alloy-ember">{sendError}</div> : null}
                        {sendResult ? (
                            <>
                                <div className="mb-1 font-semibold text-alloy-midnight">
                                    {sendResult.mode === "preflight" ? "Review before sending" : "Send results"}
                                    <span className="ml-1 font-normal text-alloy-midnight/55">
                                        {sendResult.mode === "preflight"
                                            ? `${sendResult.summary.ready} ready · ${sendResult.summary.blocked} blocked`
                                            : `${sendResult.summary.sent} sent · ${sendResult.summary.blocked} blocked · ${sendResult.summary.failed} failed`}
                                    </span>
                                </div>
                                <ul className="space-y-0.5">
                                    {sendResult.results.map((r) => (
                                        <li key={r.person_id} className="flex items-center gap-1.5">
                                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${r.status === "sent" || r.status === "ready" ? "bg-[#00A283]" : r.status === "blocked" ? "bg-[#e0a32e]" : "bg-red-500"}`} />
                                            <span className="font-medium text-alloy-midnight">{r.display_name}</span>
                                            <span className="text-alloy-midnight/55">· {r.status}{r.reason ? ` — ${r.reason}` : ""}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    {sendResult.mode === "preflight" && sendResult.summary.ready > 0 ? (
                                        <button type="button" disabled={sending} onClick={onConfirmSend} className="rounded-md bg-[#00A283] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Confirm send ({sendResult.summary.ready})</button>
                                    ) : null}
                                    <button type="button" onClick={onDismissSend} className="rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-[11px] text-alloy-midnight">{sendResult.mode === "sent" ? "Done" : "Cancel"}</button>
                                </div>
                            </>
                        ) : null}
                    </div>
                ) : null}
                <div className="mt-2.5 flex items-center gap-1.5">
                    <button type="button" disabled={sending || (LIVE_WORKSPACE && (selectedRecipientIds.length === 0 || !bodyDraft.trim()))} onClick={() => { if (LIVE_WORKSPACE) onSendNow(); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#00A283] px-3 py-2 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(0,162,131,0.3)] disabled:opacity-40"><Send className="h-3.5 w-3.5" />{sending ? "Working…" : "Send now"}</button>
                    <button type="button" aria-label="Send later" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-2 text-sm text-alloy-midnight/80 shadow-sm"><Clock className="h-3.5 w-3.5" />Later</button>
                    <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#7fc9b6] bg-gradient-to-r from-[#eafaf4] to-[#e0f4ee] px-2.5 py-2 text-sm font-semibold text-[#0f6b4a] shadow-[0_1px_4px_rgba(0,162,131,0.18)] ring-1 ring-[#00A283]/15"><Sparkles className="h-3.5 w-3.5" />BOS Enhance</button>
                    <span className="ml-auto text-[9px] leading-tight text-alloy-midnight/40">Review-first<br />no auto-send</span>
                </div>
            </div>
        </div>
    );
}
