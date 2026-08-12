import { describe, expect, it } from "vitest";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";

describe("opportunity activity timeline — stage moves", () => {
    it("promotes Lead → Waitlist as the primary title for child lifecycle moves", () => {
        const formatted = formatOpportunityActivityTimelineEvent({
            event_type: "child_lifecycle_status_changed",
            payload: {
                previous_status_key: "lead",
                next_status_key: "waitlist",
                source: "stage_operating_plan_v1",
            },
        });
        expect(formatted.title).toBe("Lead → Waitlist");
        expect(formatted.detail).toBeNull();
    });

    it("promotes family opportunity status moves the same way", () => {
        const formatted = formatOpportunityActivityTimelineEvent({
            event_type: "opportunity_status_changed",
            payload: {
                old_status_key: "lead",
                new_status_key: "waitlist",
            },
        });
        expect(formatted.title).toBe("Lead → Waitlist");
        expect(formatted.detail).toBeNull();
    });
});
