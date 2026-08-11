/**
 * Communications V2 — Command Center view-model (PKG-11). PURE, no I/O, no React.
 *
 * Operational-work queues (NOT email folders), metrics, and filtering for the global Command
 * Center. Queues key off communication_threads.attention_state. Consumed by the dark shell.
 */
import {
    INBOUND_NEEDS_RESPONSE_STATE,
    RESOLVED_ATTENTION_STATE,
    isNeedsReviewConversation,
    isResolvedConversation,
} from "@/lib/communications/v2/conversationTriage";
import { formatQueueRowPhoneDisplay } from "@/lib/presentation/runtime/formatQueueRowContactDisplay";
import type { CommunicationQueueScopeReason, QueueScopeStatus } from "@/lib/communications/v2/communicationQueueScopeResolution";
import {
    NEEDS_RESOLUTION_QUEUE,
    NEEDS_RESOLUTION_QUEUE_KEY,
    prepareCommandCenterQueue,
} from "@/lib/communications/v2/commandCenterQueueProjection";

export { NEEDS_RESOLUTION_QUEUE, NEEDS_RESOLUTION_QUEUE_KEY, prepareCommandCenterQueue };

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
    last_activity_at?: string | null;
    unread?: number | null;
    unread_count?: number | null;
    family_label?: string | null;
    recipient_key?: string | null;
    last_message_preview?: string | null;
    last_message_direction?: string | null;
    primary_contact_name?: string | null;
    child_names?: string[] | null;
    child_links?: Array<{ id: string; name: string }> | null;
    stage_label?: string | null;
    program_label?: string | null;
    opportunity_id?: string | null;
    primary_entity_type?: string | null;
    primary_entity_id?: string | null;
    primary_contact_person_id?: string | null;
    /** Resolved household id for live Family Communication Workspace (when thread anchors a family). */
    customer_id?: string | null;
    /** Conversation topic label (business context), distinct from family name. */
    topic_label?: string | null;
    /** Canonical queue scope resolution for runtime handoff. */
    scope_status?: QueueScopeStatus | null;
    scope_reason?: CommunicationQueueScopeReason | string | null;
    scope_unresolved_reason?: string | null;
};

export const OTHER_QUEUE_KEY = "other" as const;

export const FALLBACK_QUEUE = {
    key: OTHER_QUEUE_KEY,
    label: "All conversations",
} as const;

export type CommandCenterQueueSection = {
    key: string;
    label: string;
    items: ConversationSummary[];
};

export type CommandCenterFilters = {
    channel?: string | null;
    assignmentState?: string | null;
    locationId?: string | null;
    ownerUserId?: string | null;
    search?: string | null;
};

/** Group conversations into operational queues; unresolved rows route to review bucket. */
export function groupConversationsByQueue(
    conversations: ConversationSummary[]
): Record<string, ConversationSummary[]> {
    const out: Record<string, ConversationSummary[]> = {
        [OTHER_QUEUE_KEY]: [],
        [NEEDS_RESOLUTION_QUEUE_KEY]: [],
    };
    for (const q of OPERATIONAL_QUEUES) out[q.key] = [];
    for (const c of conversations) {
        if (c.scope_status && c.scope_status !== "resolved") {
            out[NEEDS_RESOLUTION_QUEUE_KEY].push(c);
            continue;
        }
        const key =
            typeof c.attention_state === "string" && c.attention_state.length > 0 && out[c.attention_state]
                ? c.attention_state
                : OTHER_QUEUE_KEY;
        out[key].push(c);
    }
    return out;
}

/** Operational queue sections plus the unclassified fallback when it has rows. */
export function visibleCommandCenterQueues(
    grouped: Record<string, ConversationSummary[]>
): CommandCenterQueueSection[] {
    const sections: CommandCenterQueueSection[] = OPERATIONAL_QUEUES.map((q) => ({
        key: q.key,
        label: q.label,
        items: grouped[q.key] ?? [],
    }));
    const otherItems = grouped[OTHER_QUEUE_KEY] ?? [];
    if (otherItems.length > 0) {
        sections.push({ key: FALLBACK_QUEUE.key, label: FALLBACK_QUEUE.label, items: otherItems });
    }
    const reviewItems = grouped[NEEDS_RESOLUTION_QUEUE_KEY] ?? [];
    if (reviewItems.length > 0) {
        sections.push({
            key: NEEDS_RESOLUTION_QUEUE.key,
            label: NEEDS_RESOLUTION_QUEUE.label,
            items: reviewItems,
        });
    }
    return sections.filter((s) => s.items.length > 0);
}

/** Flatten visible queue row ids in render order (for auto-selection). */
export function flattenVisibleConversationIds(sections: CommandCenterQueueSection[]): string[] {
    return sections.flatMap((s) => s.items.map((c) => c.id));
}

export function isQueueRowLoadable(c: ConversationSummary | null | undefined): boolean {
    return Boolean(c && c.scope_status === "resolved" && c.customer_id);
}

