/**
 * Household-sourced placement priority facts (Card 1).
 * Pure resolution — no Supabase calls.
 */

import type { FactBag, FactValue } from "@/lib/orchestration/placement/placementPriorityTypes";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import {
    CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD,
    CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED,
    CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER,
} from "@/lib/orchestration/placement/childcarePlacementFactContractV1";

/** OCM keys treated as enrolled for sibling priority (same-site / sister-site). */
export const ENROLLED_SIBLING_OUTCOME_STATUS_KEYS = new Set(["enrolled"]);

export type HouseholdInquiryChildRecord = {
    opportunity_customer_member_id: string;
    customer_member_id: string;
    person_id?: string | null;
    outcome_status_key?: string | null;
    location_id?: string | null;
    /** Presentation — loaded for queue sibling context lines only. */
    child_display_name?: string | null;
    program_room_cohort_key?: string | null;
    /** Canonical program key (location_program_categories.key) derived from program_category_id. */
    program_key?: string | null;
    program_category_id?: string | null;
};

export type HouseholdActivePlacementCandidateRecord = {
    placement_candidate_id: string;
    opportunity_customer_member_id?: string | null;
    customer_member_id?: string | null;
    site_id?: string | null;
    status?: string | null;
};

export type HouseholdPersonRecord = {
    person_id: string;
    is_employee?: boolean | null;
    employee_id?: string | null;
};

export type HouseholdPlacementFactHouseholdSlice = {
    customer_id: string;
    inquiry_children: HouseholdInquiryChildRecord[];
    active_placement_candidates: HouseholdActivePlacementCandidateRecord[];
    household_persons: HouseholdPersonRecord[];
};

export type HouseholdPlacementFactCandidateContext = {
    placement_candidate_id: string;
    opportunity_customer_member_id?: string | null;
    customer_member_id?: string | null;
    person_id?: string | null;
    site_id?: string | null;
};

function factBoolean(value: boolean, source: string): FactValue {
    return { presence: "present", value, source };
}

function factAbsent(source: string): FactValue {
    return { presence: "absent", source };
}

function isSelfChild(
    row: { opportunity_customer_member_id?: string | null; customer_member_id?: string | null },
    candidate: HouseholdPlacementFactCandidateContext
): boolean {
    const ocm = (candidate.opportunity_customer_member_id ?? "").trim();
    const cm = (candidate.customer_member_id ?? "").trim();
    const rowOcm = (row.opportunity_customer_member_id ?? "").trim();
    const rowCm = (row.customer_member_id ?? "").trim();
    if (ocm && rowOcm && ocm === rowOcm) return true;
    if (cm && rowCm && cm === rowCm) return true;
    return false;
}

function resolveEmployeeHousehold(household: HouseholdPlacementFactHouseholdSlice): FactValue {
    for (const p of household.household_persons) {
        if (p.is_employee === true) {
            const eid = (p.employee_id ?? "").trim();
            return factBoolean(
                true,
                eid ? `persons.is_employee:${p.person_id}` : `persons.is_employee:${p.person_id}`
            );
        }
    }
    return factAbsent("household.no_employee_person");
}

function enrolledSiblings(
    household: HouseholdPlacementFactHouseholdSlice,
    candidate: HouseholdPlacementFactCandidateContext
): HouseholdInquiryChildRecord[] {
    return household.inquiry_children.filter((row) => {
        if (isSelfChild(row, candidate)) return false;
        const key = (row.outcome_status_key ?? "").trim();
        return ENROLLED_SIBLING_OUTCOME_STATUS_KEYS.has(key);
    });
}

export type HouseholdEnrolledSiblingDisplayRef = {
    child_display_name: string | null;
    cohort_label: string | null;
    location_id: string | null;
    location_label: string | null;
    same_site_as_candidate: boolean;
};

