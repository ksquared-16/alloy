import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";

export type PersonRecordUpdatedDetail = {
    type: "persons";
    id: string;
    patch: Record<string, unknown>;
    person?: Record<string, unknown> | null;
    source?: string;
    opportunity_id?: string | null;
};

/** Notify open person/opportunity drawers and cache consumers after a person identity PATCH. */
export function dispatchPersonRecordUpdated(args: {
    personId: string;
    patch: Record<string, unknown>;
    person?: Record<string, unknown> | null;
    source?: string;
    opportunityId?: string | null;
}): void {
    if (typeof window === "undefined") return;

    const personId = args.personId.trim();
    if (!personId) return;

    const opportunityId = args.opportunityId?.trim() || null;
    const detail: PersonRecordUpdatedDetail = {
        type: "persons",
        id: personId,
        patch: args.patch,
        person: args.person ?? null,
        source: args.source,
        opportunity_id: opportunityId,
    };

    window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail }));

    if (opportunityId) {
        dispatchOpportunityQueueUpdated(opportunityId, args.source ?? "person_record_updated");
    }
}
