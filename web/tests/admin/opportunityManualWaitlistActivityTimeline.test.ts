import { describe, expect, it } from "vitest";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";
import {
    OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_CREATED,
    OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_RELEASED,
} from "@/lib/orchestration/placement/emitPlacementManualOrderActivity";

describe("opportunity activity timeline — manual waitlist adjustment", () => {
    it("shows operator-friendly title and summary detail", () => {
        const formatted = formatOpportunityActivityTimelineEvent({
            event_type: OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_CREATED,
            payload: {
                summary: "Mia Hayes moved higher within Pre-K — 4–5 years waitlist.",
                actor_user_id: "user-1",
                reason: "Sibling starting soon",
            },
        });
        expect(formatted.title).toBe("Waitlist position manually adjusted");
        expect(formatted.detail).toMatch(/Mia Hayes/i);
        expect(formatted.detail).toMatch(/Pre-K/i);
    });

    it("shows release title for reset events", () => {
        const formatted = formatOpportunityActivityTimelineEvent({
            event_type: OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_RELEASED,
            payload: {
                summary: "Mia Hayes returned to policy-based ordering.",
                actor_user_id: "user-1",
                reason: "Reset manual adjustment",
            },
        });
        expect(formatted.title).toBe("Waitlist manual adjustment removed");
        expect(formatted.detail).toMatch(/Mia Hayes/i);
        expect(formatted.detail).toMatch(/policy-based/i);
    });
});
