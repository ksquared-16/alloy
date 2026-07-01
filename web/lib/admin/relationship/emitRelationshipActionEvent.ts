import { emitEvent } from "@/lib/emitEvent";
import type { RelationshipActionExecutionRequest } from "@/lib/admin/relationship/relationshipActionContract";

export const RELATIONSHIP_ACTION_EXECUTED_EVENT_TYPE = "relationship.action_executed" as const;

export async function emitRelationshipActionEvent(input: {
    orgId: string;
    customerId: string;
    request: RelationshipActionExecutionRequest;
    personId: string | null;
    contactId: string | null;
    roleKey: string | null;
    customerMemberIds: string[];
    linksWritten: number;
    actorUserId?: string | null;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: RELATIONSHIP_ACTION_EXECUTED_EVENT_TYPE,
        entity_type: "customers",
        entity_id: input.customerId,
        action_type: input.request.actionKey,
        payload: {
            action_key: input.request.actionKey,
            source_surface: input.request.sourceSurface,
            source_record_id: input.request.sourceRecordId,
            role_key: input.roleKey,
            scope: input.request.scope,
            person_id: input.personId,
            contact_id: input.contactId,
            customer_member_ids: input.customerMemberIds,
            links_written: input.linksWritten,
            actor_user_id: input.actorUserId ?? null,
        },
    });
}
