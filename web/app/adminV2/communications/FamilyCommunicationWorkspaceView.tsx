"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Mail, MessageSquare, Phone, StickyNote, Settings2, Bold, Italic, Underline, List, Link2, Smile, Paperclip, FileText, Send, Clock, Check, UserPlus, ChevronDown, Plus } from "lucide-react";
import { relTime, messageDeliveryDisplay } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";
import CommunicationPreferencesEditor from "@/components/admin/communications/CommunicationPreferencesEditor";
import type { PersonPreferenceProfile, RecipientVM, ThreadVM } from "@/lib/communications/v2/familyWorkspace/types";
import type { PreferenceFieldKey } from "@/lib/communications/v2/communicationPreferenceLabels";
import { TRIAGE_OPERATOR_ACTIONS, conversationAttentionLabel, type TriageActionKey } from "@/lib/communications/v2/conversationTriage";
import type { WorkspaceMode, WorkspaceModeAvailability } from "@/lib/communications/v2/workspaceModeAvailability";
import type { RelatedTaskBrief } from "@/lib/communications/v2/familyWorkspace/types";
import { isRecipientEligible, isRecipientSelected, selectionSummary } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type { ConsentState, RecipientGroup, ComposerChannel } from "@/lib/communications/v2/familyWorkspace/types";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import type { CommandCenterRecordLink } from "@/lib/communications/v2/commandCenterRecordLinks";
import type { FamilyWorkspaceSurfaceVariant } from "@/lib/communications/v2/familyWorkspace/surfaceVariant";
import {
    deriveThreadChannelLabel,
    deriveThreadHeaderSummary,
    deriveThreadLastPreview,
    deriveThreadMessageSubject,
    deriveThreadTopicTitle,
    deriveMessageSenderLabel,
    formatThreadParticipantNames,
    resolveThreadRecipients,
    threadsForActivityTopicRail,
} from "@/lib/communications/v2/familyWorkspace/threadTopicPresentation";
import {
    deriveActivityCommsCompositionState,
    shouldShowActivityTopicRail,
} from "@/lib/presentation/adaptiveWorkspacePresentation";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import ComposerScheduleSendModal from "@/components/adminV2/messaging/ComposerScheduleSendModal";
import ComposerBosEnhanceModal from "@/components/adminV2/messaging/ComposerBosEnhanceModal";
import { resolveComposeNewScheduleContext } from "@/lib/adminV2/messaging/messagingComposerScheduleContext";
import {
    insertTextareaLink,
    prefixTextareaLines,
    wrapTextareaSelection,
} from "@/app/adminV2/communications/activityEmbedTextFormatting";
import { formatComposerBodyForDisplay } from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";
import {
    COMMS_ACCENT_BG_SUBTLE_CLASS,
    COMMS_ACCENT_BORDER_CLASS,
    COMMS_ACTIVITY_PRIMARY_BTN_CLASS,
    COMMS_ACTIVITY_SECONDARY_BTN_CLASS,
    COMMS_NOTE_BANNER_CLASS,
    COMMS_OUTBOUND_BUBBLE_CLASS,
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
    recipient_person_id?: string | null;
    sender_user_id?: string | null;
    sender_display_name?: string | null;
    opened_at?: string | null;
    delivered_at?: string | null;
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

function threadDisplayTitle(thread: ThreadVM, previewMessages: WorkspaceTimelineMessage[] = []): string {
    return deriveThreadTopicTitle({
        thread,
        messageSubject: deriveThreadMessageSubject(thread.id, previewMessages),
    });
}

function ThreadChannelIcon({ channel, className = "h-3.5 w-3.5" }: { channel: string | null | undefined; className?: string }) {
    const Icon = channel === "sms" ? MessageSquare : Mail;
    return <Icon className={className} aria-hidden />;
}

function ThreadParticipantAvatars({ participants, threadId }: { participants: RecipientVM[]; threadId: string }) {
    const visible = participants.slice(0, 2);
    const overflow = participants.length - visible.length;
    const title = formatThreadParticipantNames(participants, 6);
    if (visible.length === 0) {
        return (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-alloy-stone/20 bg-alloy-stone/[0.06] text-alloy-juniper">
                <Users className="h-3 w-3" aria-hidden />
            </span>
        );
    }
    return (
        <span className="relative flex shrink-0 items-center" data-cc-thread-avatars={threadId} title={title}>
            {visible.map((person, index) => (
                <span
                    key={person.id}
                    className={index > 0 ? "-ml-1.5 ring-2 ring-white rounded-full" : "ring-2 ring-white rounded-full"}
                    style={{ zIndex: visible.length - index }}
                >
                    <CardAvatar name={person.displayName} size={visible.length === 1 ? 26 : 24} />
                </span>
            ))}
            {overflow > 0 ? (
                <span className="-ml-1.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-alloy-stone/15 px-1 text-[9px] font-semibold text-alloy-midnight/60 ring-2 ring-white">
                    +{overflow}
                </span>
            ) : null}
        </span>
    );
}

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
    surfaceVariant?: FamilyWorkspaceSurfaceVariant;
    /** Opportunity anchor for Send-later scheduling context (null when not opportunity-linked). */
    anchorOpportunityId?: string | null;
    threads?: ThreadVM[];
    onNewMessage?: () => void;
    LIVE_WORKSPACE: boolean;
    selectedThreadId: string | null;
    selectedThread?: ThreadVM | null;
    messages: WorkspaceTimelineMessage[];
    /** Full-family timeline for Activity topic previews (activity_embed only). */
    timelineMessages?: WorkspaceTimelineMessage[];
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
    /** Current operator user id for outbound "Sent by you" labeling (activity embed). */
    viewerUserId?: string | null;
    /** Increments after a confirmed send — collapses Activity reply composer. */
    sendCompleteToken?: number;
};

