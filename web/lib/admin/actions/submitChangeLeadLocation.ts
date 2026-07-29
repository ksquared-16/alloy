/**
 * Persist Change lead location — family default + optional inherit children.
 */

import {
    listInheritingInquiryChildren,
    resolveInquiryChildOcmId,
    type InquiryChildLocationRow,
} from "@/lib/admin/actions/changeLeadLocationContract";
import { patchOpportunityCustomerMemberFromInquiryChild } from "@/lib/admin/drawer/inquiryChildFieldEdit";
import {
    patchOpportunityNativeFromLayoutDrawer,
    syncOpportunityLocationDisplayLabel,
} from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type ChangeLeadLocationSubmitInput = {
    opportunityId: string;
    locationId: string;
    locationLabel: string;
    /** When true, set OCM.location_id for children that currently inherit (no owned site). */
    applyToInheritingChildren: boolean;
    inquiryChildren: readonly InquiryChildLocationRow[];
    record?: Record<string, unknown> | null;
};

export type ChangeLeadLocationSubmitResult = {
    ok: true;
    updatedChildCount: number;
    nextRecord: ProofRuntimeRecord | null;
};

export async function submitChangeLeadLocation(
    input: ChangeLeadLocationSubmitInput,
): Promise<ChangeLeadLocationSubmitResult> {
    const opportunityId = input.opportunityId.trim();
    const locationId = input.locationId.trim();
    if (!opportunityId) throw new Error("Lead id is required.");
    if (!locationId) throw new Error("Select a location.");

    const leadPatch = await patchOpportunityNativeFromLayoutDrawer({
        opportunityId,
        body: { location_id: locationId },
    });
    if (!leadPatch.ok) throw new Error(leadPatch.error);

    let updatedChildCount = 0;
    if (input.applyToInheritingChildren) {
        const inheriting = listInheritingInquiryChildren(input.inquiryChildren);
        for (const row of inheriting) {
            const ocmId = resolveInquiryChildOcmId(row);
            if (!ocmId) continue;
            await patchOpportunityCustomerMemberFromInquiryChild(ocmId, {
                location_id: locationId,
            });
            updatedChildCount += 1;
        }
    }

    const nextRecord = input.record
        ? syncOpportunityLocationDisplayLabel(
              { ...(input.record as ProofRuntimeRecord) },
              locationId,
              input.locationLabel.trim(),
          )
        : null;

    return { ok: true, updatedChildCount, nextRecord };
}
