// UI-5B — PURE: raw family threads + messages -> ThreadVM[] + aggregated TimelineEventVM[].
import type { ThreadVM, TimelineEventVM } from "./types";

export type RawThreadRow = {
    id: string;
    primary_entity_type?: string | null;
    primary_entity_id?: string | null;
    channel?: string | null;
    last_message_at?: string | null;
    attention_state?: string | null;
    sla_state?: string | null;
    metadata?: Record<string, unknown> | null;
};
export type RawMessageRow = {
    id: string;
    thread_id?: string | null;
    direction?: string | null;
    channel?: string | null;
    body?: string | null;
    created_at?: string | null;
    delivered_at?: string | null;
    opened_at?: string | null;
    replied_at?: string | null;
    metadata?: Record<string, unknown> | null;
    unread?: boolean | null;
};

export type AggregateContext = {
    childPersonIdToMemberId: Record<string, string>; // person_id -> customer_members.id
    opportunityIds: ReadonlySet<string>;
    selectedThreadId?: string | null;
};

function messageKind(m: RawMessageRow): string {
    const k = m.metadata && typeof m.metadata.kind === "string" ? (m.metadata.kind as string) : null;
    if (k) return k;
    if ((m.channel ?? "") === "in_app") return "note";
    return "message";
}

function threadSubject(t: RawThreadRow): string | null {
    const md = t.metadata ?? {};
    if (typeof md.subject === "string" && md.subject.trim()) return md.subject.trim();
    if (typeof md.family_label === "string" && md.family_label.trim()) return md.family_label.trim();
    return null;
}

export function buildTimelineEvents(messages: RawMessageRow[]): TimelineEventVM[] {
    return messages
        .map((m) => ({
            id: m.id,
            threadId: m.thread_id ?? "",
            direction: m.direction ?? null,
            channel: m.channel ?? null,
            body: m.body ?? null,
            createdAt: m.created_at ?? null,
            kind: messageKind(m),
            deliveredAt: m.delivered_at ?? null,
            openedAt: m.opened_at ?? null,
            repliedAt: m.replied_at ?? null,
        }))
        .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
}

export function aggregateFamilyThreads(
    threads: RawThreadRow[],
    messages: RawMessageRow[],
    ctx: AggregateContext
): { threads: ThreadVM[]; timelineEvents: TimelineEventVM[]; selectedThread: ThreadVM | null; selectedMessages: TimelineEventVM[] } {
    const events = buildTimelineEvents(messages);

    const countByThread = new Map<string, number>();
    const unreadByThread = new Map<string, number>();
    for (const m of messages) {
        const tid = m.thread_id ?? "";
        countByThread.set(tid, (countByThread.get(tid) ?? 0) + 1);
        if (m.direction === "inbound" && m.unread === true) unreadByThread.set(tid, (unreadByThread.get(tid) ?? 0) + 1);
    }

    const dedup = new Map<string, RawThreadRow>();
    for (const t of threads) if (t.id && !dedup.has(t.id)) dedup.set(t.id, t);

    const threadVms: ThreadVM[] = Array.from(dedup.values())
        .map((t) => {
            const type = t.primary_entity_type ?? "";
            const id = t.primary_entity_id ?? "";
            const childId = (type === "person" || type === "child") && ctx.childPersonIdToMemberId[id] ? ctx.childPersonIdToMemberId[id] : null;
            const opportunityId = type === "opportunity" && ctx.opportunityIds.has(id) ? id : null;
            return {
                id: t.id,
                subject: threadSubject(t),
                channel: t.channel ?? null,
                primaryEntity: { type, id },
                childId,
                opportunityId,
                lastActivityAt: t.last_message_at ?? null,
                messageCount: countByThread.get(t.id) ?? 0,
                unread: unreadByThread.get(t.id) ?? 0,
                slaState: t.sla_state ?? null,
                attentionState: t.attention_state ?? null,
            };
        })
        .sort((a, b) => String(b.lastActivityAt ?? "").localeCompare(String(a.lastActivityAt ?? "")));

    const selectedThread =
        (ctx.selectedThreadId ? threadVms.find((t) => t.id === ctx.selectedThreadId) : null) ?? threadVms[0] ?? null;
    const selectedMessages = selectedThread ? events.filter((e) => e.threadId === selectedThread.id) : [];

    return { threads: threadVms, timelineEvents: events, selectedThread, selectedMessages };
}
