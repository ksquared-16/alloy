"use client";

import { useMemo, useState } from "react";

import ComposerBosEnhanceModal from "@/components/adminV2/messaging/ComposerBosEnhanceModal";
import ComposerScheduleSendModal from "@/components/adminV2/messaging/ComposerScheduleSendModal";
import MessagingComposerFrame from "@/components/adminV2/messaging/MessagingComposerFrame";
import { resolveComposeNewScheduleContext } from "@/lib/adminV2/messaging/messagingComposerScheduleContext";
import type { DrawerCommunicationsEntityType } from "@/lib/adminV2/messaging/drawerCommunicationsEntity";

export type DrawerMessagingRecipient = {
    person_id: string;
    display_name: string;
    email?: string | null;
    phone?: string | null;
    relationship_hint?: string | null;
};

type DrawerMessagingComposerProps = {
    apiEntityType: DrawerCommunicationsEntityType;
    entityId: string;
    channel: "email" | "sms";
    onChannelChange: (channel: "email" | "sms") => void;
    emailReady: boolean;
    smsReady: boolean;
    /** Prefer specific reason (provider vs no phone) over the generic outbound title. */
    smsDisabledTitle?: string;
    bindingsErr: string | null;
    loadingBindings: boolean;
    recipients: DrawerMessagingRecipient[];
    selectedRecipientIds: Set<string>;
    onToggleRecipient: (personId: string) => void;
    sendBusy: boolean;
    /** Disabled reason excluding the empty-body case, which the composer adds from its own draft state. */
    sendDisabledReasonBase: string | null;
    sendLabel: string;
    /** Performs the send with the composer's current draft; resolves true on success so the composer clears. */
    onSend: (values: { subject: string; body: string }) => Promise<boolean>;
    sendErr: string | null;
    sendOkNote: string | null;
    compact?: boolean;
    /** Side-by-side drawer column — fills right pane instead of stacking under thread. */
    columnLayout?: boolean;
    /** Optional seed when opening from a prepared command (e.g. tour invitation). */
    initialSubject?: string | null;
    initialBody?: string | null;
};

function formatDisplayPhoneUs(raw: string | null | undefined): string {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
        const d = digits.slice(1);
        return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return String(raw ?? "").trim() || "—";
}

