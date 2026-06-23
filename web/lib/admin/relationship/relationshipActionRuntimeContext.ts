/**
 * Layout runtime — resolve RelationshipActionContext from anchor record.
 */

import type {
    RelationshipActionContext,
    RelationshipActionSourceSurface,
} from "@/lib/admin/relationship/relationshipActionContract";
import {
    readHouseholdAdultCandidatesFromRuntimeRecord,
    readHouseholdChildrenFromRuntimeRecord,
} from "@/lib/admin/relationship/relationshipActionContract";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimId(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text || null;
}

export function resolveRelationshipActionContext(args: {
    anchorRecord: ProofRuntimeRecord;
    sourceSurface: RelationshipActionSourceSurface;
}): RelationshipActionContext | null {
    const record = args.anchorRecord;
    const customerId = trimId(record.customer_id);
    if (!customerId) return null;

    const childPersonId = trimId(record["child.id"]) ?? null;
    const opportunityId = trimId(record.id) ?? trimId(record.opportunity_id);
    const personId = trimId(record["person.id"]) ?? trimId(record.person_id);

    let sourceEntityType: RelationshipActionContext["sourceEntityType"];
    let sourceRecordId: string | null = null;

    if (args.sourceSurface === "child_drawer" || childPersonId) {
        sourceEntityType = "child";
        sourceRecordId = childPersonId ?? trimId(record.id);
    } else if (args.sourceSurface === "person_drawer" || (personId && !opportunityId)) {
        sourceEntityType = "person";
        sourceRecordId = personId ?? trimId(record.id);
    } else {
        sourceEntityType = "opportunity";
        sourceRecordId = opportunityId ?? trimId(record.id);
    }

    if (!sourceRecordId) return null;

    const anchorCustomerMemberId =
        trimId(record.customer_member_id)
        ?? trimId(record["child.customer_member_id"]);
    const householdChildren = readHouseholdChildrenFromRuntimeRecord(record);

    return {
        sourceSurface: args.sourceSurface,
        sourceRecordId,
        sourceEntityType,
        sourceOpportunityId: sourceEntityType === "opportunity" ? sourceRecordId : opportunityId,
        sourceChildPersonId: childPersonId,
        sourceCustomerId: customerId,
        anchorCustomerMemberId,
        householdChildren,
        householdAdultCandidates: readHouseholdAdultCandidatesFromRuntimeRecord(record),
        householdChildCandidates: householdChildren,
        childDisplayName:
            trimId(record["child.name"])
            ?? trimId(record.display_name)
            ?? householdChildren.find((c) => c.customer_member_id === anchorCustomerMemberId)?.display_name
            ?? "This child",
    };
}

export function shouldShowRelationshipAction(args: {
    context: RelationshipActionContext | null;
    canMutate: boolean;
}): boolean {
    return Boolean(args.context && args.canMutate);
}