/** Presentation-only enrolled sibling refs for queue row context (no ranking effect). */
export function resolveEnrolledSiblingDisplayRefs(
    household: HouseholdPlacementFactHouseholdSlice,
    candidate: HouseholdPlacementFactCandidateContext,
    locationLabelsById?: ReadonlyMap<string, string> | null
): HouseholdEnrolledSiblingDisplayRef[] {
    const site = (candidate.site_id ?? "").trim();
    return enrolledSiblings(household, candidate).map((row) => {
        const rowSite = (row.location_id ?? "").trim();
        const locationLabel =
            rowSite && locationLabelsById?.get(rowSite) ?
                locationLabelsById.get(rowSite)!.trim() || null
            :   null;
        const { cohortLabel } = normalizePlacementWaitlistCohort(
            row.program_room_cohort_key,
            row.program_room_cohort_key
        );
        return {
            child_display_name: row.child_display_name ?? null,
            cohort_label: cohortLabel || row.program_room_cohort_key || null,
            location_id: rowSite || null,
            location_label: locationLabel,
            same_site_as_candidate: Boolean(site && rowSite && site === rowSite),
        };
    });
}

function resolveSiblingEnrolledSameSite(
    household: HouseholdPlacementFactHouseholdSlice,
    candidate: HouseholdPlacementFactCandidateContext
): FactValue {
    const site = (candidate.site_id ?? "").trim();
    if (!site) return factAbsent("candidate.site_missing");

    const match = enrolledSiblings(household, candidate).some(
        (s) => (s.location_id ?? "").trim() === site
    );
    if (match) {
        return factBoolean(true, "opportunity_customer_members.sibling_enrolled_same_site");
    }
    return factAbsent("household.no_enrolled_sibling_same_site");
}

function resolveSisterCenterEnrolledSibling(
    household: HouseholdPlacementFactHouseholdSlice,
    candidate: HouseholdPlacementFactCandidateContext
): FactValue {
    const site = (candidate.site_id ?? "").trim();
    if (!site) return factAbsent("candidate.site_missing");

    const match = enrolledSiblings(household, candidate).some((s) => {
        const sSite = (s.location_id ?? "").trim();
        return sSite.length > 0 && sSite !== site;
    });
    if (match) {
        return factBoolean(true, "opportunity_customer_members.sibling_enrolled_sister_site");
    }
    return factAbsent("household.no_enrolled_sibling_sister_site");
}

/** Informational — no preset tier in v1; exposed for diagnostics / future rules. */
export function resolveSiblingWaitlistedPresent(
    household: HouseholdPlacementFactHouseholdSlice,
    candidate: HouseholdPlacementFactCandidateContext
): boolean {
    const ocmWaitlisted = household.inquiry_children.some((row) => {
        if (isSelfChild(row, candidate)) return false;
        return (row.outcome_status_key ?? "").trim() === "waitlisted";
    });
    if (ocmWaitlisted) return true;

    return household.active_placement_candidates.some((pc) => {
        if (isSelfChild(pc, candidate)) return false;
        const st = (pc.status ?? "").trim();
        return st === "active" || st === "paused";
    });
}

/**
 * Resolve household predicate facts from real records only.
 */
export function resolveHouseholdPlacementFactsForCandidate(
    household: HouseholdPlacementFactHouseholdSlice,
    candidate: HouseholdPlacementFactCandidateContext
): Pick<
    FactBag,
    | typeof CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD
    | typeof CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED
    | typeof CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER
> {
    return {
        [CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD]: resolveEmployeeHousehold(household),
        [CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED]: resolveSiblingEnrolledSameSite(household, candidate),
        [CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER]: resolveSisterCenterEnrolledSibling(household, candidate),
    };
}

const HOUSEHOLD_PREDICATE_FACT_KEYS = [
    CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD,
    CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED,
    CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER,
] as const;

export function extractHouseholdFactSources(facts: FactBag): Record<string, { presence: string; source?: string }> {
    const out: Record<string, { presence: string; source?: string }> = {};
    for (const key of HOUSEHOLD_PREDICATE_FACT_KEYS) {
        const fv = facts[key];
        if (!fv) continue;
        out[key] = { presence: fv.presence, ...(fv.source ? { source: fv.source } : {}) };
    }
    return out;
}

/** When true, V2 evaluation uses record-sourced household flags instead of opportunity metadata. */
export function shouldUseRecordSourcedHouseholdPlacementFacts(): boolean {
    return process.env.ALLOY_PLACEMENT_HOUSEHOLD_FACTS_METADATA_FALLBACK !== "1";
}
