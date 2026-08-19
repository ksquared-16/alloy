import type { RecipientVM, ThreadVM } from "./types";
import { messageDeliveryDisplay, threadReadAvailabilityHint } from "./timelinePresentation";

export type ThreadTopicTitleInput = {
    thread: Pick<ThreadVM, "subject" | "channel" | "attentionState" | "slaState">;
    /** Latest message subject line when thread subject is absent. */
    messageSubject?: string | null;
    /** Workflow/action label when surfaced on the thread context. */
    workflowLabel?: string | null;
    /** Additional conversation metadata (thread row metadata, action labels). */
    conversationMetadata?: {
        topic?: string | null;
        actionLabel?: string | null;
        familyLabel?: string | null;
    } | null;
};

const GENERIC_CHANNEL_TITLES = new Set([
    "sms",
    "email",
    "in_app",
    "in-app",
    "sms conversation",
    "email conversation",
    "general questions",
    "general",
    "conversation",
]);

const PERSON_ENTITY_TYPES = new Set(["person", "persons", "child"]);

function isGenericChannelTitle(value: string): boolean {
    return GENERIC_CHANNEL_TITLES.has(value.trim().toLowerCase());
}

export function isPersonPrimaryEntity(type: string | null | undefined): boolean {
    return PERSON_ENTITY_TYPES.has((type ?? "").trim().toLowerCase());
}

function deriveConversationMetadataTopic(
    metadata?: ThreadTopicTitleInput["conversationMetadata"],
): string | null {
    const action = metadata?.actionLabel?.trim();
    if (action && !isGenericChannelTitle(action)) return action;

    const topic = metadata?.topic?.trim();
    if (topic && !isGenericChannelTitle(topic)) return topic;

    const family = metadata?.familyLabel?.trim();
    if (family && !isGenericChannelTitle(family)) return family;

    /*
     * ATTENTION AND SLA STATE ARE NOT TOPICS.
     *
     * This used to fall back to `attentionState`, then `slaState`, VERBATIM — so a
     * conversation with no business context showed its raw storage enum as its
     * subject line. An operator's queue read:
     *
     *     Kurzman Family
     *     needs_response
     *
     * with `needs_routing_resolution` and `first_response_due` appearing the same
     * way. Confirmed in the browser against the certification tenant; a source
     * grep did not find it, because every label authority in this codebase was
     * correct and this path went round all of them.
     *
     * Two things were wrong, and deleting the fallback fixes both.
     *
     * First, they are database values, and nothing else in the queue renders one.
     *
     * Second — the reason a label MAP here would still be wrong — attention is
     * already on the row twice: the status pill and the attention label, both
     * properly worded. Restating it as the topic spends the one line that answers
     * "what is this conversation about" on something already visible, and answers
     * nothing.
     *
     * A conversation with no business context has no topic. Callers fall through
     * to "General", which is true.
     */
    return null;
}

/**
 * Conversation topic title for Activity embed — business context first, channel icon carries transport.
 * Priority: explicit thread title → workflow/action → (email: message subject) → metadata → General.
 * Email threads keep subject lines; SMS sessions fall back to General when no business context exists.
 */
export function deriveThreadTopicTitle(input: ThreadTopicTitleInput): string {
    const channel = input.thread.channel;
    const fromThread = input.thread.subject?.trim();
    if (fromThread && !isGenericChannelTitle(fromThread)) return fromThread;

    const workflow = input.workflowLabel?.trim();
    if (workflow && !isGenericChannelTitle(workflow)) return workflow;

    if (channel === "email") {
        const fromMessage = input.messageSubject?.trim();
        if (fromMessage && !isGenericChannelTitle(fromMessage)) return fromMessage;
    }

    const fromMetadata = deriveConversationMetadataTopic(input.conversationMetadata);
    if (fromMetadata) return fromMetadata;

    return deriveThreadTopicFallback();
}

export function deriveThreadTopicFallback(_channel?: string | null | undefined): string {
    return "General";
}

export function deriveThreadChannelLabel(channel: string | null | undefined): "SMS" | "Email" {
    return channel === "sms" ? "SMS" : "Email";
}

export function threadChannelToWorkspaceMode(channel: string | null | undefined): "email" | "sms" {
    return channel === "sms" ? "sms" : "email";
}

/** Hide orphaned / empty threads from Activity topic rail. */
export function threadsForActivityTopicRail(threads: ReadonlyArray<ThreadVM>): ThreadVM[] {
    return [...threads]
        .filter((thread) => thread.messageCount > 0)
        .sort((a, b) => String(b.lastActivityAt ?? "").localeCompare(String(a.lastActivityAt ?? "")));
}

export type ThreadPreviewMessage = {
    thread_id?: string | null;
    body?: string | null;
    created_at?: string | null;
    kind?: string | null;
    direction?: string | null;
    recipient_person_id?: string | null;
    metadata?: Record<string, unknown> | null;
};

