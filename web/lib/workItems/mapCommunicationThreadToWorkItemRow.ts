/**
 * Communications → Work Items projection (Needs Reply convergence, read-only).
 */

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    conversationChannelLabel,
    conversationDisplayTitle,
    conversationDisplayTopic,
    type ConversationSummary,
} from "@/lib/communications/v2/commandCenterViewModel";
import {
    INBOUND_NEEDS_RESPONSE_STATE,
    isResolvedConversation,
} from "@/lib/communications/v2/conversationTriage";

export const COMMUNICATIONS_WORK_ITEM_ID_PREFIX = "communications:";

export function communicationWorkItemId(threadId: string): string {
    return `${COMMUNICATIONS_WORK_ITEM_ID_PREFIX}${threadId.trim()}`;
}

export function parseCommunicationThreadIdFromWorkItemId(id: string): string | null {
    const trimmed = id.trim();
    if (!trimmed.startsWith(COMMUNICATIONS_WORK_ITEM_ID_PREFIX)) return null;
    return trimmed.slice(COMMUNICATIONS_WORK_ITEM_ID_PREFIX.length) || null;
}

export function isCommunicationsProjectedWorkItem(
    task: Pick<MyTasksTaskRow, "id" | "communication_thread_id" | "is_communications_projection">,
): boolean {
    return Boolean(
        task.is_communications_projection
        || task.communication_thread_id?.trim()
        || parseCommunicationThreadIdFromWorkItemId(task.id),
    );
}

/** Authoritative Needs Reply predicate — not unread-only, not follow-up bucket. */
export function conversationRequiresReplyForWorkItemProjection(
    conversation: ConversationSummary,
): boolean {
    if (isResolvedConversation(conversation)) return false;
    if (conversation.scope_status && conversation.scope_status !== "resolved") return false;
    const attn = (conversation.attention_state ?? "").trim();
    return attn === INBOUND_NEEDS_RESPONSE_STATE || attn === "awaiting_parent_reply";
}

function activityIso(conversation: ConversationSummary): string {
    return (
        conversation.last_message_at?.trim()
        || conversation.last_activity_at?.trim()
        || new Date(0).toISOString()
    );
}

export function mapCommunicationThreadToWorkItemRow(
    conversation: ConversationSummary,
): MyTasksTaskRow | null {
    if (!conversationRequiresReplyForWorkItemProjection(conversation)) return null;

    const familyLabel = conversationDisplayTitle(conversation);
    const topic = conversationDisplayTopic(conversation);
    const channel = conversationChannelLabel(conversation.channel);
    const title = `Reply: ${familyLabel}`;
    const preview = conversation.last_message_preview?.trim();
    const assigned =
        conversation.assignment_state === "assigned" ? conversation.assigned_user_id?.trim() || null : null;

    return {
        id: communicationWorkItemId(conversation.id),
        title,
        description: preview ? `${channel} · ${preview}` : `${channel} · ${topic}`,
        due_at: activityIso(conversation),
        status: "open",
        source: "communications",
        entity_id: conversation.opportunity_id?.trim() || conversation.primary_entity_id?.trim() || null,
        entity_type: conversation.primary_entity_type?.trim() || (conversation.opportunity_id ? "opportunities" : null),
        assigned_to_user_id: assigned,
        created_at: activityIso(conversation),
        entity_label: familyLabel,
        household_label: familyLabel,
        contact_label: conversation.primary_contact_name?.trim() || null,
        location_id: conversation.location_id?.trim() || null,
        communication_thread_id: conversation.id,
        communication_lane: "needs_reply",
        communication_channel: conversation.channel?.trim() || null,
        communication_family_label: familyLabel,
        communication_topic_label: topic,
        communication_last_preview: preview || null,
        communication_last_activity_at: activityIso(conversation),
        is_communications_projection: true,
    };
}

export function mapCommunicationsQueueToWorkItemRows(
    conversations: ConversationSummary[],
): MyTasksTaskRow[] {
    const byId = new Map<string, MyTasksTaskRow>();
    for (const conversation of conversations) {
        const row = mapCommunicationThreadToWorkItemRow(conversation);
        if (row) byId.set(row.id, row);
    }
    return Array.from(byId.values());
}
