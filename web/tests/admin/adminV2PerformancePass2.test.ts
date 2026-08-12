import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    isQueueMembershipMutationActionKey,
    shouldRefetchWorkUnitQueueRowsForEvent,
} from "@/lib/admin/opportunityQueueRefreshEvent";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("AdminV2 performance pass 2 contracts", () => {

    it("closeDrawer clears stack without dispatching queue refresh", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        const closeBlock = ctx.match(/const closeDrawer = useCallback\([\s\S]*?\}, \[\]\);/)?.[0] ?? "";
        expect(closeBlock).toContain("setDrawer({ type: null, id: null })");
        expect(closeBlock).not.toContain("dispatchEvent");
        expect(closeBlock).not.toContain("opportunity-updated");
    });

    it("placement and family mutation keys count as lane membership", () => {
        expect(isQueueMembershipMutationActionKey("inquiry_child_placement_scope")).toBe(true);
        expect(isQueueMembershipMutationActionKey("family_contacts_registry")).toBe(true);
        expect(isQueueMembershipMutationActionKey("person_contact_save")).toBe(false);
        expect(isQueueMembershipMutationActionKey("inquiry_children_placement")).toBe(false);
    });

    it("skips row refetch for off-lane non-membership drawer header refresh", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "other-opp", action_key: "drawer_header_refresh" },
                visibleOpportunityIds: ["visible-opp"],
            })
        ).toBe(false);
    });

    it("navigateOpportunityInQueue skips composed open when preload already matches target", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("opportunityDrawerPreloadRef.current?.opportunityId === targetId.trim()");
        expect(ctx).toMatch(/if \(preloadReady \|\| snapshotWarm\) \{[\s\S]{0,120}return;/);
    });

});
