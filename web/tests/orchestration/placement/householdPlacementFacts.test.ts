import { describe, expect, it } from "vitest";
import {
    resolveHouseholdPlacementFactsForCandidate,
    resolveSiblingWaitlistedPresent,
    type HouseholdPlacementFactHouseholdSlice,
} from "@/lib/orchestration/placement/householdPlacementFacts";
import { CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD } from "@/lib/orchestration/placement/childcarePlacementFactContractV1";
import { buildPlacementCandidateFacts } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { evaluatePlacementCandidate } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import type { PlacementCandidateRow } from "@/lib/orchestration/placement/placementCandidateTypes";

const household: HouseholdPlacementFactHouseholdSlice = {
    customer_id: "cust_1",
    inquiry_children: [
        {
            opportunity_customer_member_id: "ocm_self",
            customer_member_id: "cm_self",
            outcome_status_key: "waitlisted",
            location_id: "site_a",
        },
        {
            opportunity_customer_member_id: "ocm_sib",
            customer_member_id: "cm_sib",
            outcome_status_key: "enrolled",
            location_id: "site_a",
        },
        {
            opportunity_customer_member_id: "ocm_sister",
            customer_member_id: "cm_sister",
            outcome_status_key: "enrolled",
            location_id: "site_b",
        },
    ],
    active_placement_candidates: [
        {
            placement_candidate_id: "pc_other",
            opportunity_customer_member_id: "ocm_other_wait",
            customer_member_id: "cm_other",
            site_id: "site_a",
            status: "active",
        },
    ],
    household_persons: [{ person_id: "person_parent", is_employee: true, employee_id: "E-42" }],
};

const candidateCtx = {
    placement_candidate_id: "pc_self",
    opportunity_customer_member_id: "ocm_self",
    customer_member_id: "cm_self",
    person_id: "person_self",
    site_id: "site_a",
};

const CANDIDATE: PlacementCandidateRow = {
    id: "pc_self",
    org_id: "org_1",
    opportunity_id: "opp_1",
    customer_id: "cust_1",
    opportunity_customer_member_id: "ocm_self",
    customer_member_id: "cm_self",
    person_id: "person_self",
    site_id: "site_a",
    is_synthetic_fallback: false,
    program_room_cohort_key: "toddler_room",
    program_room_group_label: "Toddler Room",
    wait_since: "2024-06-01T12:00:00.000Z",
    start_date: "2024-09-01",
    status: "active",
    seed_key: "pc_v1:opp_1:ocm_self:toddler_room",
    metadata: null,
};

describe("householdPlacementFacts", () => {
    it("resolves employee household from persons.is_employee", () => {
        const facts = resolveHouseholdPlacementFactsForCandidate(household, candidateCtx);
        expect(facts.flag_employee_household).toMatchObject({ presence: "present", value: true });
        expect(facts.flag_sibling_enrolled).toMatchObject({ presence: "present", value: true });
        expect(facts.flag_sister_center).toMatchObject({ presence: "present", value: true });
    });

    it("includes guardian customer_persons rows (not only primary_contact role)", () => {
        const guardianHousehold: HouseholdPlacementFactHouseholdSlice = {
            customer_id: "cust_1",
            inquiry_children: [household.inquiry_children[0]!],
            active_placement_candidates: [],
            household_persons: [{ person_id: "person_guardian", is_employee: true, employee_id: "E-99" }],
        };
        const facts = resolveHouseholdPlacementFactsForCandidate(guardianHousehold, candidateCtx);
        expect(facts.flag_employee_household).toMatchObject({
            presence: "present",
            value: true,
            source: "persons.is_employee:person_guardian",
        });
    });

    it("resolves same-site vs sister-site from candidate site", () => {
        const factsAtB = resolveHouseholdPlacementFactsForCandidate(household, {
            ...candidateCtx,
            site_id: "site_b",
        });
        expect(factsAtB.flag_sibling_enrolled).toMatchObject({ presence: "present", value: true });
        expect(factsAtB.flag_sister_center).toMatchObject({ presence: "present", value: true });

        const noEnrolledHousehold: HouseholdPlacementFactHouseholdSlice = {
            customer_id: "cust_1",
            inquiry_children: [household.inquiry_children[0]!],
            active_placement_candidates: [],
            household_persons: [],
        };
        const factsAtC = resolveHouseholdPlacementFactsForCandidate(noEnrolledHousehold, {
            ...candidateCtx,
            site_id: "site_c",
        });
        expect(factsAtC.flag_sibling_enrolled).toMatchObject({ presence: "absent" });
        expect(factsAtC.flag_sister_center).toMatchObject({ presence: "absent" });
    });

    it("absent sibling facts when candidate site is missing", () => {
        const facts = resolveHouseholdPlacementFactsForCandidate(household, {
            ...candidateCtx,
            site_id: null,
        });
        expect(facts.flag_sibling_enrolled.presence).toBe("absent");
        expect(facts.flag_sister_center.presence).toBe("absent");
    });

    it("detects sibling waitlisted on household", () => {
        expect(resolveSiblingWaitlistedPresent(household, candidateCtx)).toBe(true);
    });

    it("metadata employee flag does not tier-match when household context is record-sourced", () => {
        const r = evaluatePlacementCandidate({
            candidate: CANDIDATE,
            opportunity: { id: "opp_1", metadata: { flag_employee_household: true } },
            cohort: { work_unit_id: "wu_1", queue_key: "waitlisted" },
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            now_ms: 1_715_176_800_000,
            household: {
                customer_id: "cust_1",
                inquiry_children: [household.inquiry_children[0]!],
                active_placement_candidates: [],
                household_persons: [{ person_id: "p1", is_employee: false, employee_id: null }],
            },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.snapshot.bucket_key).toBe("tier_general_waitlist");
    });

    it("employee on person yields staff tier when household context loaded", () => {
        const r = evaluatePlacementCandidate({
            candidate: CANDIDATE,
            opportunity: { id: "opp_1", metadata: {} },
            cohort: { work_unit_id: "wu_1", queue_key: "waitlisted" },
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            now_ms: 1_715_176_800_000,
            household,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.snapshot.bucket_key).toBe("tier_employee_family");
    });

    it("buildPlacementCandidateFacts ignores metadata flags when household slice provided", () => {
        const facts = buildPlacementCandidateFacts({
            candidate: CANDIDATE,
            opportunity: { id: "opp_1", metadata: { flag_employee_household: true } },
            household: {
                ...household,
                household_persons: [],
            },
        });
        expect(facts[CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD]).toMatchObject({
            presence: "absent",
        });
    });
});
