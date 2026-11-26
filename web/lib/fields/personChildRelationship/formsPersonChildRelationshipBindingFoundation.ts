/**
 * Forms binding foundation — relationship collection item = relationship instance.
 */

import { personChildRelationshipProviderRef } from "./personChildRelationshipFieldRegistry";

export type FormsRelationshipCollectionItemBinding = {
    collection_key: "emergency_contacts" | "authorized_pickups" | "parents_guardians";
    item_grain: "person_child_relationship";
    relationship_id: string;
    person_id: string;
    customer_member_id: string;
    provider_refs: readonly string[];
};

export function buildFormsEmergencyContactItemBinding(args: {
    relationshipId: string;
    personId: string;
    customerMemberId: string;
}): FormsRelationshipCollectionItemBinding {
    return {
        collection_key: "emergency_contacts",
        item_grain: "person_child_relationship",
        relationship_id: args.relationshipId,
        person_id: args.personId,
        customer_member_id: args.customerMemberId,
        provider_refs: [
            "person.display_name",
            "person.email",
            "person.phone",
            personChildRelationshipProviderRef("relationship_type"),
            personChildRelationshipProviderRef("priority"),
            personChildRelationshipProviderRef("authorized_pickup"),
        ],
    };
}
