/**
 * Persist Change lead location — family default + optional inherit children.
 */

import {
    listInheritingInquiryChildren,
    resolveInquiryChildOcmId,
    type InquiryChildLocationRow,
} from "@/lib/admin/actions/changeLeadLocationContract";
import {
    patchChildParticipation,
    patchOpportunityCustomerMemberFromInquiryChild,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
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

function trimId(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

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

/**
 * Write an owned site onto a child that currently inherits the lead default.
 * Prefer customer_member participation (handles unlinked / pre-OCM children);
 * fall back to direct OCM PATCH only when we have a real opportunity_customer_members id.
 */
async function patchInheritingChildLocation(args: {
    opportunityId: string;
    locationId: string;
    row: InquiryChildLocationRow;
    fetchFn?: typeof fetch;
}): Promise<boolean> {
    const customerMemberId = trimId(args.row.customer_member_id);
    if (customerMemberId) {
        await patchChildParticipation({
            customerMemberId,
            opportunityId: args.opportunityId,
            patch: { location_id: args.locationId },
            fetchFn: args.fetchFn,
        });
        return true;
    }
    const ocmId = resolveInquiryChildOcmId(args.row);
    if (!ocmId) return false;
    await patchOpportunityCustomerMemberFromInquiryChild(ocmId, {
        location_id: args.locationId,
    });
    return true;
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
            const wrote = await patchInheritingChildLocation({
                opportunityId,
                locationId,
                row,
                fetchFn: input.fetchFn,
            });
            if (wrote) updatedChildCount += 1;
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
