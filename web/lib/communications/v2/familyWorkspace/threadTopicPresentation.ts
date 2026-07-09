import type { RecipientVM, ThreadVM } from "./types";

export type ThreadTopicTitleInput = {
    thread: Pick<ThreadVM, "subject" | "channel" | "attentionState" | "slaState">;
    /** Latest message subject line when thread subject is absent. */
    messageSubject?: string | null;
    /** Workflow/action label when surfaced on the thread context. */
    workflowLabel?: string | null;
};

const GENERIC_CHANNEL_TITLES = new Set(["sms", "email", "in_app", "in-app"]);

function isGenericChannelTitle(value: string): boolean {
    return GENERIC_CHANNEL_TITLES.has(value.trim().toLowerCase());
}

/** Meaningful conversation topic title for Activity embed thread rows. */
export function deriveThreadTopicTitle(input: ThreadTopicTitleInput): string {
    const fromThread = input.thread.subject?.trim();
    if (fromThread && !isGenericChannelTitle(fromThread)) return fromThread;

    const fromMessage = input.messageSubject?.trim();
    if (fromMessage && !isGenericChannelTitle(fromMessage)) return fromMessage;

    const workflow = input.workflowLabel?.trim();
    if (workflow) return workflow;

    if (input.thread.attentionState?.trim()) {
        const attention = input.thread.attentionState.trim();
        if (!isGenericChannelTitle(attention)) return attention;
    }

    return deriveThreadTopicFallback(input.thread.channel);
}

export function deriveThreadTopicFallback(channel: string | null | undefined): string {
    if (channel === "sms") return "SMS Conversation";
    if (channel === "email") return "Email Conversation";
    return "General Questions";
}

export function deriveThreadChannelLabel(channel: string | null | undefined): "SMS" | "Email" {
    return channel === "sms" ? "SMS" : "Email";
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
};

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

export function threadParticipantsForTopicRow(
    thread: ThreadVM,
    recipients: ReadonlyArray<RecipientVM>,
): RecipientVM[] {
    const primary = recipients.filter((r) => r.tier === "primary");
    const pool = primary.length > 0 ? primary : recipients;
    return pool.slice(0, 2);
}

/** Participant summary for thread header / row subtitle. */
export function formatThreadParticipantNames(recipients: ReadonlyArray<RecipientVM>, maxVisible = 2): string {
    if (recipients.length === 0) return "Family";
    const visible = recipients.slice(0, maxVisible).map((r) => r.displayName);
    const overflow = recipients.length - visible.length;
    if (overflow > 0) return `${visible.join(", ")} +${overflow}`;
    return visible.join(", ");
}
