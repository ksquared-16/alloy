import { describe, expect, it } from "vitest";
import {
    buildOpportunityChildLifecycleSummary,
    childLifecycleMembersFromInquiryChildren,
    OPPORTUNITY_CHILD_LIFECYCLE_CASE_NOTE,
} from "@/lib/opportunities/buildOpportunityChildLifecycleSummary";

describe("buildOpportunityChildLifecycleSummary", () => {
    it("returns empty summary when no children", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [],
        });
        expect(s.has_children).toBe(false);
        expect(s.display_summary).toBeNull();
        expect(s.headline_label).toBeNull();
        expect(s.is_mixed).toBe(false);
    });

    it("summarizes all children with same status", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [
                { outcome_status_key: "enrolled" },
                { outcome_status_key: "enrolled" },
                { outcome_status_key: "enrolled" },
            ],
        });
        expect(s.is_mixed).toBe(false);
        expect(s.primary_status_key).toBe("enrolled");
        expect(s.headline_label).toBe("3 children");
        expect(s.display_summary).toBe("Family status: Enrolled");
        expect(s.short_summary).toBe("Enrolled");
    });

    it("summarizes mixed sibling statuses", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [
                { outcome_status_key: "enrolled", outcome_status_label: "Enrolled" },
                { outcome_status_key: "waitlisted", outcome_status_label: "Waitlisted" },
            ],
        });
        expect(s.is_mixed).toBe(true);
        expect(s.primary_status_key).toBeNull();
        expect(s.headline_label).toBe("2 children");
        expect(s.display_summary).toBe("Family status: Enrolled + Waitlisted");
        expect(s.short_summary).toBe("Enrolled + Waitlisted");
        expect(s.counts_by_status_key).toEqual({ enrolled: 1, waitlisted: 1 });
    });

    it("handles three-way mixed states", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [
                { outcome_status_key: "enrolled" },
                { outcome_status_key: "waitlisted" },
                { outcome_status_key: "interested" },
            ],
        });
        expect(s.is_mixed).toBe(true);
        expect(s.total_children).toBe(3);
        expect(s.headline_label).toBe("3 children");
        expect(s.display_summary).toContain("Family status:");
    });

    it("counts missing child status with calm enrollment copy", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [{ outcome_status_key: "waitlisted" }, { outcome_status_key: null }],
        });
        expect(s.is_mixed).toBe(true);
        expect(s.missing_status_count).toBe(1);
        expect(s.headline_label).toBe("2 children");
        expect(s.display_summary).toBe(
            "Family status: 1 waitlisted, 1 enrollment status not set"
        );
        expect(s.all_enrollment_status_unset).toBe(false);
    });

    it("handles all missing statuses without implying child is missing", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [{ outcome_status_key: null }, { outcome_status_key: undefined }],
        });
        expect(s.missing_status_count).toBe(2);
        expect(s.headline_label).toBe("2 children");
        expect(s.display_summary).toBe("Family status: Not set");
        expect(s.short_summary).toBe("Not set");
        expect(s.all_enrollment_status_unset).toBe(true);
    });

    it("handles single child with unset enrollment status", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [{ outcome_status_key: null, display_name: "Mia" }],
        });
        expect(s.headline_label).toBe("1 child");
        expect(s.display_summary).toBe("Family status: Not set");
        expect(s.all_enrollment_status_unset).toBe(true);
    });

    it("maps new_inquiry to operator-facing New lead label", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [{ outcome_status_key: "new_inquiry" }],
        });
        expect(s.headline_label).toBe("1 child");
        expect(s.display_summary).toBe("Family status: New lead");
    });

    it("does not include opportunity mutation fields", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [{ outcome_status_key: "waitlisted" }],
        });
        expect(s).not.toHaveProperty("status_key");
        expect(s.case_status_secondary_note).toBe(OPPORTUNITY_CHILD_LIFECYCLE_CASE_NOTE);
    });

    it("produces stable labels for UI", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [
                { outcome_status_key: "offer_pending" },
                { outcome_status_key: "enrolling" },
            ],
        });
        expect(s.headline_label).toBe("2 children");
        expect(s.display_summary).toBe("Family status: Offer pending + Enrolling");
    });
});

describe("childLifecycleMembersFromInquiryChildren", () => {
    it("maps inquiry child row shapes", () => {
        expect(
            childLifecycleMembersFromInquiryChildren([
                {
                    display_name: "Mia",
                    outcome_status_key: "waitlisted",
                    outcome_status_label: "Waitlisted",
                },
            ])
        ).toEqual([
            {
                outcome_status_key: "waitlisted",
                outcome_status_label: "Waitlisted",
                display_name: "Mia",
            },
        ]);
    });
});