export default function FamilyCommunicationWorkspaceView(props: FamilyCommunicationWorkspaceViewProps) {
    const {
        selected, detail, childNames, stageLabel, healthTone, healthDot, healthLabel, recordLinks, onOpenRecordLink,
        showClaim = false, workspaceMode = "email", onWorkspaceModeChange, workspaceModeAvailability,
        relatedTasks = [], preferenceProfile, canEditPreferences = false, preferenceSaving = false, onPreferenceChange,
        attentionLabel, onTriage, triageBusy = false,
        noteDraft = "", onNoteDraftChange, onAddNote, noteSaving = false, noteError,
        taskTitleDraft = "", taskDueDraft = "", onTaskTitleChange, onTaskDueChange, onCreateTask, onCompleteTask, taskSaving = false, taskError,
        surfaceVariant = "default", threads = [], onNewMessage, anchorOpportunityId = null,
        LIVE_WORKSPACE, selectedThreadId, selectedThread = null, messages, timelineMessages = [],
        liveRecipientGroups, selectedRecipientIds, liveChannel, subjectDraft, bodyDraft, sendResult, sendError, sending, assignBusy,
        onClaim, onAllMessages, onOpenThread, onToggleRecipient, onSubjectChange, onBodyChange, onSendNow, onConfirmSend, onDismissSend,
        viewerUserId = null, sendCompleteToken = 0,
    } = props;
    const isActivityEmbed = surfaceVariant === "activity_embed";
    const isWorkspaceInbox = surfaceVariant === "workspace_inbox";
    const usesReplyLifecycle = isActivityEmbed || isWorkspaceInbox;
    const isNewMessageMode = usesReplyLifecycle && selectedThreadId == null;
    const [replyComposerExpanded, setReplyComposerExpanded] = useState(false);
    const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [showManualEmailInput, setShowManualEmailInput] = useState(false);
    const [manualEmailDraft, setManualEmailDraft] = useState("");
    const [ccEmailDraft, setCcEmailDraft] = useState("");
    const [bccEmailDraft, setBccEmailDraft] = useState("");
    const [composerLocalEmails, setComposerLocalEmails] = useState<string[]>([]);
    const [composerCcEmails, setComposerCcEmails] = useState<string[]>([]);
    const [composerBccEmails, setComposerBccEmails] = useState<string[]>([]);
    // Canonical composer footer controls (Send later / BOS) — wired to the shared modals.
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [bosOpen, setBosOpen] = useState(false);
    const scheduleContext = resolveComposeNewScheduleContext({
        opportunityId: anchorOpportunityId,
        recipientPersonIds: selectedRecipientIds,
    });
    const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const bodyEditableRef = useRef<HTMLDivElement | null>(null);
    const timelineScrollRef = useRef<HTMLDivElement | null>(null);
    const emailComposer = workspaceMode === "email";

    useEffect(() => {
        if (!usesReplyLifecycle) return;
        setReplyComposerExpanded(isNewMessageMode);
    }, [usesReplyLifecycle, selectedThreadId, isNewMessageMode]);

    useEffect(() => {
        if (!usesReplyLifecycle || sendCompleteToken === 0) return;
        setReplyComposerExpanded(false);
        window.requestAnimationFrame(() => {
            timelineScrollRef.current?.scrollTo({ top: timelineScrollRef.current.scrollHeight, behavior: "smooth" });
        });
    }, [usesReplyLifecycle, sendCompleteToken]);

    useEffect(() => {
        if (!emailComposer || !bodyEditableRef.current) return;
        if (!bodyDraft.trim() && bodyEditableRef.current.innerHTML !== "") {
            bodyEditableRef.current.innerHTML = "";
        }
    }, [bodyDraft, emailComposer]);

    const expandReplyComposer = useCallback(() => {
        setReplyComposerExpanded(true);
        window.requestAnimationFrame(() => bodyTextareaRef.current?.focus());
    }, []);
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
    const activityPrimaryBtnClass = isActivityEmbed ? COMMS_ACTIVITY_PRIMARY_BTN_CLASS : `${COMMS_PRIMARY_BTN_CLASS} !px-3 !py-2 !text-sm`;
    const activitySecondaryBtnClass = isActivityEmbed ? COMMS_ACTIVITY_SECONDARY_BTN_CLASS : `${COMMS_SECONDARY_BTN_CLASS} !px-2.5 !py-2 !text-sm`;
    const showRuntimeComposer = !usesReplyLifecycle || isNewMessageMode || replyComposerExpanded;
    const activeModeReason =
        workspaceMode === "note" || workspaceMode === "tasks" ? null : modeAvailability[workspaceMode]?.reason ?? null;

    const applyBodyFormat = useCallback(
        (kind: "bold" | "italic" | "underline" | "list" | "link") => {
            if (emailComposer && bodyEditableRef.current) {
                const el = bodyEditableRef.current;
                el.focus();
                if (kind === "bold") document.execCommand("bold");
                else if (kind === "italic") document.execCommand("italic");
                else if (kind === "underline") document.execCommand("underline");
                else if (kind === "list") document.execCommand("insertUnorderedList");
                else if (kind === "link") {
                    const url = window.prompt("Link URL", "https://");
                    if (url?.trim()) document.execCommand("createLink", false, url.trim());
                }
                onBodyChange(el.innerHTML);
                return;
            }
            const el = bodyTextareaRef.current;
            if (!el) return;
            const start = el.selectionStart ?? 0;
            const end = el.selectionEnd ?? 0;
            let result: { next: string; cursorStart: number; cursorEnd: number } | null = null;
            if (kind === "bold") result = wrapTextareaSelection(bodyDraft, start, end, "**", "**");
            else if (kind === "italic") result = wrapTextareaSelection(bodyDraft, start, end, "_", "_");
            else if (kind === "underline") result = wrapTextareaSelection(bodyDraft, start, end, "__", "__");
            else if (kind === "list") result = prefixTextareaLines(bodyDraft, start, end, "- ");
            else result = insertTextareaLink(bodyDraft, start, end);
            if (!result) return;
            onBodyChange(result.next);
            requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(result!.cursorStart, result!.cursorEnd);
            });
        },
        [bodyDraft, emailComposer, onBodyChange],
    );

    const addComposerLocalEmail = useCallback((raw: string, target: "to" | "cc" | "bcc") => {
        const email = raw.trim();
        if (!email || !email.includes("@")) return;
        const append = (prev: string[]) => (prev.includes(email) ? prev : [...prev, email]);
        if (target === "to") setComposerLocalEmails((prev) => append(prev));
        else if (target === "cc") setComposerCcEmails((prev) => append(prev));
        else setComposerBccEmails((prev) => append(prev));
    }, []);

    const selectedRecipientRows = selectedRecipientIds
        .map((id) => allLiveRecipients.find((r) => r.id === id))
        .filter((r): r is RecipientVM => Boolean(r));

    const renderRecipientTiers = (compact?: boolean) =>
        liveRecipientGroups?.map((g) => (
            <div key={g.tier} className={compact ? "mb-1 last:mb-0" : "mb-1.5 last:mb-0"}>
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
        ));

    const renderModeTab = (mode: WorkspaceMode, label: string) => {
        const status = modeAvailability[mode];
        const active = workspaceMode === mode;
        return (
            <button
                key={mode}
                type="button"
                data-cc-workspace-mode={mode}
                aria-pressed={active}
                disabled={!status.available}
                title={!status.available ? status.reason ?? `${label} is unavailable` : undefined}
                onClick={() => {
                    if (status.available) onWorkspaceModeChange?.(mode);
                }}
                className={`border-l border-alloy-stone/15 px-2.5 py-1 first:border-l-0 disabled:cursor-not-allowed disabled:opacity-45 ${active ? "bg-alloy-juniper font-semibold text-white" : status.available ? "text-alloy-midnight/70 hover:bg-alloy-stone/[0.04]" : "text-alloy-midnight/45"}`}
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

    const snapshotBand = (
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
    );

    const messageListBody = messages.length === 0 ? (
                        <div className="text-[11px] text-alloy-midnight/45">No communication yet.</div>
                    ) : (
                        <ol data-cc-timeline className="space-y-3">
                            {messages.map((m, i) => {
                                const isSystem = m.kind === "system";
                                const isNote = m.kind === "note";
                                const out = m.direction === "outbound";
                                const Icon = channelIcon(m);
                                const recipientPerson = m.recipient_person_id
                                    ? allLiveRecipients.find((r) => r.id === m.recipient_person_id)
                                    : null;
                                const sender = deriveMessageSenderLabel(
                                    {
                                        direction: m.direction,
                                        senderUserId: m.sender_user_id,
                                        senderDisplayName: m.sender_display_name,
                                        recipientPersonId: m.recipient_person_id,
                                    },
                                    {
                                        currentUserId: viewerUserId,
                                        inboundContactName: detail?.contactName ?? selected.family_label ?? "Family",
                                        recipientDisplayName: recipientPerson?.displayName ?? null,
                                    },
                                );
                                const delivery = out
                                    ? messageDeliveryDisplay(m.status, m.channel, {
                                          openedAt: m.opened_at,
                                          deliveredAt: m.delivered_at,
                                      })
                                    : null;
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
                                return (
                                    <li key={m.id ?? i} data-cc-msg-dir={m.direction ?? ""} data-cc-thread-open={m.thread_id ?? undefined} onClick={() => { if (LIVE_WORKSPACE && m.thread_id) onOpenThread(m.thread_id); }} className={`flex ${out ? "justify-end" : "justify-start"} ${LIVE_WORKSPACE && m.thread_id ? "cursor-pointer" : ""}`}>
                                        <div className="max-w-[88%] min-w-0">
                                            <div className={`mb-0.5 flex items-center gap-1 text-[10px] text-alloy-midnight/45 ${out ? "justify-end" : ""}`}>
                                                <Icon className="h-3 w-3 shrink-0" />
                                                <span className="font-semibold text-alloy-midnight/60">{sender}</span>
                                                <span>· {relTime(m.created_at)}</span>
                                                {delivery ? <span className={delivery.cls}>· {delivery.label}</span> : null}
                                            </div>
                                            <div
                                                data-cc-msg-bubble
                                                className={`max-w-full break-words rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm [overflow-wrap:anywhere] ${
                                                    out
                                                        ? COMMS_OUTBOUND_BUBBLE_CLASS
                                                        : "rounded-tl-sm border border-alloy-stone/15 bg-white text-alloy-midnight"
                                                }`}
                                            >
                                                {(() => {
                                                    const formatted = formatComposerBodyForDisplay(
                                                        m.body ?? "",
                                                        m.channel,
                                                    );
                                                    if (formatted.kind === "html") {
                                                        return (
                                                            <span
                                                                className="[&_strong]:font-semibold [&_em]:italic [&_u]:underline"
                                                                dangerouslySetInnerHTML={{ __html: formatted.html }}
                                                            />
                                                        );
                                                    }
                                                    return <span className="whitespace-pre-wrap">{formatted.text}</span>;
                                                })()}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    );

    const composerColumn = (
        <div
            data-cc-ws-column="composer"
            data-cc-ws-section="composer"
            className={`flex min-h-0 flex-col bg-white ${
                isActivityEmbed
                    ? isNewMessageMode
                        ? "min-h-0 flex-1 overflow-hidden border-t-2 border-alloy-stone/20 px-3 py-2.5"
                        : "shrink-0 border-t-2 border-alloy-stone/20 px-3 py-2.5"
                    : "px-4 py-3"
            }`}
        >
                <div data-cc-composer-channels className={`inline-flex w-fit overflow-hidden rounded-lg border border-alloy-stone/20 bg-white text-[11px] shadow-sm ${isActivityEmbed && !isNewMessageMode ? "hidden" : ""}`}>
                    {renderModeTab("email", "Email")}
                    {renderModeTab("sms", "SMS")}
                    {!isActivityEmbed ? renderModeTab("note", "Notes") : null}
                    {!isActivityEmbed ? renderModeTab("tasks", "Tasks") : null}
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
                    isActivityEmbed ? (
                        <div className="relative mt-2 space-y-1.5" data-cc-recipient-compact>
                            <div className="rounded-lg border border-alloy-stone/25 bg-white px-2 py-1.5 shadow-sm">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">To</span>
                                    {selectedRecipientRows.slice(0, 2).map((r) => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            data-cc-recipient={r.id}
                                            aria-pressed
                                            onClick={() => onToggleRecipient(r.id)}
                                            className="inline-flex items-center gap-1 rounded-full bg-alloy-juniper px-2 py-0.5 text-[10px] font-medium text-white"
                                        >
                                            <Check className="h-3 w-3" aria-hidden />
                                            {r.displayName}
                                        </button>
                                    ))}
                                    {selectedRecipientRows.length > 2 ? (
                                        <button
                                            type="button"
                                            data-cc-recipient-overflow
                                            aria-expanded={recipientPickerOpen}
                                            onClick={() => setRecipientPickerOpen((open) => !open)}
                                            className="inline-flex items-center rounded-full border border-alloy-stone/25 bg-alloy-stone/[0.04] px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70"
                                        >
                                            +{selectedRecipientRows.length - 2}
                                        </button>
                                    ) : null}
                                    {composerLocalEmails.map((email) => (
                                        <span
                                            key={email}
                                            data-cc-recipient-manual={email}
                                            className="inline-flex items-center rounded-full border border-alloy-juniper/35 bg-alloy-juniper/10 px-2 py-0.5 text-[10px] font-medium text-alloy-juniper"
                                        >
                                            {email}
                                        </span>
                                    ))}
                                    <button
                                        type="button"
                                        data-cc-recipient-compact-trigger
                                        aria-expanded={recipientPickerOpen}
                                        onClick={() => setRecipientPickerOpen((open) => !open)}
                                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-alloy-stone/30 px-2 py-0.5 text-[10px] text-alloy-midnight/55 hover:border-alloy-juniper/45 hover:text-alloy-juniper"
                                    >
                                        <UserPlus className="h-3 w-3" />
                                        Add
                                        <ChevronDown className={`h-3 w-3 transition ${recipientPickerOpen ? "rotate-180" : ""}`} />
                                    </button>
                                </div>
                                {workspaceMode === "email" ? (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-alloy-stone/12 pt-1.5">
                                        <button
                                            type="button"
                                            data-cc-add-email
                                            onClick={() => setShowManualEmailInput((v) => !v)}
                                            className="text-[10px] font-medium text-alloy-juniper hover:underline"
                                        >
                                            Add another email
                                        </button>
                                        <button
                                            type="button"
                                            data-cc-toggle-cc-bcc
                                            aria-expanded={showCcBcc}
                                            onClick={() => setShowCcBcc((v) => !v)}
                                            className="text-[10px] font-medium text-alloy-midnight/55 hover:text-alloy-juniper"
                                        >
                                            CC/BCC
                                        </button>
                                    </div>
                                ) : null}
                                {workspaceMode === "email" && showCcBcc ? (
                                    <div className="mt-1.5 space-y-1 border-t border-alloy-stone/12 pt-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-8 text-[10px] font-medium text-alloy-midnight/45">CC</span>
                                            <input
                                                aria-label="CC email"
                                                value={ccEmailDraft}
                                                onChange={(e) => setCcEmailDraft(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        addComposerLocalEmail(ccEmailDraft, "cc");
                                                        setCcEmailDraft("");
                                                    }
                                                }}
                                                placeholder="Add CC email"
                                                className="min-w-0 flex-1 rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px]"
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {composerCcEmails.map((email) => (
                                                <span key={`cc-${email}`} className="rounded-full border border-alloy-stone/20 px-2 py-0.5 text-[10px] text-alloy-midnight/70">{email}</span>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-8 text-[10px] font-medium text-alloy-midnight/45">BCC</span>
                                            <input
                                                aria-label="BCC email"
                                                value={bccEmailDraft}
                                                onChange={(e) => setBccEmailDraft(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        addComposerLocalEmail(bccEmailDraft, "bcc");
                                                        setBccEmailDraft("");
                                                    }
                                                }}
                                                placeholder="Add BCC email"
                                                className="min-w-0 flex-1 rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px]"
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {composerBccEmails.map((email) => (
                                                <span key={`bcc-${email}`} className="rounded-full border border-alloy-stone/20 px-2 py-0.5 text-[10px] text-alloy-midnight/70">{email}</span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                            {recipientPickerOpen ? (
                                <div data-cc-recipient-popover className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-alloy-stone/25 bg-white px-2 py-2 shadow-md">
                                    {renderRecipientTiers(true)}
                                </div>
                            ) : null}
                            {workspaceMode === "email" && showManualEmailInput && !showCcBcc ? (
                                <input
                                    aria-label="Manual recipient email"
                                    value={manualEmailDraft}
                                    onChange={(e) => setManualEmailDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addComposerLocalEmail(manualEmailDraft, "to");
                                            setManualEmailDraft("");
                                        }
                                    }}
                                    placeholder="name@example.com — Enter to add"
                                    className="w-full rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px]"
                                />
                            ) : null}
                        </div>
                    ) : (
                    <div data-cc-recipient-selector className="mt-2 rounded-lg border border-alloy-stone/20 bg-white px-2 py-2 shadow-sm">
                        <div className="mb-1 text-[10px] font-medium text-alloy-midnight/45">To · <span className="text-alloy-midnight/70">{selectionSummary(selectedRecipientIds, allLiveRecipients)}</span></div>
                        {renderRecipientTiers()}
                    </div>
                    )
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
                    className={`mt-2 w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm placeholder:text-alloy-midnight/35 ${workspaceMode === "sms" || (usesReplyLifecycle && !isNewMessageMode) ? "hidden" : ""}`}
                />

                <div
                    className={`mt-2 flex min-h-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${
                        isActivityEmbed
                            ? isNewMessageMode
                                ? "min-h-[12rem] flex-1 border-alloy-stone/30 ring-1 ring-alloy-stone/10"
                                : "min-h-[9.5rem] flex-none border-alloy-stone/30 ring-1 ring-alloy-stone/10"
                            : "min-h-[240px] flex-1 border-alloy-stone/20"
                    }`}
                >
                    <div className={`flex items-center gap-0.5 border-b border-alloy-stone/20 ${COMMS_SURFACE_MUTED_CLASS} px-1.5 py-1`}>
                        <button type="button" aria-label="Bold" className={toolbarBtn} onClick={() => applyBodyFormat("bold")} disabled={workspaceMode === "sms"}><Bold className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Italic" className={toolbarBtn} onClick={() => applyBodyFormat("italic")} disabled={workspaceMode === "sms"}><Italic className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Underline" className={toolbarBtn} onClick={() => applyBodyFormat("underline")} disabled={workspaceMode === "sms"}><Underline className="h-3.5 w-3.5" /></button>
                        <span className="mx-1 h-4 w-px bg-alloy-stone/20" />
                        <button type="button" aria-label="Bulleted list" className={toolbarBtn} onClick={() => applyBodyFormat("list")} disabled={workspaceMode === "sms"}><List className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Insert link" className={toolbarBtn} onClick={() => applyBodyFormat("link")} disabled={workspaceMode === "sms"}><Link2 className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Emoji" className={toolbarBtn}><Smile className="h-3.5 w-3.5" /></button>
                        <span className="ml-auto flex items-center gap-0.5">
                            <button type="button" aria-label="Attach" className={toolbarBtn}><Paperclip className="h-3.5 w-3.5" /></button>
                            <button type="button" aria-label="Templates" className={toolbarBtn}><FileText className="h-3.5 w-3.5" /></button>
                        </span>
                    </div>
                    {emailComposer ? (
                        <div
                            ref={bodyEditableRef}
                            role="textbox"
                            aria-multiline="true"
                            aria-label="Message body"
                            contentEditable
                            suppressContentEditableWarning
                            data-cc-email-composer="true"
                            data-placeholder={
                                isNewMessageMode
                                    ? `Write a new message to ${detail ? detail.contactName : (selected.family_label ?? "the family")}…`
                                    : `Reply in ${selectedThread ? threadDisplayTitle(selectedThread, timelineMessages) : "this thread"}…`
                            }
                            onInput={(e) => onBodyChange((e.currentTarget as HTMLDivElement).innerHTML)}
                            className={`w-full resize-none border-0 bg-white px-3.5 py-3 text-sm leading-relaxed text-alloy-midnight focus:outline-none empty:before:pointer-events-none empty:before:text-alloy-midnight/35 empty:before:content-[attr(data-placeholder)] [&_strong]:font-semibold [&_em]:italic [&_u]:underline ${
                                isActivityEmbed
                                    ? isNewMessageMode
                                        ? "min-h-[9.5rem] flex-1"
                                        : "min-h-[5.5rem]"
                                    : "min-h-0 flex-1"
                            }`}
                        />
                    ) : (
                    <textarea
                        ref={bodyTextareaRef}
                        aria-label="Message body"
                        placeholder={
                            isNewMessageMode
                                ? `Write a new message to ${detail ? detail.contactName : (selected.family_label ?? "the family")}…`
                                : `Reply in ${selectedThread ? threadDisplayTitle(selectedThread, timelineMessages) : "this thread"}…`
                        }
                        value={bodyDraft}
                        onChange={(e) => onBodyChange(e.target.value)}
                        className={`w-full resize-none border-0 bg-white px-3.5 py-3 text-sm leading-relaxed text-alloy-midnight placeholder:text-alloy-midnight/35 focus:outline-none ${
                            isActivityEmbed
                                ? isNewMessageMode
                                    ? "min-h-[9.5rem] flex-1"
                                    : "min-h-[5.5rem]"
                                : "min-h-0 flex-1"
                        }`}
                    />
                    )}
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
                                        <button
                                            type="button"
                                            disabled={sending}
                                            onClick={onConfirmSend}
                                            className={`inline-flex shrink-0 items-center gap-1.5 ${activityPrimaryBtnClass} disabled:opacity-40`}
                                        >
                                            <Send className="h-3.5 w-3.5" />
                                            Confirm send ({sendResult.summary.ready})
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={onDismissSend}
                                        className={`inline-flex shrink-0 items-center gap-1.5 ${activitySecondaryBtnClass}`}
                                    >
                                        {sendResult.mode === "sent" ? "Done" : "Back"}
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                ) : null}
                {!(LIVE_WORKSPACE && sendResult?.mode === "preflight") ? (
                <div className="mt-2.5 flex items-center gap-1.5" data-cc-composer-footer>
                    <button type="button" disabled={sending || !modeAvailability[workspaceMode]?.available || (LIVE_WORKSPACE && (selectedRecipientIds.length === 0 || !bodyDraft.trim()))} onClick={() => { if (LIVE_WORKSPACE) onSendNow(); }} className={`inline-flex shrink-0 items-center gap-1.5 ${activityPrimaryBtnClass} disabled:opacity-40`}><Send className="h-3.5 w-3.5" />{sending ? "Working…" : workspaceMode === "sms" ? "Send SMS" : isNewMessageMode ? "Send" : "Send reply"}</button>
                    {/* Send later + BOS are canonical composer controls in EVERY mode (incl. new
                        message), matching Activity mode. Wired to the shared schedule/enhance modals. */}
                    <button type="button" aria-label="Send later" onClick={() => setScheduleOpen(true)} className={`inline-flex shrink-0 items-center gap-1.5 ${activitySecondaryBtnClass}`}><Clock className="h-3.5 w-3.5" />Send later</button>
                    <button type="button" data-bos-assist-button="true" aria-label="BOS" onClick={() => setBosOpen(true)} className={`inline-flex shrink-0 items-center gap-1.5 ${activitySecondaryBtnClass}`}>
                        <BosMark size="sm" horizon />
                        BOS
                    </button>
                    {!isActivityEmbed ? (
                        <span className="ml-auto text-[9px] leading-tight text-alloy-midnight/40">Review-first<br />manual send only</span>
                    ) : null}
                </div>
                ) : null}
                </>
                ) : null}
            <ComposerScheduleSendModal
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                channel={liveChannel === "sms" ? "sms" : "email"}
                subject={subjectDraft}
                body={bodyDraft}
                scheduleContext={scheduleContext}
                onScheduled={() => setScheduleOpen(false)}
            />
            <ComposerBosEnhanceModal open={bosOpen} onClose={() => setBosOpen(false)} draft={bodyDraft} />
        </div>
    );

    if (isActivityEmbed) {
        const activityThreadList = threadsForActivityTopicRail(threads);
        const activeThread = selectedThread ?? activityThreadList.find((t) => t.id === selectedThreadId) ?? null;
        const activeParticipants = activeThread ? resolveThreadRecipients(activeThread, timelineMessages, allLiveRecipients) : [];
        const activeParticipantSummary = formatThreadParticipantNames(activeParticipants);
        const activityComposition = deriveActivityCommsCompositionState({
            conversationCount: activityThreadList.length,
            selectedThreadId,
            isNewMessageMode,
            replyComposerExpanded,
        });
        const showTopicRail = shouldShowActivityTopicRail(activityComposition);
        return (
            <div
                data-cc-surface-variant={surfaceVariant}
                data-cc-activity-composition={activityComposition}
                className="flex h-full min-h-0 flex-1 overflow-hidden"
            >
                {/* TOPIC RAIL — reading state only (hidden when empty or composing). */}
                {showTopicRail ? (
                <div
                    data-cc-ws-column="threadlist"
                    data-cc-thread-strip
                    data-cc-topic-rail
                    className="flex min-h-0 w-[12.5rem] min-w-[11.875rem] max-w-[13.75rem] shrink-0 flex-col border-r-2 border-alloy-stone/25 bg-alloy-stone/[0.02]"
                >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/20 bg-white px-2.5 py-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">Topics</span>
                        <button
                            type="button"
                            data-cc-new-message
                            aria-pressed={isNewMessageMode}
                            onClick={() => onNewMessage?.()}
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${isNewMessageMode ? "bg-alloy-juniper/15 text-alloy-juniper ring-1 ring-alloy-juniper/50" : "text-alloy-juniper hover:bg-alloy-juniper/10"}`}
                        >
                            <Plus className="h-3 w-3" /> New
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1.5">
                        {activityThreadList.length === 0 ? (
                            <p className="px-1 py-1.5 text-[10px] leading-snug text-alloy-midnight/45">No conversations yet. Use New to start a message.</p>
                        ) : (
                            activityThreadList.map((thread) => {
                                const active = selectedThreadId === thread.id;
                                const participants = resolveThreadRecipients(thread, timelineMessages, allLiveRecipients);
                                const participantNames = formatThreadParticipantNames(participants);
                                const topicTitle = threadDisplayTitle(thread, timelineMessages);
                                const preview = deriveThreadLastPreview(thread.id, timelineMessages);
                                return (
                                    <button
                                        key={thread.id}
                                        type="button"
                                        data-cc-thread-chip={thread.id}
                                        data-cc-thread-topic={topicTitle}
                                        data-cc-thread-channel={thread.channel ?? "email"}
                                        aria-pressed={active}
                                        onClick={() => onOpenThread(thread.id)}
                                        className={`mb-1 flex w-full flex-col gap-0.5 rounded-lg border px-2 py-1 text-left transition ${active ? "border-alloy-juniper/45 bg-alloy-juniper/10 ring-1 ring-alloy-juniper/20" : "border-alloy-stone/20 bg-white hover:border-alloy-juniper/35"}`}
                                    >
                                        <span className="flex items-start gap-1.5">
                                            <ThreadParticipantAvatars participants={participants} threadId={thread.id} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1">
                                                    <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-alloy-stone/15 bg-alloy-stone/[0.04] p-0.5 text-alloy-juniper" aria-label={deriveThreadChannelLabel(thread.channel)}>
                                                        <ThreadChannelIcon channel={thread.channel} className="h-3 w-3" />
                                                    </span>
                                                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-alloy-midnight">{topicTitle}</span>
                                                    {thread.unread > 0 ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-juniper" aria-label="Unread" /> : null}
                                                </span>
                                                {participantNames ? (
                                                    <span className="mt-0.5 block truncate text-[9px] text-alloy-midnight/50">{participantNames}</span>
                                                ) : null}
                                            </span>
                                        </span>
                                        {preview ? (
                                            <span className="line-clamp-1 text-[9px] leading-snug text-alloy-midnight/45">{preview}</span>
                                        ) : null}
                                        <span className="flex items-center justify-between gap-1 text-[9px] text-alloy-midnight/40">
                                            <span>{thread.messageCount > 0 ? `${thread.messageCount} msg` : null}</span>
                                            <span className="shrink-0">{relTime(thread.lastActivityAt)}</span>
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
                ) : null}

                {/* READ / COMPOSE PANE */}
                <div data-cc-ws-column="conversation" className="flex min-h-0 flex-1 flex-col bg-white">
                    <div data-cc-thread-header className="flex shrink-0 items-start justify-between gap-2 border-b border-alloy-stone/20 bg-white px-3 py-2">
                        <div className="min-w-0 flex-1">
                        {isNewMessageMode ? (
                            <div className="text-[12px] font-semibold text-alloy-juniper">New Message</div>
                        ) : activeThread ? (
                            (() => {
                                const headerTitle = threadDisplayTitle(activeThread, timelineMessages);
                                const headerSummary = deriveThreadHeaderSummary(activeThread, timelineMessages);
                                return (
                                    <div className="space-y-1" data-cc-thread-header-summary>
                                        <div className="flex flex-wrap items-start gap-2">
                                            <h3 className="text-[14px] font-semibold leading-tight text-alloy-midnight">{headerTitle}</h3>
                                            {activeThread.unread > 0 ? (
                                                <span className="rounded-full bg-alloy-juniper/15 px-2 py-0.5 text-[10px] font-medium text-alloy-juniper">{activeThread.unread} unread</span>
                                            ) : null}
                                        </div>
                                        <p className="text-[11px] font-medium text-alloy-midnight/65">{activeParticipantSummary}</p>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-alloy-midnight/50">
                                            <span className="inline-flex items-center gap-1 font-medium text-alloy-midnight/60">
                                                <ThreadChannelIcon channel={activeThread.channel} className="h-3 w-3" />
                                                {deriveThreadChannelLabel(activeThread.channel)}
                                            </span>
                                            {headerSummary.deliveryLabel ? (
                                                <span className={headerSummary.deliveryCls ?? "text-alloy-midnight/50"}>{headerSummary.deliveryLabel}</span>
                                            ) : null}
                                            {headerSummary.activityAt ? (
                                                <span className="text-alloy-midnight/45">{relTime(headerSummary.activityAt)}</span>
                                            ) : null}
                                        </div>
                                        {headerSummary.readHint && activeThread.channel === "sms" && headerSummary.deliveryLabel !== "Opened" ? (
                                            <p className="text-[9px] text-alloy-midnight/40">{headerSummary.readHint}</p>
                                        ) : null}
                                    </div>
                                );
                            })()
                        ) : (
                            <p className="text-[11px] text-alloy-midnight/55">
                                {activityThreadList.length === 0
                                    ? "No conversations yet. Start a new message to begin."
                                    : "Select a topic to read messages."}
                            </p>
                        )}
                        </div>
                        {!showTopicRail ? (
                            <button
                                type="button"
                                data-cc-new-message
                                aria-pressed={isNewMessageMode}
                                onClick={() => onNewMessage?.()}
                                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${isNewMessageMode ? "bg-alloy-juniper/15 text-alloy-juniper ring-1 ring-alloy-juniper/50" : "text-alloy-juniper hover:bg-alloy-juniper/10"}`}
                            >
                                <Plus className="h-3 w-3" /> New
                            </button>
                        ) : null}
                    </div>

                    {isNewMessageMode ? (
                        composerColumn
                    ) : (
                        <>
                            <div
                                ref={timelineScrollRef}
                                data-cc-ws-section="timeline"
                                className={`min-h-0 flex-1 overflow-auto border-b border-alloy-stone/15 ${COMMS_SURFACE_MUTED_CLASS} px-3 py-2.5`}
                            >
                                {messages.length === 0 ? (
                                    <div className="text-[11px] text-alloy-midnight/45">No messages in this conversation yet.</div>
                                ) : (
                                    messageListBody
                                )}
                            </div>
                            {showRuntimeComposer ? (
                                composerColumn
                            ) : (
                                <div
                                    data-cc-reply-collapsed
                                    className="flex shrink-0 items-center border-t-2 border-alloy-stone/20 bg-white px-3 py-2"
                                >
                                    <button
                                        type="button"
                                        data-cc-reply-expand
                                        onClick={expandReplyComposer}
                                        className={`inline-flex items-center gap-1.5 ${COMMS_ACTIVITY_SECONDARY_BTN_CLASS}`}
                                    >
                                        <Send className="h-3.5 w-3.5" />
                                        Reply
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            data-cc-surface-variant={surfaceVariant}
            className="grid min-h-0 flex-1 gap-0 grid-cols-[minmax(0,1fr)_minmax(380px,1.35fr)]"
        >
            {/* CONVERSATION — compact snapshot band + chat history */}
            <div data-cc-ws-column="timeline" className="flex min-h-0 flex-col border-r border-alloy-stone/20 bg-white">
                {snapshotBand}
                <div ref={timelineScrollRef} data-cc-ws-section="timeline" className={`min-h-0 flex-1 overflow-auto ${COMMS_SURFACE_MUTED_CLASS} px-3.5 py-3`}>
                    {LIVE_WORKSPACE && selectedThreadId && !isWorkspaceInbox ? (
                        <div className="mb-2 flex items-center justify-between rounded-md border border-alloy-juniper/50 bg-alloy-juniper/10 px-2 py-1 text-[10px] text-alloy-juniper">
                            <span>Viewing one thread</span>
                            <button type="button" onClick={onAllMessages} className="font-semibold underline">All messages</button>
                        </div>
                    ) : null}
                    {messageListBody}
                </div>
            </div>
            {showRuntimeComposer ? (
                composerColumn
            ) : (
                <div
                    data-cc-ws-column="composer"
                    data-cc-reply-collapsed
                    className="flex min-h-0 flex-col justify-center border-l border-alloy-stone/20 bg-white px-4 py-3"
                >
                    <button
                        type="button"
                        data-cc-reply-expand
                        onClick={expandReplyComposer}
                        className={`inline-flex w-fit items-center gap-1.5 ${COMMS_SECONDARY_BTN_CLASS}`}
                    >
                        <Send className="h-3.5 w-3.5" />
                        Reply
                    </button>
                    <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-alloy-midnight/45">
                        Reply uses the same reviewed send lifecycle as Activity.
                    </p>
                </div>
            )}
        </div>
    );
}