export default function DrawerMessagingComposer({
    apiEntityType,
    entityId,
    channel,
    onChannelChange,
    emailReady,
    smsReady,
    smsDisabledTitle = "SMS outbound is not configured for this org yet",
    bindingsErr,
    loadingBindings,
    recipients,
    selectedRecipientIds,
    onToggleRecipient,
    sendBusy,
    sendDisabledReasonBase,
    sendLabel,
    onSend,
    sendErr,
    sendOkNote,
    compact = true,
    columnLayout = false,
    initialSubject = null,
    initialBody = null,
}: DrawerMessagingComposerProps) {
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [bosOpen, setBosOpen] = useState(false);
    // Composer draft is owned here so typing re-renders only this subtree, not the drawer tree.
    const [subject, setSubject] = useState(() => String(initialSubject ?? "").trim());
    const [body, setBody] = useState(() => String(initialBody ?? "").trim());

    /** Reproduce the parent's prior sendDisabledReason: base reasons first, then the body-empty case. */
    const composedDisabledReason =
        sendDisabledReasonBase !== null
            ? sendDisabledReasonBase
            : sendBusy
              ? null
              : body.trim()
                ? null
                : "Enter a message to send.";
    const composedSendDisabled = sendBusy || composedDisabledReason !== null;

    const handleSend = async () => {
        const ok = await onSend({ subject, body });
        if (ok) {
            setSubject("");
            setBody("");
        }
    };

    const recipientsForChannel =
        channel === "email" ? recipients.filter((r) => !!r.email?.trim()) : recipients.filter((r) => !!r.phone?.trim());

    const scheduleContext = useMemo(
        () =>
            resolveComposeNewScheduleContext({
                opportunityId: apiEntityType === "opportunities" ? entityId : null,
                recipientPersonIds: [...selectedRecipientIds],
            }),
        [apiEntityType, entityId, selectedRecipientIds]
    );

    const channelHint =
        loadingBindings
            ? "Loading outbound configuration…"
            : bindingsErr
              ? bindingsErr
              : !emailReady && !smsReady
                ? "No outbound email or SMS bindings are active for this org."
                : composedDisabledReason;

    return (
        <>
            <div
                className={`px-2 py-2 ${
                    columnLayout
                        ? "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-white max-[539px]:border-t max-[539px]:border-alloy-stone/22 min-[540px]:border-l min-[540px]:border-alloy-stone/28"
                        : "shrink-0 border-t border-[#00A283]/12 bg-white/95"
                }`}
                data-adminv2-drawer-composer="true"
            >
                {recipientsForChannel.length > 0 ? (
                    <div className="mb-2 flex max-h-[3.25rem] flex-wrap gap-1 overflow-y-auto">
                        {recipientsForChannel.map((r) => {
                            const on = selectedRecipientIds.has(r.person_id);
                            const addr = channel === "email" ? r.email ?? "" : formatDisplayPhoneUs(r.phone);
                            return (
                                <button
                                    key={r.person_id}
                                    type="button"
                                    aria-pressed={on}
                                    disabled={sendBusy}
                                    onClick={() => onToggleRecipient(r.person_id)}
                                    title={r.relationship_hint ?? undefined}
                                    className={`max-w-full rounded-full border px-1.5 py-0.5 text-left text-[10px] leading-tight transition ${
                                        on
                                            ? "border-[#00A283]/35 bg-[#E8F6F2]/80 font-semibold text-alloy-midnight"
                                            : "border-alloy-stone/20 bg-white font-medium text-alloy-forge hover:border-[#00A283]/25"
                                    }`}
                                >
                                    <span className="block truncate">{r.display_name}</span>
                                    <span className="block truncate text-[9px] font-normal text-alloy-midnight/55">{addr}</span>
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            className="self-center rounded-full border border-[#00A283]/25 bg-[#E8F6F2]/50 px-2 py-0.5 text-[10px] font-semibold text-[#007a62]"
                            data-adminv2-composer-add-recipient="true"
                            title="Select another linked contact below"
                        >
                            Add recipient
                        </button>
                    </div>
                ) : null}

                <MessagingComposerFrame
                    compact={compact}
                    heading="Continue conversation"
                    channel={channel}
                    onChannelChange={onChannelChange}
                    emailDisabled={!emailReady}
                    smsDisabled={!smsReady}
                    emailDisabledTitle="Outbound email is not configured for this org"
                    smsDisabledTitle={smsDisabledTitle}
                    channelHint={channelHint}
                    subject={subject}
                    onSubjectChange={setSubject}
                    body={body}
                    onBodyChange={setBody}
                    bodyDisabled={sendBusy || recipientsForChannel.length === 0}
                    bodyPlaceholder="Continue the conversation…"
                    bodyRows={compact ? 3 : 4}
                    sendDisabled={composedSendDisabled}
                    sendBusy={sendBusy}
                    sendLabel={sendLabel}
                    onSend={() => void handleSend()}
                    onSendLater={() => setScheduleOpen(true)}
                    onBosEnhance={() => setBosOpen(true)}
                    error={sendErr}
                    okNote={sendOkNote}
                    dataTestId="drawer-composer"
                />
            </div>
            <ComposerScheduleSendModal
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                channel={channel}
                subject={subject}
                body={body}
                scheduleContext={scheduleContext}
                onScheduled={() => {
                    setBody("");
                    setSubject("");
                }}
            />
            <ComposerBosEnhanceModal open={bosOpen} onClose={() => setBosOpen(false)} draft={body} />
        </>
    );
}
