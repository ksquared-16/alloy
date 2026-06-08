import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";

/** Notify open opportunity drawers and work-unit queues after household primary contact changes. */
export function dispatchHouseholdPrimaryContactChanged(args: {
    customerId: string;
    primaryPersonId: string;
    opportunityIds?: string[];
}): void {
    if (typeof window === "undefined") return;

    const opportunityIds = [...new Set((args.opportunityIds ?? []).map((id) => id.trim()).filter(Boolean))];

    window.dispatchEvent(
        new CustomEvent("admin-entity-saved", {
            detail: {
                type: "customers",
                id: args.customerId.trim(),
                primary_person_id: args.primaryPersonId.trim(),
                opportunity_ids: opportunityIds,
            },
        })
    );

    for (const opportunityId of opportunityIds) {
        dispatchOpportunityQueueUpdated(opportunityId, "household_primary_contact");
    }
}
