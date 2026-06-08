import { describe, expect, it } from "vitest";
import {
    isChildWaitlistEligibleForPlacementCandidate,
    isPlacementChildWaitlistEligibilityStrict,
    resolvePlacementChildWaitlistEligibilityMode,
} from "@/lib/orchestration/placement/childWaitlistPlacementEligibility";

describe("childWaitlistPlacementEligibility", () => {
    it("waitlisted child status is eligible", () => {
        expect(
            isChildWaitlistEligibleForPlacementCandidate({
                outcomeStatusKey: "waitlisted",
                opportunityStatusKey: "waitlisted",
            })
        ).toEqual({ eligible: true, reason: "waitlisted" });
    });

    it("enrolled child status is not eligible", () => {
        expect(
            isChildWaitlistEligibleForPlacementCandidate({
                outcomeStatusKey: "enrolled",
                opportunityStatusKey: "waitlisted",
            })
        ).toEqual({ eligible: false, reason: "ineligible_status" });
    });

    it.each(["offer_pending", "enrolling", "not_enrolling", "withdrawn"] as const)(
        "child %s is not eligible",
        (status) => {
            expect(
                isChildWaitlistEligibleForPlacementCandidate({
                    outcomeStatusKey: status,
                    opportunityStatusKey: "waitlisted",
                })
            ).toEqual({ eligible: false, reason: "ineligible_status" });
        }
    );

    it("missing child status + compat enabled allows opportunity waitlist fallback", () => {
        expect(
            isChildWaitlistEligibleForPlacementCandidate({
                outcomeStatusKey: null,
                opportunityStatusKey: "waitlisted",
                compatMode: true,
            })
        ).toEqual({
            eligible: true,
            reason: "compat_opportunity_status",
            compat_opportunity_fallback: true,
        });
    });

    it("missing child status + strict enabled is not eligible", () => {
        expect(
            isChildWaitlistEligibleForPlacementCandidate({
                outcomeStatusKey: null,
                opportunityStatusKey: "waitlisted",
                compatMode: false,
            })
        ).toEqual({ eligible: false, reason: "opportunity_only_strict" });
    });

    it("opportunity waitlisted alone does not pass strict eligibility", () => {
        expect(
            isChildWaitlistEligibleForPlacementCandidate({
                outcomeStatusKey: undefined,
                opportunityStatusKey: "ready_to_enroll",
                compatMode: false,
            })
        ).toEqual({ eligible: false, reason: "opportunity_only_strict" });
    });

    it("resolve mode defaults to compat unless env strict is set", () => {
        const prev = process.env.ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT;
        try {
            delete process.env.ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT;
            expect(resolvePlacementChildWaitlistEligibilityMode()).toBe("compat");
            expect(isPlacementChildWaitlistEligibilityStrict()).toBe(false);

            process.env.ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT = "1";
            expect(resolvePlacementChildWaitlistEligibilityMode()).toBe("strict");
            expect(isPlacementChildWaitlistEligibilityStrict()).toBe(true);
        } finally {
            if (prev === undefined) delete process.env.ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT;
            else process.env.ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT = prev;
        }
    });
});
