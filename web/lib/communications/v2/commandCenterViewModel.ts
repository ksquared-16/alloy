/**
 * Communications V2 — Command Center view-model (PKG-11). PURE, no I/O, no React.
 *
 * Operational-work queues (NOT email folders), metrics, and filtering for the global Command
 * Center. Queues key off communication_threads.attention_state. Consumed by the dark shell.
 */

export const OPERATIONAL_QUEUES = [
    { key: "awaiting_parent_reply", label: "Awaiting Parent Reply" },
    { key: "needs_follow_up", label: "Needs Follow-Up" },
    { key: "documents_missing", label: "Documents Missing" },
    { key: "re_enrollment_outreach", label: "Re-enrollment Outreach" },
    { key: "waitlist_update", label: "Waitlist Update" },
] as const;

export type OperationalQueueKey = (typeof OPERATIONAL_QUEUES)[number]["key"];

export type ConversationSummary = {
    id: string;
    attention_state?: string | null;
    channel?: string | null;
    assignment_state?: string | null;
    assigned_user_id?: string | null;
    location_id?: string | null;
    sla_state?: string | null;
    last_message_at?: string | null;
    unread?: number | null;
    family_label?: string | null;
};

export type CommandCenterFilters = {
    channel?: string | null;
    assignmentState?: string | null;
    locationId?: string | null;
    ownerUserId?: string | null;
    search?: string | null;
};

/** Group conversations into the operational queues (unknown attention_state → "other"). */
export function groupConversationsByQueue(
    conversations: ConversationSummary[]
): Record<string, ConversationSummary[]> {
    const out: Record<string, ConversationSummary[]> = { other: [] };
    for (const q of OPERATIONAL_QUEUES) out[q.key] = [];
    for (const c of conversations) {
        const key = typeof c.attention_state === "string" && out[c.attention_state] ? c.attention_state : "other";
        out[key].push(c);
    }
    return out;
}

/** Deterministic metrics for the Command Center strip. */
export function computeCommandCenterMetrics(conversations: ConversationSummary[]): {
    total: number;
    requiresResponse: number;
    slaAtRisk: number;
    unassigned: number;
    unread: number;
} {
    let requiresResponse = 0;
    let slaAtRisk = 0;
    let unassigned = 0;
    let unread = 0;
    for (const c of conversations) {
        const attn = c.attention_state ?? "";
        const sla = c.sla_state ?? "";
        if (attn === "awaiting_parent_reply" || attn === "needs_follow_up" || sla === "first_response_due" || sla === "overdue") {
            requiresResponse += 1;
        }
        if (sla === "overdue") slaAtRisk += 1;
        if (c.assignment_state !== "assigned") unassigned += 1;
        unread += typeof c.unread === "number" ? c.unread : 0;
    }
    return { total: conversations.length, requiresResponse, slaAtRisk, unassigned, unread };
}

/** Apply Command Center filters (channel/status/owner/location/search). Pure. */
export function applyQueueFilters(
    conversations: ConversationSummary[],
    filters: CommandCenterFilters
): ConversationSummary[] {
    const search = (filters.search ?? "").trim().toLowerCase();
    return conversations.filter((c) => {
        if (filters.channel && c.channel !== filters.channel) return false;
        if (filters.assignmentState && (c.assignment_state ?? "unassigned") !== filters.assignmentState) return false;
        if (filters.locationId && c.location_id !== filters.locationId) return false;
        if (filters.ownerUserId && c.assigned_user_id !== filters.ownerUserId) return false;
        if (search && !(c.family_label ?? "").toLowerCase().includes(search)) return false;
        return true;
    });
}