function readMetadataPersonId(metadata: Record<string, unknown> | null | undefined, keys: readonly string[]): string | null {
    if (!metadata) return null;
    for (const key of keys) {
        const v = metadata[key];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
}

/** Actual participant person ids for a transport thread (not whole household). */
export function deriveThreadParticipantPersonIds(
    thread: ThreadVM,
    messages: ReadonlyArray<ThreadPreviewMessage>,
): string[] {
    const ids = new Set<string>();
    if (isPersonPrimaryEntity(thread.primaryEntity.type) && thread.primaryEntity.id) {
        ids.add(thread.primaryEntity.id);
    }
    for (const m of messages) {
        if (m.thread_id && m.thread_id !== thread.id) continue;
        const recipientId =
            (typeof m.recipient_person_id === "string" && m.recipient_person_id.trim()) ||
            readMetadataPersonId(m.metadata ?? null, ["recipient_person_id"]);
        if (recipientId) ids.add(recipientId);
    }
    return [...ids];
}

export function resolveThreadRecipients(
    thread: ThreadVM,
    messages: ReadonlyArray<ThreadPreviewMessage>,
    recipients: ReadonlyArray<RecipientVM>,
): RecipientVM[] {
    const byId = new Map(recipients.map((r) => [r.id, r]));
    const threadMessages = messages.filter((m) => !m.thread_id || m.thread_id === thread.id);
    return deriveThreadParticipantPersonIds(thread, threadMessages)
        .map((id) => byId.get(id))
        .filter((r): r is RecipientVM => Boolean(r));
}

/** @deprecated Use resolveThreadRecipients — kept for call-site clarity during migration. */
export function threadParticipantsForTopicRow(
    thread: ThreadVM,
    messages: ReadonlyArray<ThreadPreviewMessage>,
    recipients: ReadonlyArray<RecipientVM>,
): RecipientVM[] {
    return resolveThreadRecipients(thread, messages, recipients);
}

/** Latest message preview for a thread (plain text, single line). */
export function deriveThreadLastPreview(
    threadId: string,
    messages: ReadonlyArray<ThreadPreviewMessage>,
): string | null {
    const latest = messages
        .filter((m) => m.thread_id === threadId && (!m.kind || m.kind === "message"))
        .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
    const body = latest?.body?.trim();
    if (!body) return null;
    const singleLine = body.replace(/\s+/g, " ");
    return singleLine.length > 72 ? `${singleLine.slice(0, 69)}…` : singleLine;
}

/** First non-empty message subject in a thread (email topics). */
export function deriveThreadMessageSubject(
    threadId: string,
    messages: ReadonlyArray<ThreadPreviewMessage & { subject?: string | null }>,
): string | null {
    for (const m of messages) {
        if (m.thread_id !== threadId) continue;
        const subject = m.subject?.trim();
        if (subject) return subject;
    }
    return null;
}

/** Participant summary for thread header / row subtitle. */
export function formatThreadParticipantNames(recipients: ReadonlyArray<RecipientVM>, maxVisible = 2): string {
    if (recipients.length === 0) return "Family";
    const visible = recipients.slice(0, maxVisible).map((r) => r.displayName);
    const overflow = recipients.length - visible.length;
    if (overflow > 0) return `${visible.join(", ")} +${overflow}`;
    return visible.join(", ");
}

export type MessageSenderInput = {
    direction?: string | null;
    senderUserId?: string | null;
    senderDisplayName?: string | null;
    recipientPersonId?: string | null;
};

export function deriveMessageSenderLabel(
    message: MessageSenderInput,
    opts: {
        currentUserId?: string | null;
        inboundContactName?: string | null;
        recipientDisplayName?: string | null;
    },
): string {
    const out = message.direction === "outbound";
    if (out) {
        if (message.senderUserId && opts.currentUserId && message.senderUserId === opts.currentUserId) {
            return "Sent by you";
        }
        if (message.senderDisplayName?.trim()) return message.senderDisplayName.trim();
        return "Sent from Alloy";
    }
    return opts.recipientDisplayName ?? opts.inboundContactName ?? "Family";
}

export function deriveThreadReplyRecipientIds(
    thread: ThreadVM,
    messages: ReadonlyArray<ThreadPreviewMessage>,
): string[] {
    return deriveThreadParticipantPersonIds(thread, messages);
}

export type ThreadHeaderMessage = {
    thread_id?: string | null;
    direction?: string | null;
    status?: string | null;
    channel?: string | null;
    opened_at?: string | null;
    delivered_at?: string | null;
    created_at?: string | null;
};

/** Rich thread header: latest delivery/read + activity timestamp for selected conversation. */
export function deriveThreadHeaderSummary(
    thread: ThreadVM,
    messages: ReadonlyArray<ThreadHeaderMessage>,
): {
    deliveryLabel: string | null;
    deliveryCls: string | null;
    activityAt: string | null;
    readHint: string | null;
} {
    const threadMessages = messages.filter((m) => !m.thread_id || m.thread_id === thread.id);
    const byTime = [...threadMessages].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    const latest = byTime[0] ?? null;
    const latestOutbound = byTime.find((m) => m.direction === "outbound") ?? null;
    const statusSource = latestOutbound ?? latest;
    const delivery =
        statusSource?.direction === "outbound"
            ? messageDeliveryDisplay(statusSource.status, thread.channel, {
                  openedAt: statusSource.opened_at,
                  deliveredAt: statusSource.delivered_at,
              })
            : statusSource?.direction === "inbound"
              ? messageDeliveryDisplay("received", thread.channel)
              : null;

    return {
        deliveryLabel: delivery?.label ?? null,
        deliveryCls: delivery?.cls ?? null,
        activityAt: thread.lastActivityAt ?? latest?.created_at ?? null,
        readHint: threadReadAvailabilityHint(thread.channel),
    };
}
