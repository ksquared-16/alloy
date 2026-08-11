"use client";

/**
 * The conversation workspace for a parent Alloy has not identified.
 *
 * The Family Communication Workspace is household-shaped: it loads from a
 * customer id, lists recipients as people, and sends to `recipient_person_ids`.
 * A conversation whose sender could not be attributed has none of those, so the
 * Command Center marked it unloadable and rendered a "Loading conversation"
 * placeholder that never resolved. An operator selecting a real parent's message
 * saw a permanent spinner — the message was received, retained and visible in the
 * queue, and still unanswerable.
 *
 * This is the workspace for that case. It needs exactly one fact — the thread —
 * because the reply carries a conversation and the server derives the
 * destination from the inbound message it actually received. Nothing here
 * asserts an identity Alloy does not have.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MessagingComposerFrame from "@/components/adminV2/messaging/MessagingComposerFrame";
import {
    buildInboxReplySendPayload,
    resolveInboxReplyOutcome,
} from "@/lib/communications/inboxReplySend";
import {
    maskInboxEndpointForDisplay,
    routingAmbiguityNotice,
} from "@/lib/communications/inboxThreadRoutingState";
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";
import { formatMessagingDateTimeLocal } from "@/lib/adminV2/messaging/messagingLocalDateTime";

export type UnidentifiedConversationMessage = {
    id: string;
    direction: string;
    channel: string;
    body: string | null;
    created_at: string | null;
};

type Props = {
    conversation: ConversationSummary;
    /** Refresh the queue after a reply lands, so unread and attention move. */
    onReplied?: () => void;
};

/** Scope states that mean "Alloy could not say who this is". */
export function isUnidentifiedConversation(c: ConversationSummary | null | undefined): boolean {
    const scope = c?.scope_status ?? null;
    return Boolean(c) && (scope === "unresolved" || scope === "ambiguous");
}

function replyChannelFor(c: ConversationSummary): "email" | "sms" | null {
    const ch = (c.channel ?? "").trim().toLowerCase();
    return ch === "sms" || ch === "email" ? ch : null;
}