/**
 * Which conversation the workspace should show.
 *
 * "Loadable" means the family workspace can build a household view for the row,
 * and that is a good reason to prefer one when picking a DEFAULT. It is not a
 * reason to override the operator. Treating it as one meant a click on an
 * unidentified conversation — never loadable, because it has no household —
 * silently bounced the operator back to the first resolved row, so a parent Alloy
 * could not identify could not be opened at all.
 *
 * An explicit selection survives for as long as it is still visible; loadable
 * only decides where to start.
 */
export function resolveCommandCenterSelectionPreferringLoadable(
    selectedId: string | null,
    visibleIds: string[],
    loadableIds: string[]
): string | null {
    if (selectedId && visibleIds.includes(selectedId)) return selectedId;
    return resolveCommandCenterSelection(null, loadableIds.length > 0 ? loadableIds : visibleIds);
}

/** Prefer loadable canonical rows for initial selection. */
export function flattenLoadableConversationIds(sections: CommandCenterQueueSection[]): string[] {
    return sections.flatMap((s) => s.items.filter(isQueueRowLoadable).map((c) => c.id));
}

/** Keep current selection when still visible; otherwise pick the first visible row. */
export function resolveCommandCenterSelection(
    selectedId: string | null,
    visibleIds: string[]
): string | null {
    if (visibleIds.length === 0) return null;
    if (selectedId && visibleIds.includes(selectedId)) return selectedId;
    return visibleIds[0] ?? null;
}

export function conversationDisplayTitle(c: ConversationSummary): string {
    if (c.scope_status === "ambiguous") return "Needs identity review";
    if (c.scope_status === "unresolved") return "Unresolved conversation";
    const label = (c.family_label ?? "").trim();
    if (label && !label.includes("@") && label.toLowerCase() !== "family") return label;
    const contact = (c.primary_contact_name ?? "").trim();
    if (contact) return contact;
    if (c.customer_id) return "Household";
    return "Unresolved conversation";
}

export type QueueWorkspaceErrorDisplay = {
    title: string;
    message: string;
    canRetry: boolean;
};

export function resolveQueueWorkspaceError(
    selected: ConversationSummary | null,
    runtimeError: string | null
): QueueWorkspaceErrorDisplay | null {
    if (!selected) return null;
    if (selected.scope_status === "ambiguous") {
        return {
            title: "Needs identity review",
            message: "This conversation links to more than one household. Review the connection before replying.",
            canRetry: false,
        };
    }
    if (selected.scope_status === "unresolved" || !selected.customer_id) {
        const reason = (selected.scope_unresolved_reason ?? "").trim();
        if (reason === "inactive_or_missing_customer") {
            return {
                title: "Record no longer active",
                message: "This conversation references a household that is no longer active.",
                canRetry: false,
            };
        }
        if (reason === "person_without_household") {
            return {
                title: "Not linked to a family yet",
                message: "This conversation is anchored to a person without a household link.",
                canRetry: false,
            };
        }
        return {
            title: "Not linked to a family yet",
            message: "This conversation is not linked to a household yet. Review the connection before replying.",
            canRetry: false,
        };
    }
    if (runtimeError) {
        return {
            title: "Could not load this conversation",
            message: "Try again or select another conversation from the queue.",
            canRetry: true,
        };
    }
    return null;
}

/** Business topic for queue rows — never duplicates the family name. */
export function conversationDisplayTopic(c: ConversationSummary): string {
    const topic = (c.topic_label ?? "").trim();
    if (topic) return topic;
    return "General";
}

export function conversationDisplayChildren(c: ConversationSummary): string | null {
    if (!c.child_names?.length) return null;
    return c.child_names.join(", ");
}

export function formatConversationContactDisplay(recipientKey: string | null | undefined): string | null {
    const recipient = (recipientKey ?? "").trim();
    if (!recipient) return null;
    const phone = formatQueueRowPhoneDisplay(recipient);
    if (phone) {
        const digits = recipient.replace(/\D/g, "");
        if (digits.length === 11 && digits.startsWith("1")) return `+1 ${phone}`;
        return phone;
    }
    return recipient;
}

export function conversationDisplayRecipient(c: ConversationSummary): string | null {
    const formatted = formatConversationContactDisplay(c.recipient_key);
    if (!formatted) return null;
    const title = conversationDisplayTitle(c);
    if (formatted.toLowerCase() === title.toLowerCase()) return null;
    return formatted;
}

/** Distinct household count for queue headers (one family may have multiple topic rows). */
export function countDistinctQueueFamilies(conversations: ConversationSummary[]): number {
    const keys = new Set<string>();
    for (const c of conversations) {
        if (c.scope_status && c.scope_status !== "resolved") continue;
        const customerId = (c.customer_id ?? "").trim();
        if (customerId) {
            keys.add(`customer:${customerId}`);
        }
    }
    return keys.size;
}

export function conversationChannelLabel(channel: string | null | undefined): string {
    const c = (channel ?? "").trim().toLowerCase();
    if (c === "email") return "Email";
    if (c === "sms") return "SMS";
    if (c === "in_app") return "In-app";
    return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
}

