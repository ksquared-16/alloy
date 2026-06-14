"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, Mail, MessageSquare, Phone, StickyNote, Settings2, Bold, Italic, List, Link2, Smile, Paperclip, FileText, Sparkles, Send, Clock, Check } from "lucide-react";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import { isRecipientSelected, toggleRecipientSelection, isRecipientEligible, selectionSummary } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import { relTime, dirLabel, statusDisplay, consentMark, consentTone } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";
import type { FamilyCommunicationWorkspaceVM, TimelineEventVM, RecipientVM } from "@/lib/communications/v2/familyWorkspace/types";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";

/**
 * UI-6 — reusable Family Communication Workspace (no queue). Mirrors the locked Command Center
 * workspace pane (same structure/classes) and is mounted in the full modal AND in the Opportunity /
 * Child / Person drawer Communications tabs. Self-contained: fetches family-workspace by customerId
 * or drawer entity, supports thread select + UI-5C recipient selection + UI-5E draft + UI-5G send.
 */
type IconType = typeof Mail;
const channelIcon = (e: TimelineEventVM): IconType => {
    const k = e.kind && e.kind !== "message" ? e.kind : null;
    if (k === "note") return StickyNote;
    if (k === "system") return Settings2;
    if (k === "call") return Phone;
    if (e.channel === "sms") return MessageSquare;
    return Mail;
};
const toolbarBtn = "rounded-md p-1.5 text-alloy-midnight/55 transition hover:bg-alloy-stone/12 hover:text-alloy-midnight";

