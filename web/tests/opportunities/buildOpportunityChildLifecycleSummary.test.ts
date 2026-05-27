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
        expect(s.display_summary).toBe("3 children · all enrolled");
        expect(s.headline_label).toBe("Children: all enrolled (3)");
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
        expect(s.display_summary).toBe("2 children · 1 enrolled, 1 waitlisted");
        expect(s.short_summary).toBe("Mixed: enrolled + waitlisted");
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
        expect(s.display_summary).toContain("3 children");
    });

    it("counts missing child status quietly", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [{ outcome_status_key: "waitlisted" }, { outcome_status_key: null }],
        });
        expect(s.is_mixed).toBe(true);
        expect(s.missing_status_count).toBe(1);
        expect(s.display_summary).toBe("2 children · 1 waitlisted, 1 status missing");
    });

    it("handles all missing statuses", () => {
        const s = buildOpportunityChildLifecycleSummary({
            opportunityId: "opp-1",
            members: [{ outcome_status_key: null }, { outcome_status_key: undefined }],
        });
        expect(s.missing_status_count).toBe(2);
        expect(s.display_summary).toBe("2 children · status missing");
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
        expect(s.display_summary).toBe("2 children · 1 offer pending, 1 enrolling");
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
