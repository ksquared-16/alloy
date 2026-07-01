/**
 * Resolve placement candidate site from child OCM scope with opportunity fallback.
 */

export type PlacementSiteResolutionSource = "ocm" | "opportunity" | "none";

export type PlacementSiteResolution = {
    site_id: string | null;
    source: PlacementSiteResolutionSource;
    /** True when child OCM had no site and opportunity location was used. */
    used_opportunity_fallback: boolean;
};

export function resolvePlacementCandidateSiteId(params: {
    ocmLocationId?: string | null;
    opportunityLocationId?: string | null;
}): PlacementSiteResolution {
    const ocm = (params.ocmLocationId ?? "").trim();
    if (ocm) {
        return { site_id: ocm, source: "ocm", used_opportunity_fallback: false };
    }
    const opp = (params.opportunityLocationId ?? "").trim();
    if (opp) {
        return { site_id: opp, source: "opportunity", used_opportunity_fallback: true };
    }
    return { site_id: null, source: "none", used_opportunity_fallback: false };
}
