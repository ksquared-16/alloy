/**
 * Layout runtime — add_emergency_contact relationship action context and visibility.
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    readHouseholdAdultCandidatesFromRuntimeRecord,
    readHouseholdChildrenFromRuntimeRecord,
    type RelationshipActionHouseholdChildTarget,
    type RelationshipActionPersonCandidate,
} from "@/lib/admin/relationship/relationshipActionContract";

export type AddEmergencyContactActionContext = {
    customerId: string;
    childPersonId: string;
    anchorCustomerMemberId: string;
    childDisplayName: string;
    householdChildren: RelationshipActionHouseholdChildTarget[];
    householdAdultCandidates: RelationshipActionPersonCandidate[];
};

function trimId(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text || null;
}

export function resolveAddEmergencyContactActionContext(args: {
    anchorRecord: ProofRuntimeRecord;
}): AddEmergencyContactActionContext | null {
    const record = args.anchorRecord;
    const customerId = trimId(record.customer_id);
    const childPersonId = trimId(record["child.id"]) ?? trimId(record.id);
    const anchorCustomerMemberId =
        trimId(record.customer_member_id)
        ?? trimId(record["child.customer_member_id"]);
    if (!customerId || !childPersonId || !anchorCustomerMemberId) return null;

    const householdChildren = readHouseholdChildrenFromRuntimeRecord(record);
    const childDisplayName =
        trimId(record["child.name"])
        ?? trimId(record.display_name)
        ?? householdChildren.find((child) => child.customer_member_id === anchorCustomerMemberId)?.display_name
        ?? "This child";

    return {
        customerId,
        childPersonId,
        anchorCustomerMemberId,
        childDisplayName,
        householdChildren,
        householdAdultCandidates: readHouseholdAdultCandidatesFromRuntimeRecord(record),
    };
}

export function shouldShowAddEmergencyContactAction(args: {
    context: AddEmergencyContactActionContext | null;
    canMutate: boolean;
}): boolean {
    return Boolean(args.context && args.canMutate);
}
