"use client";

import { useEffect, useMemo, useState } from "react";

import ComposerBosEnhanceModal from "@/components/adminV2/messaging/ComposerBosEnhanceModal";
import ComposerScheduleSendModal from "@/components/adminV2/messaging/ComposerScheduleSendModal";
import MessagingComposerFrame from "@/components/adminV2/messaging/MessagingComposerFrame";
import { resolveInboxThreadScheduleContext } from "@/lib/adminV2/messaging/messagingComposerScheduleContext";
import {
    buildInboxReplySendPayload,
    resolveInboxReplyOutcome,
} from "@/lib/communications/inboxReplySend";
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
    const unidentified = thread.sender_identity_state === "unidentified";
    const smsDisabledReason = unidentified
        ? "This conversation can only be answered on the channel it arrived on."
        : !thread.reply_sms_available
          ? "SMS reply is not available yet for this org or contact."
          : "No mobile number for this contact.";

    // Names the destination without naming the number. "Reply to Jordan Smith"
    // when Alloy knows; "Reply to ending in 1234" when it does not — the operator
    // is told plainly that nobody has been identified rather than shown a
    // formatted phone number sitting where a name belongs.
    const replyHeading = replyTarget.displayLabel
        ? `Reply to ${replyTarget.displayLabel}`
        : "Continue conversation";

    const onSend = async () => {
        const payload = buildInboxReplySendPayload({
            replyTarget,
            channel: replyChannel,
            body,
            subject,
        });
        if (!payload) return;
        setBusy(true);
        setError(null);
        setOkNote(null);
        try {
            const res = await fetch("/api/admin/communications/send", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                ok?: boolean;
                outcome?: string;
                message?: string;
                reason?: string;
            };
            if (!res.ok) throw new Error(json.error ?? `Send failed (${res.status})`);

            // A 200 is not a send. The canonical runtime answers `blocked` when
            // eligibility refuses — an unresolved STOP hold, quiet hours, a
            // suppressed endpoint — and reporting that as queued would show the
            // operator an outbound reply that was never dispatched.
            const outcome = resolveInboxReplyOutcome(json);
            if (!outcome.sent) {
                setError(outcome.message);
                return;
            }

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
            <div
                className="shrink-0 border-t border-alloy-stone/12 bg-white/95 px-3 py-2.5"
                data-adminv2-inbox-reply="true"
                data-adminv2-reply-authority={replyTarget.authority}
                data-adminv2-sender-identity={thread.sender_identity_state}
            >
                {thread.routing_notice ? (
                    <p
                        className="mb-1.5 rounded-md bg-alloy-stone/8 px-2 py-1 text-[10px] leading-snug text-alloy-midnight/70"
                        data-adminv2-routing-notice="true"
                    >
                        {thread.routing_notice}
                    </p>
                ) : null}
                <MessagingComposerFrame
                    compact
                    heading={replyHeading}
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