export default function FamilyCommunicationWorkspace(props: {
    customerId?: string;
    entity?: { entityType: string; entityId: string };
    channel?: "email" | "sms";
}) {
    const channel = props.channel ?? "email";
    const [vm, setVm] = useState<FamilyCommunicationWorkspaceVM | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
    const [subjectDraft, setSubjectDraft] = useState("");
    const [bodyDraft, setBodyDraft] = useState("");
    const [sendResult, setSendResult] = useState<FamilySendResult | null>(null);
    const [sending, setSending] = useState(false);

    const queryFor = useCallback(
        (threadId: string | null): string | null => {
            const base = new URLSearchParams();
            if (props.customerId) base.set("customer_id", props.customerId);
            else if (props.entity?.entityId) {
                base.set("entity_type", props.entity.entityType);
                base.set("entity_id", props.entity.entityId);
            } else return null;
            base.set("composer_channel", channel);
            if (threadId) base.set("thread_id", threadId);
            return base.toString();
        },
        [props.customerId, props.entity?.entityType, props.entity?.entityId, channel]
    );

    const load = useCallback(
        async (threadId: string | null, resetSelection: boolean) => {
            const qs = queryFor(threadId);
            if (!qs) { setLoading(false); return; }
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/admin/communications/family-workspace?${qs}`);
                const data = (await res.json()) as { workspace?: FamilyCommunicationWorkspaceVM; error?: string };
                if (!res.ok || !data.workspace) { setError(data.error ?? "Failed to load"); return; }
                setVm(data.workspace);
                if (resetSelection) setSelectedRecipientIds(data.workspace.selectedRecipients);
            } catch {
                setError("Failed to load");
            } finally {
                setLoading(false);
            }
        },
        [queryFor]
    );

    useEffect(() => {
        setSelectedThreadId(null);
        setSubjectDraft("");
        setBodyDraft("");
        setSendResult(null);
        void load(null, true);
    }, [load]);

    const openThread = useCallback((threadId: string) => { setSelectedThreadId(threadId); void load(threadId, false); }, [load]);

    const runSend = useCallback(
        async (confirm: boolean) => {
            const cust = vm?.scope.customerId;
            if (!cust || selectedRecipientIds.length === 0 || !bodyDraft.trim()) return;
            setSending(true);
            try {
                const res = await fetch("/api/admin/communications/family-send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ customer_id: cust, recipient_person_ids: selectedRecipientIds, channel, subject: subjectDraft, body: bodyDraft, reply_to_thread_id: selectedThreadId, confirm }),
                });
                const data = (await res.json()) as FamilySendResult & { error?: string };
                if (res.ok) { setSendResult(data); if (confirm) await load(selectedThreadId, false); }
            } finally {
                setSending(false);
            }
        },
        [vm, selectedRecipientIds, subjectDraft, bodyDraft, selectedThreadId, channel, load]
    );

    const events: TimelineEventVM[] = vm ? (selectedThreadId ? vm.messages : vm.timelineEvents) : [];
    const allRecipients: RecipientVM[] = vm ? vm.recipientGroups.flatMap((g) => g.recipients) : [];
    const ownerName = vm?.family.ownerLabel ?? null;
    const childNames = vm ? vm.children.map((c) => (c.ageLabel ? `${c.name} (${c.ageLabel})` : c.name)) : [];

    const health = useMemo(
        () => computeCommunicationHealth({ messages: events.filter((e) => !e.kind || e.kind === "message").map((e) => ({ direction: e.direction, created_at: e.createdAt, channel: e.channel, opened_at: e.openedAt, replied_at: e.repliedAt })) }),
        [events]
    );
    const healthLabel = health.engagementScore >= 66 ? "Healthy" : health.engagementScore >= 33 ? "At risk" : "Unresponsive";
    const healthTone = health.engagementScore >= 66 ? "text-[#0f6b4a]" : health.engagementScore >= 33 ? "text-[#9a6b16]" : "text-red-600";
    const healthDot = health.engagementScore >= 66 ? "bg-[#00A283]" : health.engagementScore >= 33 ? "bg-[#e0a32e]" : "bg-red-500";

    if (loading && !vm) return <div className="p-4 text-xs text-alloy-midnight/45">Loading conversation…</div>;
    if (error && !vm) return <div className="p-4 text-xs text-alloy-ember">{error}</div>;
    if (!vm) return <div className="p-4 text-xs text-alloy-midnight/45">No conversation.</div>;

    return (
        <section data-cc-workspace="family-communication" data-cc-drawer-workspace className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-alloy-stone/12 bg-white">
            {/* snapshot */}
            <div data-cc-ws-section="snapshot" className="shrink-0 border-b border-alloy-stone/20 bg-gradient-to-br from-[#eef7f3] via-white to-[#eef6f4] px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#dff2ea] text-[#0f6b4a] ring-1 ring-[#7fc9b6]/60"><Users className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-[15px] font-semibold leading-tight text-alloy-midnight">{vm.family.label}</h3>
                            {childNames.map((n) => (
                                <span key={n} className="inline-flex items-center rounded-full border border-[#7fc9b6]/60 bg-[#f0faf6] px-1.5 py-px text-[10px] font-medium text-[#0f6b4a]">{n}</span>
                            ))}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-alloy-midnight/60">
                            <span data-cc-ws-section="health" className={`inline-flex items-center gap-1 font-semibold ${healthTone}`}><span className={`inline-block h-1.5 w-1.5 rounded-full ${healthDot}`} />{healthLabel}</span>
                            {ownerName ? <><span className="text-alloy-midnight/25">•</span><span><span className="text-alloy-midnight/40">Assigned</span> {ownerName}</span></> : null}
                            <span className="text-alloy-midnight/25">•</span>
                            <span data-cc-ws-section="consent" className="inline-flex items-center gap-1.5">
                                <span className={`font-bold ${consentTone(vm.consentSummary.displayFlags.email)}`}>E{consentMark(vm.consentSummary.displayFlags.email)}</span>
                                <span className={`font-bold ${consentTone(vm.consentSummary.displayFlags.sms)}`}>S{consentMark(vm.consentSummary.displayFlags.sms)}</span>
                                <span className={`font-bold ${consentTone(vm.consentSummary.displayFlags.marketing)}`}>M{consentMark(vm.consentSummary.displayFlags.marketing)}</span>
                            </span>
                            {vm.family.stage ? <><span className="text-alloy-midnight/25">•</span><span className="truncate text-alloy-midnight/50">{vm.family.stage}</span></> : null}
                        </div>
                    </div>
                </div>
            </div>

            {/* timeline */}
            <div data-cc-ws-section="timeline" className="min-h-0 flex-1 overflow-auto bg-[#f6f7f5] px-3.5 py-3">
                {selectedThreadId ? (
                    <div className="mb-2 flex items-center justify-between rounded-md border border-[#7fc9b6]/50 bg-[#f0faf6] px-2 py-1 text-[10px] text-[#0f6b4a]">
                        <span>Viewing one thread</span>
                        <button type="button" onClick={() => { setSelectedThreadId(null); void load(null, false); }} className="font-semibold underline">All messages</button>
                    </div>
                ) : null}
                {events.length === 0 ? (
                    <div className="text-[11px] text-alloy-midnight/45">No communication yet.</div>
                ) : (
                    <ol data-cc-timeline className="space-y-3">
                        {events.map((e, i) => {
                            const out = e.direction === "outbound";
                            const Icon = channelIcon(e);
                            if (e.kind === "system") return <li key={e.id ?? i} className="flex items-center justify-center gap-1.5 text-[10px] text-alloy-midnight/45"><Settings2 className="h-3 w-3" /> {e.body ?? ""} · {relTime(e.createdAt)}</li>;
                            if (e.kind === "note") return <li key={e.id ?? i} className="rounded-lg border border-[#e6c98a]/60 bg-[#fbf6ea] px-3 py-1.5 text-[11px] text-[#9a6b16]"><span className="font-semibold">Internal note</span> · {e.body ?? ""}</li>;
                            const st = statusDisplay(e.status);
                            return (
                                <li key={e.id ?? i} data-cc-msg-dir={e.direction ?? ""} data-cc-thread-open={e.threadId} onClick={() => { if (e.threadId) openThread(e.threadId); }} className={`flex ${out ? "justify-end" : "justify-start"} ${e.threadId ? "cursor-pointer" : ""}`}>
                                    <div className="max-w-[88%]">
                                        <div className={`mb-0.5 flex items-center gap-1 text-[10px] text-alloy-midnight/45 ${out ? "justify-end" : ""}`}>
                                            <Icon className="h-3 w-3" />
                                            <span>· {relTime(e.createdAt)}</span>
                                            {out && st ? <span className={st.cls}>· {st.label}</span> : null}
                                        </div>
                                        <div className={`rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${out ? "rounded-tr-sm bg-[#e7f5ef] text-alloy-midnight" : "rounded-tl-sm border border-alloy-stone/15 bg-white text-alloy-midnight"}`}>{e.body ?? ""}</div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>

            {/* composer */}
            <div data-cc-ws-section="composer" className="shrink-0 border-t border-alloy-stone/20 bg-gradient-to-b from-[#fbfcfb] to-[#f3f5f2] px-3.5 py-3">
                <div data-cc-recipient-selector className="rounded-lg border border-alloy-stone/20 bg-white px-2 py-2 shadow-sm">
                    <div className="mb-1 text-[10px] font-medium text-alloy-midnight/45">To · <span className="text-alloy-midnight/70">{selectionSummary(selectedRecipientIds, allRecipients)}</span></div>
                    {vm.recipientGroups.map((g) => (
                        <div key={g.tier} className="mb-1.5 last:mb-0">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">{g.uiLabel}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                                {g.recipients.map((r) => {
                                    const elig = isRecipientEligible(r, channel);
                                    const sel = isRecipientSelected(selectedRecipientIds, r.id);
                                    if (!elig) {
                                        const reason = r.channels[channel].unavailableReason ?? "Unavailable";
                                        return <span key={r.id} title={reason} data-cc-recipient-disabled={r.id} className="inline-flex items-center gap-1 rounded-full border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-0.5 text-[10px] text-alloy-midnight/40">{r.displayName} · <span className="text-alloy-midnight/35">{reason}</span></span>;
                                    }
                                    return <button key={r.id} type="button" data-cc-recipient={r.id} aria-pressed={sel} onClick={() => setSelectedRecipientIds((prev) => toggleRecipientSelection(prev, r.id, true))} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${sel ? "bg-[#00A283] text-white" : "bg-[#eafaf3] text-[#0f6b4a] ring-1 ring-[#7fc9b6]/50 hover:ring-[#00A283]"}`}>{sel ? <Check className="h-3 w-3" /> : null}{r.displayName}</button>;
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                <input aria-label="Subject" placeholder="Subject" value={subjectDraft} onChange={(e) => setSubjectDraft(e.target.value)} className="mt-2 w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm placeholder:text-alloy-midnight/35" />
                <div className="mt-2 flex min-h-[180px] flex-col overflow-hidden rounded-lg border border-alloy-stone/20 bg-white shadow-sm">
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
                    <textarea aria-label="Message body" placeholder={`Write a message to ${vm.family.label}…`} value={bodyDraft} onChange={(e) => setBodyDraft(e.target.value)} className="w-full min-h-0 flex-1 resize-none border-0 bg-white px-3.5 py-3 text-sm leading-relaxed text-alloy-midnight placeholder:text-alloy-midnight/35 focus:outline-none" />
                </div>
                {sendResult ? (
                    <div data-cc-send-review className="mt-2 rounded-lg border border-alloy-stone/20 bg-white px-2.5 py-2 text-[11px] shadow-sm">
                        <div className="mb-1 font-semibold text-alloy-midnight">{sendResult.mode === "preflight" ? "Review before sending" : "Send results"} <span className="font-normal text-alloy-midnight/55">{sendResult.mode === "preflight" ? `${sendResult.summary.ready} ready · ${sendResult.summary.blocked} blocked` : `${sendResult.summary.sent} sent · ${sendResult.summary.blocked} blocked · ${sendResult.summary.failed} failed`}</span></div>
                        <ul className="space-y-0.5">
                            {sendResult.results.map((r) => (
                                <li key={r.person_id} className="flex items-center gap-1.5"><span className={`inline-block h-1.5 w-1.5 rounded-full ${r.status === "sent" || r.status === "ready" ? "bg-[#00A283]" : r.status === "blocked" ? "bg-[#e0a32e]" : "bg-red-500"}`} /><span className="font-medium text-alloy-midnight">{r.display_name}</span><span className="text-alloy-midnight/55">· {r.status}{r.reason ? ` — ${r.reason}` : ""}</span></li>
                            ))}
                        </ul>
                        <div className="mt-1.5 flex items-center gap-1.5">
                            {sendResult.mode === "preflight" && sendResult.summary.ready > 0 ? <button type="button" disabled={sending} onClick={() => void runSend(true)} className="rounded-md bg-[#00A283] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Confirm send ({sendResult.summary.ready})</button> : null}
                            <button type="button" onClick={() => setSendResult(null)} className="rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-[11px] text-alloy-midnight">{sendResult.mode === "sent" ? "Done" : "Cancel"}</button>
                        </div>
                    </div>
                ) : null}
                <div className="mt-2.5 flex items-center gap-1.5">
                    <button type="button" disabled={sending || selectedRecipientIds.length === 0 || !bodyDraft.trim()} onClick={() => void runSend(false)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#00A283] px-3 py-2 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(0,162,131,0.3)] disabled:opacity-40"><Send className="h-3.5 w-3.5" />{sending ? "Working…" : "Send now"}</button>
                    <button type="button" aria-label="Send later" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-2 text-sm text-alloy-midnight/80 shadow-sm"><Clock className="h-3.5 w-3.5" />Later</button>
                    <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#7fc9b6] bg-gradient-to-r from-[#eafaf4] to-[#e0f4ee] px-2.5 py-2 text-sm font-semibold text-[#0f6b4a] shadow-[0_1px_4px_rgba(0,162,131,0.18)] ring-1 ring-[#00A283]/15"><Sparkles className="h-3.5 w-3.5" />BOS Enhance</button>
                    <span className="ml-auto text-[9px] leading-tight text-alloy-midnight/40">Review-first<br />no auto-send</span>
                </div>
            </div>
        </section>
    );
}
