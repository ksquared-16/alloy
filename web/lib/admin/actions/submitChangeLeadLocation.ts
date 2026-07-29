/**
 * Persist Change lead location — family default + optional inherit children.
 */

import {
    listInheritingInquiryChildren,
    resolveInquiryChildOcmId,
    type InquiryChildLocationRow,
} from "@/lib/admin/actions/changeLeadLocationContract";
import { patchOpportunityCustomerMemberFromInquiryChild } from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { syncOpportunityLocationDisplayLabel } from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type ChangeLeadLocationSubmitInput = {
    opportunityId: string;
    locationId: string;
    locationLabel: string;
    /** When true, set OCM.location_id for children that currently inherit (no owned site). */
    applyToInheritingChildren: boolean;
    inquiryChildren: readonly InquiryChildLocationRow[];
    record?: Record<string, unknown> | null;
    fetchFn?: typeof fetch;
};

export type ChangeLeadLocationSubmitResult = {
    ok: true;
    updatedChildCount: number;
    nextRecord: ProofRuntimeRecord | null;
};

export async function patchOpportunityLeadLocation(params: {
    opportunityId: string;
    locationId: string;
    fetchFn?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const fetchImpl = params.fetchFn ?? fetch;
    const res = await fetchImpl(
        `/api/admin/opportunities/${encodeURIComponent(params.opportunityId)}/lead-location`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ location_id: params.locationId }),
        },
    );
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
        return { ok: false, error: json.error ?? "Lead location save failed" };
    }
    return { ok: true };
}

export async function submitChangeLeadLocation(
    input: ChangeLeadLocationSubmitInput,
): Promise<ChangeLeadLocationSubmitResult> {
    const opportunityId = input.opportunityId.trim();
    const locationId = input.locationId.trim();
    if (!opportunityId) throw new Error("Lead id is required.");
    if (!locationId) throw new Error("Select a location.");

    const leadPatch = await patchOpportunityLeadLocation({
        opportunityId,
        locationId,
        fetchFn: input.fetchFn,
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
