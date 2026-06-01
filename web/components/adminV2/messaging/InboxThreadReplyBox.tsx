"use client";

import { useEffect, useMemo, useState } from "react";

import ComposerBosEnhanceModal from "@/components/adminV2/messaging/ComposerBosEnhanceModal";
import ComposerScheduleSendModal from "@/components/adminV2/messaging/ComposerScheduleSendModal";
import MessagingComposerFrame from "@/components/adminV2/messaging/MessagingComposerFrame";
import { resolveInboxThreadScheduleContext } from "@/lib/adminV2/messaging/messagingComposerScheduleContext";
import {
    defaultInboxReplyChannel,
    resolveInboxReplyTarget,
} from "@/lib/communications/inboxThreadIdentity";
import type { InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";

type InboxThreadReplyBoxProps = {
    thread: InboxThreadListItem;
    onSent?: () => void;
    onScheduled?: () => void;
    onAddRecipient?: () => void;
};

function channelLabelShort(ch: "email" | "sms"): string {
    return ch === "sms" ? "SMS" : "Email";
}

export default function InboxThreadReplyBox({
    thread,
    onSent,
    onScheduled,
    onAddRecipient,
}: InboxThreadReplyBoxProps) {
    const [replyChannel, setReplyChannel] = useState<"email" | "sms">(() => defaultInboxReplyChannel(thread));
    const [body, setBody] = useState("");
    const [subject, setSubject] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [okNote, setOkNote] = useState<string | null>(null);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [bosOpen, setBosOpen] = useState(false);

    useEffect(() => {
        setReplyChannel(defaultInboxReplyChannel(thread));
        setBody("");
        setSubject("");
        setError(null);
        setOkNote(null);
        setScheduleOpen(false);
        setBosOpen(false);
    }, [thread.id, thread.channel]);

    const replyTarget = useMemo(
        () => resolveInboxReplyTarget(thread, replyChannel),
        [thread, replyChannel]
    );

    const scheduleContext = useMemo(
        () => resolveInboxThreadScheduleContext(thread, replyTarget),
        [thread, replyTarget]
    );

    const emailDisabled = thread.reply_email_available === false;
    const smsDisabled = thread.reply_sms_available !== true;
    const smsDisabledReason = !thread.reply_sms_available
        ? "SMS reply is not available yet for this org or contact."
        : "No mobile number for this contact.";

    const onSend = async () => {
        if (!replyTarget.canReply || !replyTarget.entityType || !replyTarget.entityId || !body.trim()) return;
        setBusy(true);
        setError(null);
        setOkNote(null);
        try {
            const payload: Record<string, unknown> = {
                entity_type: replyTarget.entityType,
                entity_id: replyTarget.entityId,
                channel: replyChannel,
                body: body.trim(),
            };
            if (replyTarget.recipientPersonId) {
                payload.recipient_person_id = replyTarget.recipientPersonId;
            }
            if (replyTarget.toAddress) {
                payload.to = replyTarget.toAddress;
            }
            if (replyChannel === "email" && subject.trim()) {
                payload.subject = subject.trim();
            }

            const res = await fetch("/api/admin/communications/send", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; process_trigger_attempted_note?: string };
            if (!res.ok) throw new Error(json.error ?? `Send failed (${res.status}`);

            setBody("");
            setSubject("");
            setOkNote(`${channelLabelShort(replyChannel)} queued.`);
            onSent?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Send failed");
        } finally {
            setBusy(false);
        }
    };

    const canSend = replyTarget.canReply && body.trim().length > 0 && !busy;

    return (
        <>
            <div className="shrink-0 border-t border-alloy-stone/12 bg-white/95 px-3 py-2.5" data-adminv2-inbox-reply="true">
                <MessagingComposerFrame
                    compact
                    heading="Continue conversation"
                    headingExtra={
                        onAddRecipient ? (
                            <button
                                type="button"
                                onClick={onAddRecipient}
                                className="rounded-md border border-[#00A283]/25 bg-[#E8F6F2]/50 px-2 py-0.5 text-[10px] font-semibold text-[#007a62] hover:bg-[#E8F6F2]"
                                data-adminv2-composer-add-recipient="true"
                            >
                                Add recipient
                            </button>
                        ) : null
                    }
                    channel={replyChannel}
                    onChannelChange={setReplyChannel}
                    emailDisabled={emailDisabled}
                    smsDisabled={smsDisabled}
                    emailDisabledTitle="No email address for this contact"
                    smsDisabledTitle={smsDisabledReason}
                    subject={subject}
                    onSubjectChange={setSubject}
                    body={body}
                    onBodyChange={setBody}
                    bodyDisabled={!replyTarget.canReply}
                    bodyPlaceholder={
                        replyTarget.canReply ? "Continue the conversation…" : replyTarget.disabledReason ?? "Unavailable"
                    }
                    bodyRows={3}
                    sendDisabled={!canSend}
                    sendBusy={busy}
                    onSend={() => void onSend()}
                    onSendLater={() => setScheduleOpen(true)}
                    onBosEnhance={() => setBosOpen(true)}
                    error={error}
                    okNote={okNote}
                    footerNote={!replyTarget.canReply ? replyTarget.disabledReason : null}
                    dataTestId="inbox-reply"
                />
            </div>
            <ComposerScheduleSendModal
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                channel={replyChannel}
                subject={subject}
                body={body}
                scheduleContext={scheduleContext}
                onScheduled={() => {
                    setBody("");
                    setSubject("");
                    setOkNote("Send scheduled.");
                    onScheduled?.();
                }}
            />
            <ComposerBosEnhanceModal open={bosOpen} onClose={() => setBosOpen(false)} draft={body} />
        </>
    );
}
