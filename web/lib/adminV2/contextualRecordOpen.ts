/** Open an opportunity record drawer from contextual surfaces (e.g. Quick message empty state). */

export const ADMINV2_OPEN_OPPORTUNITY_FROM_CONTEXT_EVENT = "adminv2:open-opportunity-from-context";

export type OpenOpportunityFromContextDetail = {
    opportunity_id: string;
};

export function launchAdminV2OpenOpportunityFromContext(opportunityId: string): void {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent<OpenOpportunityFromContextDetail>(ADMINV2_OPEN_OPPORTUNITY_FROM_CONTEXT_EVENT, {
            detail: { opportunity_id: id },
        })
    );
}
