import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildQueueRowDisplayPatchFromPersonSave } from "@/lib/admin/opportunityQueueRowDisplayPatch";
import {
    isQueueMembershipMutationActionKey,
    shouldPatchWorkUnitQueueRowsForEvent,
    shouldRefetchWorkUnitQueueRowsForEvent,
    shouldRefreshQueueSummariesForEvent,
} from "@/lib/admin/opportunityQueueRefreshEvent";

const webRoot = join(__dirname, "..", "..");

describe("opportunityQueueRefreshEvent", () => {
    const personPatch = buildQueueRowDisplayPatchFromPersonSave({
        personId: "p1",
        patch: { email: "patched@example.com" },
        person: { first_name: "Pat", last_name: "Lee", email: "patched@example.com" },
    });

    it("refetches rows when event has no id (legacy broadcast)", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: {},
                visibleOpportunityIds: ["a"],
            })
        ).toBe(true);
    });

    it("treats create_lead as a queue-membership mutation", () => {
        // A new lead changes New Leads lane membership — listeners must refetch, not no-op.
        expect(isQueueMembershipMutationActionKey("create_lead")).toBe(true);
    });

    it("refetches lane rows AND summaries for a newly created lead not yet in the visible list", () => {
        const detail = { id: "opp-new", action_key: "create_lead" };
        const visibleOpportunityIds = ["opp-1", "opp-2"]; // new lead is off-screen
        // Row refetch is required so the new lead appears in the lane (not just the count).
        expect(shouldRefetchWorkUnitQueueRowsForEvent({ detail, visibleOpportunityIds })).toBe(true);
        // Counts/pills must refetch too.
        expect(shouldRefreshQueueSummariesForEvent({ detail, visibleOpportunityIds })).toBe(true);
    });

    it("refetches rows when updated id is visible and action is membership (inline_save)", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "opp-1", action_key: "inline_save" },
                visibleOpportunityIds: ["opp-1", "opp-2"],
            })
        ).toBe(true);
        expect(
            shouldPatchWorkUnitQueueRowsForEvent({
                detail: { id: "opp-1", action_key: "inline_save" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
    });

    it("patches visible row for person_contact_save with queue_row_patch (no refetch)", () => {
        const detail = {
            id: "opp-1",
            action_key: "person_contact_save",
            queue_row_patch: personPatch,
        };
        expect(
            shouldPatchWorkUnitQueueRowsForEvent({
                detail,
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(true);
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail,
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
        expect(
            shouldRefreshQueueSummariesForEvent({
                detail,
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
    });

    it("refetches visible row when patch action has no queue_row_patch payload", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "opp-1", action_key: "person_contact_save" },
                visibleOpportunityIds: ["opp-1"],
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

    it("skips row refetch for off-screen person_contact_save", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "other-opp", action_key: "person_contact_save" },
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
        expect(isQueueMembershipMutationActionKey("customer_member_inline_save")).toBe(true);
        expect(isQueueMembershipMutationActionKey("family_contacts_registry")).toBe(true);
        expect(isQueueMembershipMutationActionKey("person_employee_updated")).toBe(true);
    });

    it("refetches waitlist rows for person_employee_updated broadcast", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { action_key: "person_employee_updated" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(true);
    });

    it("work-unit page patches rows before conditional cache delete", () => {
        const page = readFileSync(
            join(webRoot, "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"),
            "utf8"
        );
        expect(page).toContain("shouldPatchWorkUnitQueueRowsForEvent");
        expect(page).toContain("patchWorkUnitQueueItemsResult");
        expect(page).toMatch(/if \(refreshRows\)[\s\S]{0,120}deleteQueueRowCacheKeysForWorkUnit/);
    });
});
