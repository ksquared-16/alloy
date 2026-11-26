"use client";

import RelationshipActionGuidedModal from "@/components/layout/RelationshipActionGuidedModal";
import {
    resolveRelationshipActionContext,
} from "@/lib/admin/relationship/relationshipActionRuntimeContext";
import type { AddEmergencyContactActionContext } from "@/lib/layout/runtime/layoutRuntimeAddEmergencyContactAction";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    open: boolean;
    context: AddEmergencyContactActionContext;
    anchorRecord: ProofRuntimeRecord;
    onClose: () => void;
    onSuccess?: () => void;
};

/** @deprecated Prefer RelationshipActionGuidedModal / IdentityResolvedEmergencyContactModal for Focus Panel. */
export default function AddEmergencyContactGuidedModal({
    open,
    context,
    anchorRecord,
    onClose,
    onSuccess,
}: Props) {
    const actionContext = resolveRelationshipActionContext({
        anchorRecord,
        sourceSurface: "child_drawer",
    });
    if (!actionContext) return null;

    return (
        <RelationshipActionGuidedModal
            open={open}
            actionKey="add_emergency_contact"
            context={actionContext}
            anchorRecord={anchorRecord}
            onClose={() => {
                onClose();
            }}
        />
    );
}
