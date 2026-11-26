/**
 * What the Inbox reply action puts on the wire, and what it may claim came back.
 *
 * Pure on purpose. Both halves are contracts the operator's honesty depends on,
 * and both were previously inline in the reply component where nothing could
 * test them:
 *
 *   REQUEST  — the client names a recipient authority and never a destination.
 *   RESPONSE — a 2xx is not a send. The thread-reply branch answers HTTP 200
 *              with `ok:false` when canonical eligibility refuses, so reading
 *              only the status code would paint a blocked reply as queued and
 *              append an outbound message the parent never received.
 */

import type { InboxReplyTarget } from "@/lib/communications/inboxThreadIdentity";

/**
 * An operator typing into a conversation is operational, never transactional.
 * The distinction is policy, not labelling: transactional bypasses opt-out and
 * quiet hours, and a human-authored reply has no claim to either exemption.
 */
export const INBOX_REPLY_CATEGORY = "operational";

/** Fields that would let the client choose the destination. None may be sent. */
export const INBOX_REPLY_FORBIDDEN_FIELDS = [
    "to",
    "to_address",
    "phone",
    "email",
    "recipient_address",
] as const;

export type InboxReplySendPayload = {
    channel: "email" | "sms";
    body: string;
    category: typeof INBOX_REPLY_CATEGORY;
    subject?: string;
    entity_type?: string;
    entity_id?: string;
    recipient_person_id?: string;
    thread_id?: string;
};

export function buildInboxReplySendPayload(input: {
    replyTarget: Pick<
        InboxReplyTarget,
        "canReply" | "authority" | "entityType" | "entityId" | "recipientPersonId" | "threadId"
    >;
    channel: "email" | "sms";
    body: string;
    subject: string;
}): InboxReplySendPayload | null {
    const { replyTarget } = input;
    const text = input.body.trim();
    if (!replyTarget.canReply || !text) return null;

    const base = {
        channel: input.channel,
        body: text,
        category: INBOX_REPLY_CATEGORY,
        ...(input.channel === "email" && input.subject.trim() ? { subject: input.subject.trim() } : {}),
    } as const;

    // Thread authority. Deliberately carries no entity anchor: an unattributed
    // conversation anchors to a surrogate the person-oriented validation rejects,
    // and the server reads the anchor off the thread it loaded anyway.
    if (replyTarget.authority === "thread") {
        if (!replyTarget.threadId) return null;
        return { ...base, thread_id: replyTarget.threadId };
    }

    if (replyTarget.authority === "person") {
        if (!replyTarget.recipientPersonId || !replyTarget.entityType || !replyTarget.entityId) return null;
        return {
            ...base,
            entity_type: replyTarget.entityType,
            entity_id: replyTarget.entityId,
            recipient_person_id: replyTarget.recipientPersonId,
        };
    }

    return null;
}

export type InboxReplyOutcome = { sent: true } | { sent: false; message: string };

const BLOCKED_FALLBACK = "The reply was not sent.";

/**
 * Did the send actually reach the queue?
 *
 * Written to be sceptical: anything that is not an affirmative queued/duplicate
 * outcome is treated as not sent. A future outcome value added server-side
 * therefore surfaces as a refusal the operator can see, rather than as a silent
 * success — the failure mode that costs a parent their answer.
 */
export function resolveInboxReplyOutcome(json: {
    ok?: boolean;
    outcome?: string;
    message?: string;
    error?: string;
}): InboxReplyOutcome {
    const outcome = String(json.outcome ?? "").trim();
    if (outcome === "sent_to_queue" || outcome === "duplicate") return { sent: true };

    // No outcome field at all is the pre-existing success shape from callers that
    // never reported one; trust `ok` there and nowhere else.
    if (!outcome && json.ok === true) return { sent: true };

    return { sent: false, message: json.message?.trim() || json.error?.trim() || BLOCKED_FALLBACK };
}
