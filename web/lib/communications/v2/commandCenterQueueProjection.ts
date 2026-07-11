/**
 * Command Center queue projection — canonical vs review partitioning, dedupe, topic keys.
 * PURE; consumes enriched ConversationSummary rows.
 */
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

export const NEEDS_RESOLUTION_QUEUE_KEY = "needs_resolution" as const;

export const NEEDS_RESOLUTION_QUEUE = {
    key: NEEDS_RESOLUTION_QUEUE_KEY,
    label: "Needs resolution",
} as const;

export type CommandCenterQueueProjection = {
    canonical: ConversationSummary[];
    needsResolution: ConversationSummary[];
};

function unreadCount(c: ConversationSummary): number {
    const n = c.unread_count ?? c.unread;
    return typeof n === "number" && n > 0 ? n : 0;
}

function activityTimestamp(c: ConversationSummary): string {
    return c.last_activity_at ?? c.last_message_at ?? "";
}

/** Stable topic identity within a household queue projection. */
export function queueTopicProjectionKey(c: ConversationSummary): string {
    const topic = (c.topic_label ?? "general").trim().toLowerCase() || "general";
    const channel = (c.channel ?? "").trim().toLowerCase() || "unknown";
    return `${topic}::${channel}`;
}

/** Stable family grouping key — customer_id only (never display label). */
export function queueFamilyProjectionKey(c: ConversationSummary): string | null {
    const customerId = (c.customer_id ?? "").trim();
    return customerId || null;
}

/**
 * Deduplicate canonical rows that project the same family + topic.
 * Keeps the row with the newest activity (then higher unread).
 */
export function deduplicateQueueProjections(rows: ConversationSummary[]): ConversationSummary[] {
    const byKey = new Map<string, ConversationSummary>();
    for (const row of rows) {
        const familyKey = queueFamilyProjectionKey(row);
        if (!familyKey) {
            byKey.set(`unscoped:${row.id}`, row);
            continue;
        }
        const key = `${familyKey}|${queueTopicProjectionKey(row)}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, row);
            continue;
        }
        const existingAt = activityTimestamp(existing);
        const rowAt = activityTimestamp(row);
        const existingUnread = unreadCount(existing);
        const rowUnread = unreadCount(row);
        if (rowAt > existingAt || (rowAt === existingAt && rowUnread > existingUnread)) {
            byKey.set(key, row);
        }
    }
    return [...byKey.values()].sort((a, b) => activityTimestamp(b).localeCompare(activityTimestamp(a)));
}

export function partitionCommandCenterQueue(rows: ConversationSummary[]): CommandCenterQueueProjection {
    const canonical: ConversationSummary[] = [];
    const needsResolution: ConversationSummary[] = [];
    for (const row of rows) {
        if (row.scope_status === "resolved" && row.customer_id) canonical.push(row);
        else needsResolution.push(row);
    }
    return {
        canonical: deduplicateQueueProjections(canonical),
        needsResolution,
    };
}

export function prepareCommandCenterQueue(rows: ConversationSummary[]): ConversationSummary[] {
    const { canonical, needsResolution } = partitionCommandCenterQueue(rows);
    return [...canonical, ...needsResolution];
}
