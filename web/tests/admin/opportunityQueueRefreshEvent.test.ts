import { describe, expect, it } from "vitest";
import {
    isQueueMembershipMutationActionKey,
    shouldRefetchWorkUnitQueueRowsForEvent,
} from "@/lib/admin/opportunityQueueRefreshEvent";

describe("opportunityQueueRefreshEvent", () => {
    it("refetches rows when event has no id (legacy broadcast)", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: {},
                visibleOpportunityIds: ["a"],
            })
        ).toBe(true);
    });

    it("refetches rows when updated id is visible in the lane", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "opp-1", action_key: "inline_save" },
                visibleOpportunityIds: ["opp-1", "opp-2"],
            })
        ).toBe(true);
    });

    it("skips row refetch when id is not visible and action is non-membership", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "other-opp", action_key: "drawer_header_refresh" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
    });

    it("refetches rows for membership mutations even when id not visible", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "other-opp", action_key: "inline_save" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(true);
        expect(isQueueMembershipMutationActionKey("inline_save")).toBe(true);
        expect(isQueueMembershipMutationActionKey("person_contact_save")).toBe(true);
    });
});
