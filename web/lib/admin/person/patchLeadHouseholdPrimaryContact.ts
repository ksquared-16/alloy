import { dispatchOpportunityDrawerRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { applyLeadPrimaryContactToOpportunityRecord } from "@/lib/admin/person/applyLeadPrimaryContactToOpportunityRecord";
import { buildQueueRowDisplayPatchFromLeadPrimaryContact } from "@/lib/admin/person/buildQueueRowDisplayPatchFromLeadPrimaryContact";
import { patchHouseholdPrimaryContact } from "@/lib/admin/person/patchHouseholdPrimaryContact";
import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";

/** Lead drawer: persist household primary contact and refresh open opportunity VM + queue mirrors. */
export async function patchLeadHouseholdPrimaryContact(args: {
    customerId: string;
    personId: string;
    opportunityId: string;
    opportunityRecord: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
    const customerId = args.customerId.trim();
    const personId = args.personId.trim();
    const opportunityId = args.opportunityId.trim();
    if (!customerId || !personId || !opportunityId) {
        throw new Error("Customer, person, and opportunity id required");
    }

    await patchHouseholdPrimaryContact(customerId, personId);

    const next = applyLeadPrimaryContactToOpportunityRecord(args.opportunityRecord, customerId, personId);
    dispatchOpportunityDrawerRecordPatch(opportunityId, next);
    dispatchDrawerLayoutRuntimeBodyRecordPatch({
        entityType: "opportunities",
        entityId: opportunityId,
        record: next,
    });

    const queueRowPatch = buildQueueRowDisplayPatchFromLeadPrimaryContact(next);
    dispatchOpportunityQueueUpdated(opportunityId, "household_primary_contact", queueRowPatch);

    return next;
}
