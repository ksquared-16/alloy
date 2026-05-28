/**
 * Load/eval diagnostics for placement candidate site, cohort, and household facts (Card 3).
 * Dev/test only — not shown in production UI unless explicitly enabled.
 */

import { shouldUseRecordSourcedHouseholdPlacementFacts } from "@/lib/orchestration/placement/householdPlacementFacts";

export type PlacementSiteLoadSource = "ocm" | "opportunity_fallback" | "candidate_existing" | "unknown";
export type PlacementCohortLoadSource = "ocm" | "candidate_existing" | "derived_from_dob" | "unknown";
export type HouseholdFactLoadSource = "record_join" | "metadata_fallback" | "unknown";

export type PlacementCandidateLoadDiagnostics = {
    site_source: PlacementSiteLoadSource;
    cohort_source: PlacementCohortLoadSource;
    household_fact_source: HouseholdFactLoadSource;
};

function safeMeta(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}

/** True in test, or when `ALLOY_PLACEMENT_LOAD_DIAGNOSTICS=1`. */
export function placementLoadDiagnosticsEnabled(): boolean {
    return (
        process.env.ALLOY_PLACEMENT_LOAD_DIAGNOSTICS === "1" ||
        process.env.NODE_ENV === "test"
    );
}

export function resolvePlacementSiteLoadSource(params: {
    candidateSiteId?: string | null;
    ocmLocationId?: string | null;
    opportunityLocationId?: string | null;
    candidateMetadata?: Record<string, unknown> | null;
}): PlacementSiteLoadSource {
    const candSite = (params.candidateSiteId ?? "").trim();
    const ocmSite = (params.ocmLocationId ?? "").trim();
    const oppSite = (params.opportunityLocationId ?? "").trim();
    const md = safeMeta(params.candidateMetadata);
    const siteResolution = md.site_resolution;
    const usedOppFallback =
        md.site_resolution_warning === "opportunity_location_fallback" ||
        (siteResolution != null &&
            typeof siteResolution === "object" &&
            !Array.isArray(siteResolution) &&
            (siteResolution as { used_opportunity_fallback?: boolean }).used_opportunity_fallback === true);

    if (ocmSite && candSite === ocmSite) return "ocm";
    if (usedOppFallback || (oppSite && candSite === oppSite && candSite !== ocmSite)) {
        return "opportunity_fallback";
    }
    if (candSite) return "candidate_existing";
    return "unknown";
}

export function resolvePlacementCohortLoadSource(params: {
    storedCohortKey?: string | null;
    ocmCohortKey?: string | null;
    /** When cohort was repaired from member/DOB heuristics at load time. */
    cohortRepairedFromMember?: boolean;
    cohortDerivedFromDob?: boolean;
}): PlacementCohortLoadSource {
    const ocmKey = (params.ocmCohortKey ?? "").trim();
    const stored = (params.storedCohortKey ?? "").trim();
    if (ocmKey && stored === ocmKey) return "ocm";
    if (params.cohortDerivedFromDob) return "derived_from_dob";
    if (stored) return "candidate_existing";
    if (params.cohortRepairedFromMember) return "derived_from_dob";
    return "unknown";
}

export function resolveHouseholdFactLoadSource(params: {
    householdContextLoaded?: boolean;
}): HouseholdFactLoadSource {
    if (params.householdContextLoaded && shouldUseRecordSourcedHouseholdPlacementFacts()) {
        return "record_join";
    }
    if (!shouldUseRecordSourcedHouseholdPlacementFacts()) {
        return "metadata_fallback";
    }
    return "unknown";
}

export function resolvePlacementCandidateLoadDiagnostics(params: {
    candidateSiteId?: string | null;
    storedCohortKey?: string | null;
    ocmLocationId?: string | null;
    ocmCohortKey?: string | null;
    opportunityLocationId?: string | null;
    candidateMetadata?: Record<string, unknown> | null;
    cohortRepairedFromMember?: boolean;
    cohortDerivedFromDob?: boolean;
    householdContextLoaded?: boolean;
}): PlacementCandidateLoadDiagnostics {
    return {
        site_source: resolvePlacementSiteLoadSource({
            candidateSiteId: params.candidateSiteId,
            ocmLocationId: params.ocmLocationId,
            opportunityLocationId: params.opportunityLocationId,
            candidateMetadata: params.candidateMetadata,
        }),
        cohort_source: resolvePlacementCohortLoadSource({
            storedCohortKey: params.storedCohortKey,
            ocmCohortKey: params.ocmCohortKey,
            cohortRepairedFromMember: params.cohortRepairedFromMember,
            cohortDerivedFromDob: params.cohortDerivedFromDob,
        }),
        household_fact_source: resolveHouseholdFactLoadSource({
            householdContextLoaded: params.householdContextLoaded,
        }),
    };
}

/** Household tier reasons should not display when facts are metadata-only. */
export function shouldShowPlacementPriorityReasonShort(params: {
    householdFactSource?: HouseholdFactLoadSource;
    evaluatorUsesCandidateFacts?: boolean;
}): boolean {
    if (params.evaluatorUsesCandidateFacts && params.householdFactSource === "metadata_fallback") {
        return false;
    }
    if (params.evaluatorUsesCandidateFacts && params.householdFactSource === "unknown") {
        return false;
    }
    return true;
}
