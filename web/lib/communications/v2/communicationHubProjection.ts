/**
 * The operator's communication HUB — one row per party, not one per thread.
 *
 * THE DEFECT THIS REPLACES. The queue deduplicated on
 * `customer_id | topic::channel`. That key treats a topic and a channel as part
 * of WHO the conversation is with, so a family holding three email subjects and
 * one SMS thread produced four rows — every one of them labelled
 *
 *     Kurzman Family
 *
 * with nothing on the row to say which was which. They were not duplicates in
 * storage and deduplication could never have removed them: they are four
 * genuinely distinct threads. The mistake was the GRAIN. An operator does not
 * think "I have four conversations with the Kurzmans"; they think "I have the
 * Kurzmans, and there are some emails and some texts."
 *
 * So the queue's grain is now the PARTY, and threads become children of it.
 *
 *     Kurzman Family                     <- one hub, one row
 *       ├── Email · Tour availability    <- children, still canonical threads
 *       ├── Email · Enrollment paperwork
 *       └── SMS
 *
 * WHAT DEFINES A HUB, and what deliberately does not:
 *
 *   family      `customer_id`, when the queue scope RESOLVED to one. The
 *               household is a canonical relationship, not an inference.
 *   person      a resolved person anchor with no household. A standalone
 *               contact is a hub in their own right.
 *   unresolved  everything else, and NEVER merged into a family. An unknown or
 *               ambiguous sender stays its own row.
 *
 * A SHARED ENDPOINT IS NOT A FAMILY. Two people at one phone number or one email
 * address are not thereby one household — that inference is exactly what
 * `resolveCommunicationQueueScope` refuses to make, and this module never
 * second-guesses it. Grouping is by resolved canonical id only. Two unresolved
 * conversations from the same address stay two rows, because Alloy does not know
 * they are one party.
 *
 * NOTHING HERE MUTATES HISTORY. Threads and messages are untouched; this is a
 * read-side projection over rows the enrichment already produced.
 *
 * Pure: rows in, hubs out.
 */

import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";
import {
    INBOUND_NEEDS_RESPONSE_STATE,
    RESOLVED_ATTENTION_STATE,
    isNeedsReviewConversation,
} from "@/lib/communications/v2/conversationTriage";

export type CommunicationHubKind = "family" | "person" | "unresolved";

export type CommunicationHubChannel = "email" | "sms" | "other";

export type CommunicationHub = {
    /** Stable across reloads: derived from canonical ids, never from a label. */
    key: string;
    kind: CommunicationHubKind;
    /** Household id for a family hub. */
    customerId: string | null;
    /** Person anchor for a standalone-person hub. */
    personId: string | null;
    /** What the operator reads. Falls back honestly rather than inventing. */
    label: string;
    /** Every canonical conversation under this hub, newest activity first. */
    conversations: ConversationSummary[];
    /** Thread ids, newest first. The hub's children, deterministically ordered. */
    threadIds: string[];
    /** Which channels this hub actually holds. */
    channels: CommunicationHubChannel[];
    /** Sum of unread across DISTINCT threads. */
    unread: number;
    /** Conversations awaiting a reply from us. */
    needsReplyCount: number;
    /** Conversations with no operational classification yet. */
    needsReviewCount: number;
    /** Newest activity anywhere under the hub — what the queue orders on. */
    lastActivityAt: string | null;
    /**
     * The conversation to open when the hub is selected: the newest one that is
     * not already resolved, else simply the newest. Deterministic, so selecting a
     * hub twice lands in the same place.
     */
    primaryConversationId: string | null;
};

function activityTimestamp(c: ConversationSummary): string {
    return c.last_activity_at ?? c.last_message_at ?? "";
}

function unreadCount(c: ConversationSummary): number {
    const n = c.unread_count ?? c.unread;
    return typeof n === "number" && n > 0 ? n : 0;
}

export function hubChannelOf(c: ConversationSummary): CommunicationHubChannel {
    const channel = String(c.channel ?? "").trim().toLowerCase();
    if (channel === "email") return "email";
    if (channel === "sms") return "sms";
    return "other";
}

