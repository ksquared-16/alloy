import { describe, expect, it } from "vitest";
import { __testing } from "@/lib/orchestration/placement/repair/placementCandidateOcmRepair";

const { planPlacementCandidateOcmRepair } = __testing;

describe("placementCandidateOcmRepair", () => {
    it("repairs site and cohort from OCM when candidate differs", () => {
        const plan = planPlacementCandidateOcmRepair({
            candidate: {
                id: "pc_1",
                opportunity_customer_member_id: "ocm_1",
                site_id: "site_opp",
                program_room_cohort_key: "old_cohort",
                is_synthetic_fallback: false,
            },
            ocm: {
                id: "ocm_1",
                location_id: "site_child",
                program_room_cohort_key: "infant",
            },
        });
        expect(plan).not.toBe("skipped_synthetic");
        expect(plan).not.toBe("missing_ocm");
        if (typeof plan === "string") return;
        expect(plan.repairSite).toBe(true);
        expect(plan.repairCohort).toBe(true);
        expect(plan.nextSiteId).toBe("site_child");
        expect(plan.nextCohortKey).toBe("infant");
    });

    it("does not overwrite when OCM site/cohort missing", () => {
        const plan = planPlacementCandidateOcmRepair({
            candidate: {
                id: "pc_1",
                opportunity_customer_member_id: "ocm_1",
                site_id: "site_opp",
                program_room_cohort_key: "toddler",
                is_synthetic_fallback: false,
            },
            ocm: { id: "ocm_1", location_id: null, program_room_cohort_key: null },
        });
        if (typeof plan === "string") {
            expect.fail(`unexpected ${plan}`);
            return;
        }
        expect(plan.repairSite).toBe(false);
        expect(plan.repairCohort).toBe(false);
        expect(plan.missingOcmSite).toBe(true);
        expect(plan.missingOcmCohort).toBe(true);
    });

    it("skips synthetic fallback candidates", () => {
        expect(
            planPlacementCandidateOcmRepair({
                candidate: {
                    id: "pc_syn",
                    opportunity_customer_member_id: null,
                    site_id: "site_a",
                    program_room_cohort_key: "x",
                    is_synthetic_fallback: true,
                },
                ocm: null,
            })
        ).toBe("skipped_synthetic");
    });
});
