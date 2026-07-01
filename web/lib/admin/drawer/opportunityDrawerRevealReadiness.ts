/**
 * Explicit drawer reveal readiness — do not collapse into a single "full ready" flag.
 * Card 2: primary gates mount; full is one enrich participant.
 */

export type OpportunityDrawerRevealReadinessFlags = {
    /** Coordinated overview reveal (`drawer_primary` merged). */
    primaryReady: boolean;
    /** First-paint contract satisfied on current row. */
    primaryContractReady: boolean;
    /** Above-fold layout lock released (scroll or idle reveal). */
    aboveFoldStable: boolean;
    /** `postDrawerVisibleKey` armed — safe to start post-reveal enrich queue. */
    secondaryWindowOpen: boolean;
    /** Background `surface=full` merged. */
    fullHydrateReady: boolean;
};

export function opportunityDrawerSecondaryWindowOpen(
    drawerType: string | null | undefined,
    drawerId: string | null | undefined,
    postDrawerVisibleKey: string | null
): boolean {
    if (!drawerType || !drawerId || drawerId === "new") return false;
    return postDrawerVisibleKey === `${drawerType}:${drawerId}`;
}

export function opportunityDrawerAboveFoldStable(aboveFoldLocked: boolean): boolean {
    return !aboveFoldLocked;
}

/** Primary reveal committed + first-paint contract — may arm `postDrawerVisible`. */
export function opportunityDrawerPostRevealMayOpen(params: {
    overviewRevealReady: boolean;
    primaryContractSatisfied: boolean;
}): boolean {
    return params.overviewRevealReady && params.primaryContractSatisfied;
}

/** Intersection-gated summary enrichments (tours, right column frame). */
export function opportunityDrawerBelowFoldEnrichmentReady(
    secondaryWindowOpen: boolean,
    aboveFoldStable: boolean
): boolean {
    return secondaryWindowOpen && aboveFoldStable;
}

/** Oper strip / packets / children graph — need full record; still below-fold gated. */
export function opportunityDrawerFullBoundEnrichmentReady(
    belowFoldEnrichmentReady: boolean,
    fullHydrateReady: boolean,
    enrichmentHeldUntilInteraction: boolean
): boolean {
    return belowFoldEnrichmentReady && fullHydrateReady && !enrichmentHeldUntilInteraction;
}

export function buildOpportunityDrawerRevealReadiness(params: {
    overviewRevealReady: boolean;
    primaryContractSatisfied: boolean;
    aboveFoldLocked: boolean;
    drawerType: string | null | undefined;
    drawerId: string | null | undefined;
    postDrawerVisibleKey: string | null;
    fullHydrateReady: boolean;
}): OpportunityDrawerRevealReadinessFlags {
    const aboveFoldStable = opportunityDrawerAboveFoldStable(params.aboveFoldLocked);
    const secondaryWindowOpen = opportunityDrawerSecondaryWindowOpen(
        params.drawerType,
        params.drawerId,
        params.postDrawerVisibleKey
    );
    return {
        primaryReady: params.overviewRevealReady,
        primaryContractReady: params.primaryContractSatisfied,
        aboveFoldStable,
        secondaryWindowOpen,
        fullHydrateReady: params.fullHydrateReady,
    };
}