export default function UnidentifiedConversationPanel({ conversation, onReplied }: Props) {
    const [messages, setMessages] = useState<UnidentifiedConversationMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [okNote, setOkNote] = useState<string | null>(null);
    const reqIdRef = useRef(0);

    const channel = replyChannelFor(conversation);
    const maskedEndpoint = maskInboxEndpointForDisplay(conversation.recipient_key, conversation.channel ?? "");
    const ambiguous = conversation.scope_status === "ambiguous";

    const routingNotice = useMemo(
        () =>
            ambiguous
                ? routingAmbiguityNotice({
                      senderIdentityState: "unidentified",
                      routingState: "needs_routing_resolution",
                      // The queue projection does not carry the candidate count, so
                      // the generic sentence is used rather than inventing a number.
                      routingCandidateCount: 0,
                  })
                : null,
        [ambiguous]
    );

    const load = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(
                `/api/admin/communications/threads/${conversation.id}/messages?limit=200`,
                { credentials: "include" }
            );
            const json = (await res.json().catch(() => ({}))) as {
                messages?: UnidentifiedConversationMessage[];
                error?: string;
            };
            if (reqIdRef.current !== reqId) return;
            if (!res.ok) throw new Error(json.error ?? `Could not load this conversation (${res.status})`);
            // The route returns newest-first; the operator reads oldest-first.
            setMessages([...(json.messages ?? [])].reverse());
        } catch (e) {
            if (reqIdRef.current !== reqId) return;
            setLoadError(e instanceof Error ? e.message : "Could not load this conversation");
        } finally {
            if (reqIdRef.current === reqId) setLoading(false);
        }
    }, [conversation.id]);

    useEffect(() => {
        setBody("");
        setError(null);
        setOkNote(null);
        void load();
    }, [load]);

    const onSend = async () => {
        if (!channel) return;
        const payload = buildInboxReplySendPayload({
            replyTarget: {
                canReply: true,
                authority: "thread",
                entityType: null,
                entityId: null,
                recipientPersonId: null,
                threadId: conversation.id,
            },
            channel,
            body,
            subject: "",
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
                ok?: boolean;
                outcome?: string;
                message?: string;
                error?: string;
            };
            if (!res.ok && res.status !== 409) {
                throw new Error(json.error ?? json.message ?? `Send failed (${res.status})`);
            }
            // A 2xx is not a send: the thread branch answers 200 with ok:false when
            // canonical eligibility refuses. Reporting that as queued would append
            // an outbound reply the parent never received.
            const outcome = resolveInboxReplyOutcome(json);
            if (!outcome.sent) {
                setError(outcome.message);
                return;
            }
            setBody("");
            setOkNote(channel === "sms" ? "SMS queued." : "Email queued.");
            await load();
            onReplied?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Send failed");
        } finally {
            setBusy(false);
        }
    };

    const heading = ambiguous ? "Needs identity review" : "Unidentified sender";
    const replyHeading = maskedEndpoint ? `Reply to ${maskedEndpoint}` : "Reply to this conversation";

    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            data-cc-unidentified-conversation="true"
            data-cc-scope-status={conversation.scope_status ?? "unknown"}
        >
            <div className="shrink-0 border-b border-alloy-stone/12 px-3.5 py-3">
                <h2 className="truncate text-sm font-semibold text-alloy-midnight">
                    {maskedEndpoint ? `${heading} · ${maskedEndpoint}` : heading}
                </h2>
                <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/55">
                    {conversation.channel === "sms" ? "SMS" : "Email"} · Alloy has not matched this sender to a
                    record. You can still answer here.
                </p>
                {routingNotice ? (
                    <p
                        className="mt-1.5 rounded-md bg-alloy-stone/8 px-2 py-1 text-[10px] leading-snug text-alloy-midnight/70"
                        data-cc-routing-notice="true"
                    >
                        {routingNotice}
                    </p>
                ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
                {loading ? (
                    <p className="text-xs text-alloy-midnight/45">Loading conversation…</p>
                ) : loadError ? (
                    <p className="text-xs text-alloy-ember">{loadError}</p>
                ) : messages.length === 0 ? (
                    <p className="text-xs text-alloy-midnight/45">No messages on this conversation.</p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {messages.map((m) => {
                            const inbound = String(m.direction).toLowerCase() === "inbound";
                            return (
                                <li
                                    key={m.id}
                                    data-cc-message-direction={inbound ? "inbound" : "outbound"}
                                    className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-snug ${
                                        inbound
                                            ? "self-start bg-alloy-stone/10 text-alloy-midnight"
                                            : "self-end bg-[#E8F6F2] text-alloy-midnight"
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap">{m.body ?? ""}</p>
                                    <p className="mt-0.5 text-[10px] text-alloy-midnight/45">
                                        {inbound ? "Received" : "Sent"}
                                        {m.created_at ? ` · ${formatMessagingDateTimeLocal(m.created_at)}` : ""}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div
                className="shrink-0 border-t border-alloy-stone/12 bg-white/95 px-3 py-2.5"
                data-cc-reply-authority={channel ? "thread" : "none"}
            >
                <MessagingComposerFrame
                    compact
                    heading={replyHeading}
                    channel={channel ?? "sms"}
                    // Fixed by the conversation: the only address Alloy has for this
                    // sender is the one they wrote in on, so there is nothing to switch to.
                    onChannelChange={() => {}}
                    emailDisabled={channel !== "email"}
                    smsDisabled={channel !== "sms"}
                    emailDisabledTitle="This conversation can only be answered on the channel it arrived on."
                    smsDisabledTitle="This conversation can only be answered on the channel it arrived on."
                    subject=""
                    onSubjectChange={() => {}}
                    body={body}
                    onBodyChange={setBody}
                    bodyDisabled={!channel}
                    bodyPlaceholder={
                        channel ? "Answer this conversation…" : "This conversation has no channel to reply on."
                    }
                    bodyRows={3}
                    sendDisabled={!channel || body.trim().length === 0 || busy}
                    sendBusy={busy}
                    onSend={() => void onSend()}
                    error={error}
                    okNote={okNote}
                    dataTestId="cc-unidentified-reply"
                />
            </div>
        </div>
    );
}
