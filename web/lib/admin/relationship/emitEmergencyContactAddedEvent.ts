import { EMERGENCY_CONTACT_ADDED_EVENT_TYPE } from "@/lib/admin/actions/addEmergencyContactAction";
import type { RelationshipActionScope } from "@/lib/admin/relationship/relationshipActionContract";
import { emitEvent } from "@/lib/emitEvent";

export type EmitEmergencyContactAddedEventInput = {
    orgId: string;
    customerId: string;
    personId: string;
    contactId: string;
    roleKey: string;
    scope: RelationshipActionScope;
    customerMemberIds: string[];
    actorUserId?: string | null;
    sourceContext?: string | null;
};

/** Audit/workflow event after child-scoped emergency contact link write. */
export async function emitEmergencyContactAddedEvent(
    input: EmitEmergencyContactAddedEventInput,
): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: EMERGENCY_CONTACT_ADDED_EVENT_TYPE,
        entity_type: "customers",
        entity_id: input.customerId,
        action_type: "add_emergency_contact",
        payload: {
            customer_id: input.customerId,
            person_id: input.personId,
            contact_id: input.contactId,
            role_key: input.roleKey,
            scope: input.scope,
            customer_member_ids: input.customerMemberIds,
            actor_user_id: input.actorUserId ?? null,
            source_context: input.sourceContext ?? null,
        },
    });
}
