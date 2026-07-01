import { HOUSEHOLD_PRIMARY_CONTACT_CHANGED_EVENT_TYPE } from "@/lib/admin/actions/makePrimaryContactAction";
import { emitEvent } from "@/lib/emitEvent";

export type EmitHouseholdPrimaryContactChangedEventInput = {
    orgId: string;
    customerId: string;
    previousPrimaryPersonId: string | null;
    newPrimaryPersonId: string;
    opportunityIds: string[];
    actorUserId?: string | null;
};

/** Audit/workflow event after canonical household primary contact reassignment. */
export async function emitHouseholdPrimaryContactChangedEvent(
    input: EmitHouseholdPrimaryContactChangedEventInput,
): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: HOUSEHOLD_PRIMARY_CONTACT_CHANGED_EVENT_TYPE,
        entity_type: "customers",
        entity_id: input.customerId,
        action_type: "make_primary_contact",
        payload: {
            customer_id: input.customerId,
            previous_primary_person_id: input.previousPrimaryPersonId,
            new_primary_person_id: input.newPrimaryPersonId,
            opportunity_ids: input.opportunityIds,
            actor_user_id: input.actorUserId ?? null,
        },
    });
}