/** Awaiting our reply — the inbound-written state and the operator-set one. */
function isNeedsReply(c: ConversationSummary): boolean {
    const attn = String(c.attention_state ?? "").trim();
    return attn === INBOUND_NEEDS_RESPONSE_STATE || attn === "awaiting_parent_reply";
}

/**
 * Which hub a conversation belongs to.
 *
 * Only a RESOLVED scope may join a family hub. A row whose scope is unresolved or
 * ambiguous keys on its own thread id, so it can never be absorbed into a family
 * by an endpoint guess — the failure this grain change is most able to cause, and
 * the one it must not.
 */
export function hubKeyFor(c: ConversationSummary): { key: string; kind: CommunicationHubKind } {
    const resolved = c.scope_status === "resolved";
    const customerId = String(c.customer_id ?? "").trim();
    if (resolved && customerId) return { key: `family:${customerId}`, kind: "family" };

    const entityType = String(c.primary_entity_type ?? "").trim().toLowerCase();
    const entityId = String(c.primary_entity_id ?? "").trim();
    if (resolved && entityId && (entityType === "persons" || entityType === "person")) {
        return { key: `person:${entityId}`, kind: "person" };
    }

    // Its own hub. Two unresolved conversations from the same address stay two
    // rows: Alloy does not know they are one party, and saying otherwise here
    // would be the endpoint guess the scope resolver already declined to make.
    return { key: `unresolved:${c.id}`, kind: "unresolved" };
}

/** The hub's name, from the strongest identity available. Never a raw id. */
function hubLabel(kind: CommunicationHubKind, rows: ConversationSummary[]): string {
    for (const r of rows) {
        const family = String(r.family_label ?? "").trim();
        if (kind === "family" && family) return family;
    }
    for (const r of rows) {
        const contact = String(r.primary_contact_name ?? "").trim();
        if (contact) return contact;
    }
    for (const r of rows) {
        const recipient = String(r.recipient_key ?? "").trim();
        if (recipient) return recipient;
    }
    return kind === "unresolved" ? "Unresolved conversation" : "Conversation";
}

/**
 * Roll conversations up into hubs.
 *
 * Aggregation counts each CONVERSATION once. The rows arriving here are already
 * one-per-thread, and the hub is a set of them keyed by thread id, so a thread
 * appearing twice in the input contributes once — which is what makes the unread
 * total safe to show beside a row that now stands for several threads.
 */
export function buildCommunicationHubs(rows: ConversationSummary[]): CommunicationHub[] {
    const grouped = new Map<string, { kind: CommunicationHubKind; byThreadId: Map<string, ConversationSummary> }>();

    for (const row of rows) {
        const { key, kind } = hubKeyFor(row);
        let bucket = grouped.get(key);
        if (!bucket) {
            bucket = { kind, byThreadId: new Map() };
            grouped.set(key, bucket);
        }
        const existing = bucket.byThreadId.get(row.id);
        if (!existing || activityTimestamp(row) > activityTimestamp(existing)) {
            bucket.byThreadId.set(row.id, row);
        }
    }

    const hubs: CommunicationHub[] = [];
    for (const [key, bucket] of grouped) {
        const conversations = [...bucket.byThreadId.values()].sort((a, b) =>
            activityTimestamp(b).localeCompare(activityTimestamp(a))
        );

        const channels: CommunicationHubChannel[] = [];
        for (const c of conversations) {
            const channel = hubChannelOf(c);
            if (!channels.includes(channel)) channels.push(channel);
        }

        const openest =
            conversations.find((c) => String(c.attention_state ?? "").trim() !== RESOLVED_ATTENTION_STATE) ??
            conversations[0] ??
            null;

        hubs.push({
            key,
            kind: bucket.kind,
            customerId: conversations.find((c) => String(c.customer_id ?? "").trim())?.customer_id ?? null,
            personId:
                bucket.kind === "person"
                    ? conversations.find((c) => String(c.primary_entity_id ?? "").trim())?.primary_entity_id ?? null
                    : null,
            label: hubLabel(bucket.kind, conversations),
            conversations,
            threadIds: conversations.map((c) => c.id),
            channels,
            unread: conversations.reduce((sum, c) => sum + unreadCount(c), 0),
            needsReplyCount: conversations.filter(isNeedsReply).length,
            needsReviewCount: conversations.filter(isNeedsReviewConversation).length,
            lastActivityAt: activityTimestamp(conversations[0] ?? ({} as ConversationSummary)) || null,
            primaryConversationId: openest?.id ?? null,
        });
    }

    // Newest relevant activity anywhere under the hub. A family whose most recent
    // contact was an SMS outranks one whose most recent was an older email, which
    // is what an operator means by "what happened last".
    return hubs.sort((a, b) => String(b.lastActivityAt ?? "").localeCompare(String(a.lastActivityAt ?? "")));
}

