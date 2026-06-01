import type { InboxReplyTarget } from "@/lib/communications/inboxThreadIdentity";
import type { InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";

export const MESSAGING_SCHEDULE_SEND_TECHNICAL_GAP =
    "POST /api/admin/communication-scheduled-sends accepts entity_type=opportunities only, source=task_assist, and a recipient_person_id. Inbox/Compose scheduling for person-only threads or non-opportunity anchors requires extending validateCommunicationScheduledSendCreateBody and process-due metadata (see communicationScheduledSendsService.ts).";

export type MessagingScheduleContext =
    | {
          ok: true;
          entityId: string;
          recipientPersonId: string;
      }
    | {
          ok: false;
          reason: string;
          technicalGap: string;
      };

export function resolveInboxThreadScheduleContext(
    thread: Pick<InboxThreadListItem, "primary_entity_type" | "primary_entity_id" | "reply_person_id">,
    replyTarget: Pick<InboxReplyTarget, "recipientPersonId" | "canReply">
): MessagingScheduleContext {
    if (!replyTarget.canReply) {
        return {
            ok: false,
            reason: "Reply is unavailable for this thread.",
            technicalGap: MESSAGING_SCHEDULE_SEND_TECHNICAL_GAP,
        };
    }
    const entityType = thread.primary_entity_type.trim().toLowerCase();
    const entityId = thread.primary_entity_id.trim();
    if (entityType !== "opportunities" || !entityId) {
        return {
            ok: false,
            reason: "Send later requires an opportunity-linked conversation.",
            technicalGap: MESSAGING_SCHEDULE_SEND_TECHNICAL_GAP,
        };
    }
    const recipientPersonId = replyTarget.recipientPersonId?.trim() ?? thread.reply_person_id?.trim() ?? "";
    if (!recipientPersonId) {
        return {
            ok: false,
            reason: "Send later requires a person recipient on this thread.",
            technicalGap: MESSAGING_SCHEDULE_SEND_TECHNICAL_GAP,
        };
    }
    return { ok: true, entityId, recipientPersonId };
}

export function resolveComposeNewScheduleContext(params: {
    opportunityId?: string | null;
    recipientPersonIds: string[];
}): MessagingScheduleContext {
    const entityId = params.opportunityId?.trim() ?? "";
    if (!entityId) {
        return {
            ok: false,
            reason: "Send later from Compose New requires launching from a record with an opportunity anchor.",
            technicalGap: MESSAGING_SCHEDULE_SEND_TECHNICAL_GAP,
        };
    }
    if (params.recipientPersonIds.length !== 1) {
        return {
            ok: false,
            reason: "Send later supports one recipient at a time.",
            technicalGap: MESSAGING_SCHEDULE_SEND_TECHNICAL_GAP,
        };
    }
    return { ok: true, entityId, recipientPersonId: params.recipientPersonIds[0]! };
}
