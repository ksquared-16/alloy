"use client";

import LayoutRuntimeRelationshipActionButton from "@/components/layout/LayoutRuntimeRelationshipActionButton";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    anchorRecord: ProofRuntimeRecord;
    rowRecord?: ProofRuntimeRecord;
    label?: string;
    canMutate?: boolean;
    className?: string;
    testId?: string;
};

/** @deprecated Use LayoutRuntimeRelationshipActionButton with actionKey add_emergency_contact. */
export default function LayoutRuntimeAddEmergencyContactActionButton(props: Props) {
    return (
        <LayoutRuntimeRelationshipActionButton
            actionKey="add_emergency_contact"
            {...props}
        />
    );
}
