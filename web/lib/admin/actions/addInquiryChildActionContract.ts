import {
    assertCanonicalIdPresent,
    assertRelationshipIdsPresent,
    type ActionCreationContract,
    validateActionCreationContractDeclared,
} from "@/lib/admin/actions/actionCreationContract";
import type { SubmitAddInquiryChildResult } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";

/** Add Child (Opportunity drawer) — must match Create Lead child identity doctrine. */
export const ADD_INQUIRY_CHILD_ACTION_CONTRACT: ActionCreationContract = {
    actionKey: "add_inquiry_child",
    canonicalEntity: "persons (durable child identity)",
    canonicalIdKey: "person_id",
    relationshipWrites: ["persons", "customer_members", "opportunity_customer_members"],
    contextWrites: [
        "customer_members (relationship=child, household membership)",
        "opportunity_customer_members (enrollment: program, location, room, schedule, start date)",
    ],
    affectedProjections: [
        "opportunity_drawer_vm (_inquiry_children)",
        "layout_runtime_body_cache (enrollment repeater)",
        "work_unit_queue_rows (_inquiry_children + childPersonId)",
    ],
    linkabilityTargets: [
        "opportunity_drawer_enrollment_child_card",
        "work_unit_queue_row_child_icon",
        "child_person_drawer (persons/{person_id})",
    ],
};

validateActionCreationContractDeclared(ADD_INQUIRY_CHILD_ACTION_CONTRACT);

export const ADD_INQUIRY_CHILD_RELATIONSHIP_ID_KEYS = [
    "customer_member_id",
    "ocm_id",
] as const;

export function assertAddInquiryChildCreationResult(
    result: SubmitAddInquiryChildResult,
): SubmitAddInquiryChildResult {
    assertCanonicalIdPresent(
        result,
        ADD_INQUIRY_CHILD_ACTION_CONTRACT.canonicalIdKey,
        ADD_INQUIRY_CHILD_ACTION_CONTRACT.actionKey,
    );
    assertRelationshipIdsPresent(
        result,
        ADD_INQUIRY_CHILD_RELATIONSHIP_ID_KEYS,
        ADD_INQUIRY_CHILD_ACTION_CONTRACT.actionKey,
    );
    return result;
}