export type CommunicationHubSection = {
    key: string;
    label: string;
    hubs: CommunicationHub[];
};

/**
 * Group hubs into the queue's sections.
 *
 * A hub can hold conversations in several attention states at once, so it is
 * placed by the state of the conversation an operator would open — the same
 * `primaryConversationId` that selecting the row lands on. Anything else would
 * file a row under a heading, then open something that contradicts it.
 *
 * `sections` is supplied by the caller so this module does not become a second
 * owner of the queue vocabulary; `commandCenterViewModel` remains the authority
 * on which queues exist and what they are called.
 */
export function groupHubsIntoSections(
    hubs: readonly CommunicationHub[],
    sections: ReadonlyArray<{ key: string; label: string }>,
    options: { unresolvedSectionKey: string; fallbackSectionKey: string }
): CommunicationHubSection[] {
    const byKey = new Map<string, CommunicationHub[]>();
    for (const s of sections) byKey.set(s.key, []);
    byKey.set(options.unresolvedSectionKey, byKey.get(options.unresolvedSectionKey) ?? []);
    byKey.set(options.fallbackSectionKey, byKey.get(options.fallbackSectionKey) ?? []);

    for (const hub of hubs) {
        // An unresolved party is unresolved regardless of any attention state on
        // its conversation: the operator's next action is to identify who it is.
        if (hub.kind === "unresolved") {
            byKey.get(options.unresolvedSectionKey)!.push(hub);
            continue;
        }
        const primary = hub.conversations.find((c) => c.id === hub.primaryConversationId) ?? hub.conversations[0];
        const attention = String(primary?.attention_state ?? "").trim();
        const bucket = attention && byKey.has(attention) ? attention : options.fallbackSectionKey;
        byKey.get(bucket)!.push(hub);
    }

    const labelOf = (key: string): string => sections.find((s) => s.key === key)?.label ?? key;
    return [...byKey.entries()]
        .filter(([, items]) => items.length > 0)
        .map(([key, items]) => ({ key, label: labelOf(key), hubs: items }));
}

/** Every conversation id the queue is showing, in render order. */
export function flattenHubConversationIds(sections: readonly CommunicationHubSection[]): string[] {
    return sections.flatMap((s) => s.hubs.flatMap((h) => h.threadIds));
}

/** The conversation each visible hub row opens, in render order. */
export function flattenHubPrimaryConversationIds(sections: readonly CommunicationHubSection[]): string[] {
    return sections
        .flatMap((s) => s.hubs.map((h) => h.primaryConversationId))
        .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** The hub a given conversation is displayed under, or null. */
export function findHubForConversation(
    hubs: readonly CommunicationHub[],
    conversationId: string | null | undefined
): CommunicationHub | null {
    const id = String(conversationId ?? "").trim();
    if (!id) return null;
    return hubs.find((h) => h.threadIds.includes(id)) ?? null;
}

/**
 * The hub's conversations on ONE channel, newest first.
 *
 * Email and SMS are different shapes of conversation, not two filters over one
 * list: email is a set of subject threads, SMS is a single running exchange. The
 * channel views are built from this rather than from a mixed timeline, which is
 * what keeps an SMS out of the email list and vice versa.
 */
export function hubConversationsForChannel(
    hub: CommunicationHub | null,
    channel: CommunicationHubChannel
): ConversationSummary[] {
    if (!hub) return [];
    return hub.conversations.filter((c) => hubChannelOf(c) === channel);
}
