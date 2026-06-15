// UI-5B — PURE: raw family threads + messages -> ThreadVM[] + aggregated TimelineEventVM[].
// MERGE POINT for the family-conversation-vs-transport-threads decision — see THREAD_SEMANTICS.md.
// One unified family timeline is built by unioning all per-recipient/per-channel transport threads.
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
    status?: string | null;
    sent_at?: string | null;
};

// UI-5H — per-message receipt rollup from communication_message_recipients (a message may have
// several recipients; take the most-progressed timestamp across them). Pure.
export type RawRecipientReceiptRow = {
    message_id?: string | null;
    status?: string | null;
    delivered_at?: string | null;
    opened_at?: string | null;
    replied_at?: string | null;
};
const maxIso = (a: string | null | undefined, b: string | null | undefined): string | null => {
    const av = a ?? null, bv = b ?? null;
    if (!av) return bv;
    if (!bv) return av;
    return av >= bv ? av : bv;
};
export function rollupRecipientReceipts(rows: RawRecipientReceiptRow[]): Record<string, { deliveredAt: string | null; openedAt: string | null; repliedAt: string | null }> {
    const out: Record<string, { deliveredAt: string | null; openedAt: string | null; repliedAt: string | null }> = {};
    for (const r of rows) {
        const mid = r.message_id ?? "";
        if (!mid) continue;
        const cur = out[mid] ?? { deliveredAt: null, openedAt: null, repliedAt: null };
        out[mid] = {
            deliveredAt: maxIso(cur.deliveredAt, r.delivered_at),
            openedAt: maxIso(cur.openedAt, r.opened_at),
            repliedAt: maxIso(cur.repliedAt, r.replied_at),
        };
    }
    return out;
}

// P6 — per-recipient/read-model: mark inbound messages unread for a viewer given the set of
// inbound message ids that viewer has read (communication_message_reads). Pure (mutates in place).
export function markUnreadFromReads(messages: RawMessageRow[], readMessageIds: ReadonlySet<string>): void {
    for (const m of messages) {
        if ((m.direction ?? "") !== "inbound") continue;
        m.unread = !readMessageIds.has(m.id);
    }
}

// UI-5H — derive a single display status for a timeline message (most-progressed wins). Pure.
export function deriveTimelineStatus(m: RawMessageRow, direction: string | null | undefined): string | null {
    if (direction === "inbound") return "received";
    if (direction !== "outbound") return null; // notes/system have no delivery status
    if ((m.status ?? "") === "failed") return "failed";
    if (m.replied_at) return "replied";
    if (m.opened_at) return "opened";
    if (m.delivered_at) return "delivered";
    if ((m.status ?? "") === "sent" || m.sent_at) return "sent";
    return "queued";
}

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
            sentAt: m.sent_at ?? null,
            status: deriveTimelineStatus(m, m.direction),
        }))
        .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
}

export function aggregateFamilyThreads(
    threads: RawThreadRow[],
    messages: RawMessageRow[],
    ctx: AggregateContext
): {
    threads: ThreadVM[];
    timelineEvents: TimelineEventVM[];
    selectedThread: ThreadVM | null;
    selectedMessages: TimelineEventVM[];
    familyUnread: number;
    lastFamilyActivityAt: string | null;
} {
    const events = buildTimelineEvents(messages);

    const countByThread = new Map<string, number>();
    const unreadByThread = new Map<string, number>();
    const lastMessageAtByThread = new Map<string, string>();
    for (const m of messages) {
        const tid = m.thread_id ?? "";
        countByThread.set(tid, (countByThread.get(tid) ?? 0) + 1);
        if (m.direction === "inbound" && m.unread === true) unreadByThread.set(tid, (unreadByThread.get(tid) ?? 0) + 1);
        const at = m.created_at ?? null;
        if (at) {
            const cur = lastMessageAtByThread.get(tid) ?? null;
            if (!cur || at > cur) lastMessageAtByThread.set(tid, at);
        }
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
                lastActivityAt: t.last_message_at ?? lastMessageAtByThread.get(t.id) ?? null,
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

    // P6 — family-level rollups across all transport threads.
    const familyUnread = threadVms.reduce((sum, t) => sum + (t.unread ?? 0), 0);
    let lastFamilyActivityAt: string | null = null;
    for (const t of threadVms) {
        const at = t.lastActivityAt;
        if (at && (!lastFamilyActivityAt || at > lastFamilyActivityAt)) lastFamilyActivityAt = at;
    }

    return { threads: threadVms, timelineEvents: events, selectedThread, selectedMessages, familyUnread, lastFamilyActivityAt };
}
