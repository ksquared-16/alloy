import { describe, expect, it } from "vitest";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";

describe("opportunity activity timeline — stage moves", () => {
    it("names the child for child-grain lifecycle moves when child_display_name is present", () => {
        const formatted = formatOpportunityActivityTimelineEvent({
            event_type: "child_lifecycle_status_changed",
            payload: {
                previous_status_key: "lead",
                next_status_key: "waitlist",
                source: "stage_operating_plan_v1",
                child_display_name: "Wrigley Kurzman",
                row_grain: "child",
            },
        });
        expect(formatted.title).toBe("Wrigley Kurzman moved to Waitlist");
        expect(formatted.detail).toBe("Process progression");
    });

    it("falls back to Moved to {stage} when child identity is absent", () => {
        const formatted = formatOpportunityActivityTimelineEvent({
            event_type: "child_lifecycle_status_changed",
            payload: {
                previous_status_key: "lead",
                next_status_key: "waitlist",
                source: "stage_operating_plan_v1",
            },
        });
        expect(formatted.title).toBe("Moved to Waitlist");
        expect(formatted.detail).toBe("Process progression");
    });

    it("promotes family opportunity status moves without inventing a child", () => {
        const formatted = formatOpportunityActivityTimelineEvent({
            event_type: "opportunity_status_changed",
            payload: {
                old_status_key: "lead",
                new_status_key: "waitlist",
            },
        });
        expect(formatted.title).toBe("Moved to Waitlist");
        expect(formatted.detail).toBe("Process progression");
        expect(formatted.title).not.toMatch(/Wrigley|Lennon/i);
    });
});