export function conversationDisplaySubtitle(c: ConversationSummary): string {
    const parts: string[] = [];
    if (c.child_names?.length) parts.push(c.child_names.join(", "));
    if (c.stage_label) parts.push(c.stage_label);
    else if (c.program_label) parts.push(c.program_label);
    if (parts.length > 0) return parts.join(" · ");
    return conversationChannelLabel(c.channel);
}

export function conversationUnreadCount(c: ConversationSummary): number {
    const n = c.unread_count ?? c.unread;
    return typeof n === "number" && n > 0 ? n : 0;
}

/** Operator-facing label for threads without an operational attention_state queue assignment. */
export const NEEDS_REVIEW_STATUS_LABEL = "Needs review";

export function isUnclassifiedConversation(c: ConversationSummary): boolean {
    return isNeedsReviewConversation(c);
}

export type QueueStatusPill = { label: string; tone: "neutral" | "warn" | "danger" | "brand" };

/** Status pill from real attention/SLA fields — never fake "On track" for unclassified rows. */
export function conversationQueueStatusPill(c: ConversationSummary): QueueStatusPill {
    const sla = (c.sla_state ?? "").trim().toLowerCase();
    if (sla === "overdue") return { label: "Overdue", tone: "danger" };
    if (sla === "due" || sla === "first_response_due") return { label: "Due soon", tone: "warn" };
    const attn = (c.attention_state ?? "").trim();
    if (attn === RESOLVED_ATTENTION_STATE) return { label: "Resolved", tone: "brand" };
    if (attn === INBOUND_NEEDS_RESPONSE_STATE) return { label: "Needs response", tone: "warn" };
    if (attn === "awaiting_parent_reply") return { label: "Needs response", tone: "warn" };
    if (attn === "needs_follow_up") return { label: "Follow up", tone: "warn" };
    if (attn === "documents_missing") return { label: "Docs missing", tone: "warn" };
    if (isUnclassifiedConversation(c)) return { label: NEEDS_REVIEW_STATUS_LABEL, tone: "neutral" };
    if (sla === "on_track") return { label: "On track", tone: "brand" };
    return { label: "Active", tone: "neutral" };
}

export function queueStatusPillClass(tone: QueueStatusPill["tone"]): string {
    switch (tone) {
        case "danger":
            return "bg-alloy-ember text-white";
        case "warn":
            return "border border-alloy-amber/35 bg-alloy-amber/10 text-alloy-amber";
        case "brand":
            return "border border-alloy-juniper/35 bg-alloy-juniper/10 text-alloy-juniper";
        default:
            return "border border-alloy-stone/20 bg-alloy-stone/[0.06] text-alloy-midnight/55";
    }
}

/** Deterministic metrics for the Command Center strip. */
export function computeCommandCenterMetrics(conversations: ConversationSummary[]): {
    total: number;
    requiresResponse: number;
    slaAtRisk: number;
    unassigned: number;
    unread: number;
    unclassified: number;
} {
    let requiresResponse = 0;
    let slaAtRisk = 0;
    let unassigned = 0;
    let unread = 0;
    let unclassified = 0;
    for (const c of conversations) {
        if (isUnclassifiedConversation(c)) unclassified += 1;
        const attn = c.attention_state ?? "";
        const sla = c.sla_state ?? "";
        if (attn === "awaiting_parent_reply" || attn === "needs_follow_up" || sla === "first_response_due" || sla === "overdue") {
            requiresResponse += 1;
        }
        if (sla === "overdue") slaAtRisk += 1;
        if (c.assignment_state !== "assigned") unassigned += 1;
        unread += typeof c.unread === "number" ? c.unread : 0;
    }
    return { total: conversations.length, requiresResponse, slaAtRisk, unassigned, unread, unclassified };
}

export type CommandCenterHealthDisplay = {
    label: string | null;
    tone: string;
    dot: string;
};

/** Conservative health chip — no fake "Unresponsive" on sparse/unclassified threads. */
export function resolveCommandCenterHealthDisplay(
    conversation: ConversationSummary | null,
    messageCount: number,
    engagementScore: number
): CommandCenterHealthDisplay {
    const neutral = { label: null, tone: "text-alloy-midnight/45", dot: "bg-alloy-stone/40" };
    if (!conversation) return neutral;
    if (isResolvedConversation(conversation)) {
        return { label: "Resolved", tone: "text-alloy-juniper", dot: "bg-alloy-juniper" };
    }
    if (isUnclassifiedConversation(conversation)) {
        return { label: NEEDS_REVIEW_STATUS_LABEL, tone: "text-alloy-midnight/50", dot: "bg-alloy-stone/40" };
    }
    if (messageCount < 2) return neutral;
    if (engagementScore >= 66) {
        return { label: "Healthy", tone: "text-alloy-juniper", dot: "bg-alloy-juniper" };
    }
    if (engagementScore >= 33) {
        return { label: "At risk", tone: "text-alloy-amber", dot: "bg-alloy-amber" };
    }
    return { label: "Low engagement", tone: "text-red-600", dot: "bg-red-500" };
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
        if (search) {
            const haystack = [
                c.family_label,
                c.topic_label,
                c.recipient_key,
                c.primary_contact_name,
                c.last_message_preview,
                c.stage_label,
                ...(c.child_names ?? []),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
}
