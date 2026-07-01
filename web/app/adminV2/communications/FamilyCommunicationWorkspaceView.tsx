"use client";

import { Users, Mail, MessageSquare, Phone, StickyNote, Settings2, Bold, Italic, List, Link2, Smile, Paperclip, FileText, Sparkles, Send, Clock, Check, UserPlus, ChevronDown } from "lucide-react";
import { relTime, statusDisplay } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";
import CommunicationPreferencesEditor from "@/components/admin/communications/CommunicationPreferencesEditor";
import type { PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";
import type { PreferenceFieldKey } from "@/lib/communications/v2/communicationPreferenceLabels";
import { TRIAGE_OPERATOR_ACTIONS, conversationAttentionLabel, type TriageActionKey } from "@/lib/communications/v2/conversationTriage";
import type { WorkspaceMode, WorkspaceModeAvailability } from "@/lib/communications/v2/workspaceModeAvailability";
import type { RelatedTaskBrief } from "@/lib/communications/v2/familyWorkspace/types";
import { isRecipientEligible, isRecipientSelected, selectionSummary } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type { ConsentState, RecipientGroup, ComposerChannel } from "@/lib/communications/v2/familyWorkspace/types";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import type { CommandCenterRecordLink } from "@/lib/communications/v2/commandCenterRecordLinks";
import {
    COMMS_ACCENT_BG_SUBTLE_CLASS,
    COMMS_ACCENT_BORDER_CLASS,
    COMMS_NOTE_BANNER_CLASS,
    COMMS_OUTBOUND_BUBBLE_CLASS,
    COMMS_OUTLINE_ACCENT_SOFT_BTN_CLASS,
    COMMS_PRIMARY_BTN_CLASS,
    COMMS_SECONDARY_BTN_CLASS,
    COMMS_SURFACE_MUTED_CLASS,
    COMMS_UTILITY_CARD_CLASS,
} from "@/app/adminV2/communications/commsWorkspaceUi";

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
    preferenceProfile?: PersonPreferenceProfile;
};
export type WorkspaceSelected = { id: string; family_label?: string | null; sla_state?: string | null; assignment_state?: string | null; attention_state?: string | null };

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
    stageLabel?: string | null;
    healthTone: string;
    healthDot: string;
    healthLabel: string | null;
    recordLinks?: CommandCenterRecordLink[];
    onOpenRecordLink?: (link: CommandCenterRecordLink) => void;
    showClaim?: boolean;
    workspaceMode?: WorkspaceMode;
    onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
    workspaceModeAvailability?: WorkspaceModeAvailability;
    relatedTasks?: RelatedTaskBrief[];
    preferenceProfile?: PersonPreferenceProfile;
    canEditPreferences?: boolean;
    preferenceSaving?: boolean;
    onPreferenceChange?: (field: PreferenceFieldKey, status: "Allowed" | "Blocked") => void;
    attentionLabel?: string | null;
    onTriage?: (action: TriageActionKey) => void;
    triageBusy?: boolean;
    noteDraft?: string;
    onNoteDraftChange?: (v: string) => void;
    onAddNote?: () => void;
    noteSaving?: boolean;
    noteError?: string | null;
    taskTitleDraft?: string;
    taskDueDraft?: string;
    onTaskTitleChange?: (v: string) => void;
    onTaskDueChange?: (v: string) => void;
    onCreateTask?: () => void;
    onCompleteTask?: (taskId: string) => void;
    taskSaving?: boolean;
    taskError?: string | null;
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
        selected, detail, childNames, stageLabel, healthTone, healthDot, healthLabel, recordLinks, onOpenRecordLink,
        showClaim = false, workspaceMode = "email", onWorkspaceModeChange, workspaceModeAvailability,
        relatedTasks = [], preferenceProfile, canEditPreferences = false, preferenceSaving = false, onPreferenceChange,
        attentionLabel, onTriage, triageBusy = false,
        noteDraft = "", onNoteDraftChange, onAddNote, noteSaving = false, noteError,
        taskTitleDraft = "", taskDueDraft = "", onTaskTitleChange, onTaskDueChange, onCreateTask, onCompleteTask, taskSaving = false, taskError,
        LIVE_WORKSPACE, selectedThreadId, messages,
        liveRecipientGroups, selectedRecipientIds, liveChannel, subjectDraft, bodyDraft, sendResult, sendError, sending, assignBusy,
        onClaim, onAllMessages, onOpenThread, onToggleRecipient, onSubjectChange, onBodyChange, onSendNow, onConfirmSend, onDismissSend,
    } = props;
    const allLiveRecipients = liveRecipientGroups ? liveRecipientGroups.flatMap((g) => g.recipients) : [];
    const resolvedPreferenceProfile = preferenceProfile ?? detail?.preferenceProfile;
    const familyLink = recordLinks?.find((l) => l.type === "customers");
    const contactLink = recordLinks?.find((l) => l.type === "persons");
    const opportunityLink = recordLinks?.find((l) => l.type === "opportunities");
    const childRecordLinks = recordLinks?.filter((l) => l.type === "customer_members") ?? [];
    const displayStage = stageLabel ?? detail?.stage ?? null;
    const stageLink =
        opportunityLink && displayStage ? { ...opportunityLink, label: displayStage } : opportunityLink ?? null;
    const modeAvailability = workspaceModeAvailability ?? {
        email: { available: true, reason: null },
        sms: { available: false, reason: "SMS unavailable because no SMS-capable recipient exists." },
        note: { available: true, reason: null },
        tasks: { available: false, reason: "No enrollment opportunity is linked to this family." },
    };
    const noteMessages = messages.filter((m) => m.kind === "note");
    const composeMode = workspaceMode === "email" || workspaceMode === "sms";
    const activeModeReason =
        workspaceMode === "note" || workspaceMode === "tasks" ? null : modeAvailability[workspaceMode]?.reason ?? null;

    const renderModeTab = (mode: WorkspaceMode, label: string) => {
        const status = modeAvailability[mode];
        const active = workspaceMode === mode;
        return (
            <button
                key={mode}
                type="button"
                data-cc-workspace-mode={mode}
                aria-pressed={active}
                onClick={() => onWorkspaceModeChange?.(mode)}
                className={`border-l border-alloy-stone/15 px-2.5 py-1 first:border-l-0 ${active ? "bg-alloy-juniper font-semibold text-white" : status.available ? "text-alloy-midnight/70 hover:bg-alloy-stone/[0.04]" : "text-alloy-midnight/45 hover:bg-alloy-stone/[0.04]"}`}
            >
                {label}
            </button>
        );
    };

    const renderLinkChip = (link: CommandCenterRecordLink, className: string) => (
        <button
            key={`${link.type}:${link.id}`}
            type="button"
            data-cc-record-link={link.type}
            onClick={() => onOpenRecordLink?.(link)}
            className={className}
        >
            {link.label}
        </button>
    );

    return (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(380px,1.35fr)] gap-0">
            {/* CONVERSATION — compact snapshot band + chat history */}
            <div data-cc-ws-column="timeline" className="flex min-h-0 flex-col border-r border-alloy-stone/20 bg-white">
                <div data-cc-ws-section="snapshot" className="shrink-0 border-b border-alloy-stone/15 bg-white px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alloy-juniper/15 text-alloy-juniper ring-1 ring-alloy-juniper/60">
                            <Users className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                                {familyLink && onOpenRecordLink ? (
                                    renderLinkChip(familyLink, "truncate text-[15px] font-semibold leading-tight text-alloy-juniper underline decoration-alloy-juniper/70 underline-offset-2 hover:text-alloy-juniper/90")
                                ) : (
                                    <h3 className="truncate text-[15px] font-semibold leading-tight text-alloy-midnight">{selected.family_label ?? "Family"}</h3>
                                )}
                                {childRecordLinks.length && onOpenRecordLink
                                    ? childRecordLinks.map((link) =>
                                          renderLinkChip(
                                              link,
                                              "inline-flex items-center rounded-full border border-alloy-juniper/60 bg-alloy-juniper/10 px-1.5 py-px text-[10px] font-medium text-alloy-juniper hover:bg-alloy-juniper/10"
                                          )
                                      )
                                    : childNames.map((n) => (
                                          <span key={n} className="inline-flex items-center rounded-full border border-alloy-juniper/60 bg-alloy-juniper/10 px-1.5 py-px text-[10px] font-medium text-alloy-juniper">
                                              {n}
                                          </span>
                                      ))}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-alloy-midnight/60">
                                {healthLabel ? (
                                    <span data-cc-ws-section="health" className={`inline-flex items-center gap-1 font-semibold ${healthTone}`}>
                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${healthDot}`} />{healthLabel}
                                    </span>
                                ) : null}
                                {contactLink && onOpenRecordLink ? (
                                    <>
                                        {healthLabel ? <span className="text-alloy-midnight/25">•</span> : null}
                                        <span className="text-alloy-midnight/50">Parent</span>
                                        {renderLinkChip(contactLink, "font-medium text-alloy-juniper underline decoration-alloy-juniper/60 underline-offset-2 hover:text-alloy-juniper/90")}
                                    </>
                                ) : detail?.contactName ? (
                                    <>
                                        {healthLabel ? <span className="text-alloy-midnight/25">•</span> : null}
                                        <span className="text-alloy-midnight/50">Parent · {detail.contactName}</span>
                                    </>
                                ) : null}
                                {displayStage ? (
                                    <>
                                        <span className="text-alloy-midnight/25">•</span>
                                        {stageLink && onOpenRecordLink ? (
                                            renderLinkChip(stageLink, "truncate font-medium text-alloy-midnight/60 underline decoration-alloy-stone/30 underline-offset-2 hover:text-alloy-juniper")
                                        ) : (
                                            <span className="truncate text-alloy-midnight/60">{displayStage}</span>
                                        )}
                                    </>
                                ) : null}
                            </div>
                            <div data-cc-ws-section="triage" className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-medium text-alloy-midnight/50">Queue</span>
                                <span className="rounded-full border border-alloy-stone/15 bg-white px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/70">
                                    {attentionLabel ?? conversationAttentionLabel(selected.attention_state as string | null)}
                                </span>
                                {onTriage ?
                                    TRIAGE_OPERATOR_ACTIONS.map((action) => (
                                        <button
                                            key={action.key}
                                            type="button"
                                            data-cc-triage={action.key}
                                            disabled={triageBusy}
                                            onClick={() => onTriage(action.key)}
                                            className="rounded-full border border-alloy-stone/20 bg-white px-2 py-0.5 text-[10px] text-alloy-midnight/60 hover:border-alloy-juniper/50 hover:text-alloy-juniper"
                                        >
                                            {action.label}
                                        </button>
                                    ))
                                : null}
                            </div>
                            {resolvedPreferenceProfile ? (
                                <div data-cc-ws-section="preferences" className={`mt-2 ${COMMS_UTILITY_CARD_CLASS}`}>
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">Communication preferences</div>
                                    <div className="mt-1.5">
                                        <CommunicationPreferencesEditor
                                            profile={resolvedPreferenceProfile}
                                            canEdit={canEditPreferences}
                                            saving={preferenceSaving}
                                            onChange={onPreferenceChange}
                                            compact
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        {showClaim ? (
                            <button
                                type="button"
                                data-cc-claim
                                disabled={assignBusy || selected.assignment_state === "assigned"}
                                onClick={() => onClaim(selected.id)}
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm transition ${
                                    selected.assignment_state === "assigned"
                                        ? `${COMMS_ACCENT_BORDER_CLASS} ${COMMS_ACCENT_BG_SUBTLE_CLASS} text-alloy-juniper`
                                        : `${COMMS_PRIMARY_BTN_CLASS} !rounded-full !px-2.5 !py-1 !text-[10px]`
                                }`}
                            >
                                {selected.assignment_state === "assigned" ? "Assigned" : "Claim"}
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* conversation history — reads like a chat */}
                <div data-cc-ws-section="timeline" className={`min-h-0 flex-1 overflow-auto ${COMMS_SURFACE_MUTED_CLASS} px-3.5 py-3`}>
                    {LIVE_WORKSPACE && selectedThreadId ? (
                        <div className="mb-2 flex items-center justify-between rounded-md border border-alloy-juniper/50 bg-alloy-juniper/10 px-2 py-1 text-[10px] text-alloy-juniper">
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
                                        <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} className={COMMS_NOTE_BANNER_CLASS}>
                                            <span className="font-semibold">Internal note</span> · {m.body ?? ""}
                                        </li>
                                    );
                                }
                                const sender = out ? (detail?.owner ?? "Staff") : (detail?.contactName ?? selected.family_label ?? "Family");
                                return (
                                    <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} data-cc-thread-open={m.thread_id ?? undefined} onClick={() => { if (LIVE_WORKSPACE && m.thread_id) onOpenThread(m.thread_id); }} className={`flex ${out ? "justify-end" : "justify-start"} ${LIVE_WORKSPACE && m.thread_id ? "cursor-pointer" : ""}`}>
                                        <div className="max-w-[88%] min-w-0">
                                            <div className={`mb-0.5 flex items-center gap-1 text-[10px] text-alloy-midnight/45 ${out ? "justify-end" : ""}`}>
                                                <Icon className="h-3 w-3 shrink-0" />
                                                <span className="font-semibold text-alloy-midnight/60">{sender}</span>
                                                <span>· {relTime(m.created_at)}</span>
                                                {out && statusDisplay(m.status) ? <span className={statusDisplay(m.status)!.cls}>· {statusDisplay(m.status)!.label}</span> : null}
                                            </div>
                                            <div
                                                data-cc-msg-bubble
                                                className={`max-w-full break-words rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm [overflow-wrap:anywhere] whitespace-pre-wrap ${
                                                    out
                                                        ? COMMS_OUTBOUND_BUBBLE_CLASS
                                                        : "rounded-tl-sm border border-alloy-stone/15 bg-white text-alloy-midnight"
                                                }`}
                                            >
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
            <div data-cc-ws-column="composer" data-cc-ws-section="composer" className="flex min-h-0 flex-col bg-white px-4 py-3">
                <div data-cc-composer-channels className="inline-flex w-fit overflow-hidden rounded-lg border border-alloy-stone/20 bg-white text-[11px] shadow-sm">
                    {renderModeTab("email", "Email")}
                    {renderModeTab("sms", "SMS")}
                    {renderModeTab("note", "Notes")}
                    {renderModeTab("tasks", "Tasks")}
                </div>
                {activeModeReason ? (
                    <div data-cc-mode-unavailable className={`mt-2 ${COMMS_UTILITY_CARD_CLASS} text-[11px] text-alloy-midnight/60`}>
                        {activeModeReason}
                    </div>
                ) : null}

                {workspaceMode === "tasks" ? (
                    <div data-cc-tasks-panel className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
                        <div className="rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">New task</div>
                            <input aria-label="Task title" value={taskTitleDraft} onChange={(e) => onTaskTitleChange?.(e.target.value)} placeholder="Task title" className="mt-1 w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm" />
                            <input aria-label="Due date" type="datetime-local" value={taskDueDraft} onChange={(e) => onTaskDueChange?.(e.target.value)} className="mt-1 w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm" />
                            {taskError ? <div className="mt-1 text-[11px] text-alloy-ember">{taskError}</div> : null}
                            <button type="button" data-cc-new-task disabled={taskSaving || !taskTitleDraft.trim()} onClick={() => onCreateTask?.()} className="mt-2 rounded-md bg-alloy-juniper px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">{taskSaving ? "Working…" : "New task"}</button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">Related tasks</div>
                            {relatedTasks.length === 0 ? (
                                <p className="mt-2 text-[11px] text-alloy-midnight/50">No open tasks for the linked opportunity.</p>
                            ) : (
                                <ul className="mt-2 space-y-1.5">
                                    {relatedTasks.map((t) => (
                                        <li key={t.id} className={`flex items-start justify-between gap-2 ${COMMS_UTILITY_CARD_CLASS} text-[11px]`}>
                                            <div>
                                                <div className="font-medium text-alloy-midnight">{t.title}</div>
                                                <div className="mt-0.5 text-alloy-midnight/50">Due {relTime(t.dueAt) || t.dueAt} · {t.status}</div>
                                            </div>
                                            {t.status === "open" && onCompleteTask ? (
                                                <button type="button" data-cc-complete-task={t.id} disabled={taskSaving} onClick={() => onCompleteTask(t.id)} className="shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold text-alloy-juniper ring-1 ring-alloy-juniper/50 hover:bg-alloy-juniper/10">Complete</button>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                ) : workspaceMode === "note" ? (
                    <div data-cc-notes-panel className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
                        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">Internal notes</div>
                            {noteMessages.length === 0 ? (
                                <p className="mt-2 text-[11px] text-alloy-midnight/50">No notes yet.</p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {noteMessages.map((m) => (
                                        <li key={m.id ?? m.created_at} className={`${COMMS_UTILITY_CARD_CLASS} text-[11px] text-alloy-midnight/75`}>
                                            <div className="mb-1 text-[10px] text-alloy-midnight/45">{relTime(m.created_at)}</div>
                                            <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="rounded-lg border border-alloy-stone/20 bg-white p-2 shadow-sm">
                            <div className="text-[10px] font-semibold text-alloy-midnight/50">Internal note</div>
                            <textarea aria-label="Internal note" value={noteDraft} onChange={(e) => onNoteDraftChange?.(e.target.value)} placeholder="Add an internal note for this family…" className="mt-1 min-h-[88px] w-full resize-y rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm text-alloy-midnight" />
                            {noteError ? <div className="mt-1 text-[11px] text-alloy-ember">{noteError}</div> : null}
                            <button type="button" data-cc-add-note disabled={noteSaving || !noteDraft.trim()} onClick={() => onAddNote?.()} className="mt-2 rounded-md bg-alloy-juniper px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">{noteSaving ? "Saving…" : "Add note"}</button>
                        </div>
                    </div>
                ) : composeMode ? (
                <>
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
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${sel ? "bg-alloy-juniper text-white" : "bg-alloy-juniper/10 text-alloy-juniper ring-1 ring-alloy-juniper/50 hover:ring-alloy-juniper"}`}>
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-alloy-juniper/10 px-2 py-0.5 text-[10px] font-medium text-alloy-juniper ring-1 ring-alloy-juniper/50">
                            {detail ? detail.contactName : (selected.family_label ?? "")}
                        </span>
                        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-alloy-stone/30 px-2 py-0.5 text-[10px] text-alloy-midnight/50 hover:border-alloy-juniper/50 hover:text-alloy-juniper">
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
                    className={`mt-2 w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm placeholder:text-alloy-midnight/35 ${workspaceMode === "sms" ? "hidden" : ""}`}
                />

                <div className="mt-2 flex min-h-[240px] flex-1 flex-col overflow-hidden rounded-lg border border-alloy-stone/20 bg-white shadow-sm">
                    <div className={`flex items-center gap-0.5 border-b border-alloy-stone/12 ${COMMS_SURFACE_MUTED_CLASS} px-1.5 py-1`}>
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
                                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${r.status === "sent" || r.status === "ready" ? "bg-alloy-juniper" : r.status === "blocked" ? "bg-alloy-amber" : "bg-red-500"}`} />
                                            <span className="font-medium text-alloy-midnight">{r.display_name}</span>
                                            <span className="text-alloy-midnight/55">· {r.status}{r.reason ? ` — ${r.reason}` : ""}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    {sendResult.mode === "preflight" && sendResult.summary.ready > 0 ? (
                                        <button type="button" disabled={sending} onClick={onConfirmSend} className="rounded-md bg-alloy-juniper px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Confirm send ({sendResult.summary.ready})</button>
                                    ) : null}
                                    <button type="button" onClick={onDismissSend} className="rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-[11px] text-alloy-midnight">{sendResult.mode === "sent" ? "Done" : "Cancel"}</button>
                                </div>
                            </>
                        ) : null}
                    </div>
                ) : null}
                <div className="mt-2.5 flex items-center gap-1.5">
                    <button type="button" disabled={sending || !modeAvailability[workspaceMode]?.available || (LIVE_WORKSPACE && (selectedRecipientIds.length === 0 || !bodyDraft.trim()))} onClick={() => { if (LIVE_WORKSPACE) onSendNow(); }} className={`inline-flex shrink-0 items-center gap-1.5 ${COMMS_PRIMARY_BTN_CLASS} !px-3 !py-2 !text-sm disabled:opacity-40`}><Send className="h-3.5 w-3.5" />{sending ? "Working…" : workspaceMode === "sms" ? "Send SMS" : "Send now"}</button>
                    <button type="button" aria-label="Send later" className={`inline-flex shrink-0 items-center gap-1 ${COMMS_SECONDARY_BTN_CLASS} !px-2.5 !py-2 !text-sm`}><Clock className="h-3.5 w-3.5" />Later</button>
                    <button type="button" className={COMMS_OUTLINE_ACCENT_SOFT_BTN_CLASS}><Sparkles className="h-3.5 w-3.5" />BOS Enhance</button>
                    <span className="ml-auto text-[9px] leading-tight text-alloy-midnight/40">Review-first<br />manual send only</span>
                </div>
                </>
                ) : null}
            </div>
        </div>
    );
}
