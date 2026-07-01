/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { warmCreateLeadOpportunityDrawer } from "@/lib/admin/actions/warmCreateLeadOpportunityDrawer";

vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate", () => ({
    opportunityDrawerHardCutoverEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/admin/opportunityDrawerIntentPrefetch", () => ({
    prefetchOpportunityDrawerOnRowIntent: vi.fn(),
}));

vi.mock("@/lib/admin/opportunityDrawerPrimaryPrefetch", () => ({
    fetchOpportunityDrawerPrimaryEntity: vi.fn().mockResolvedValue({ id: "opp-1" }),
    isOpportunityDrawerPrimaryWarm: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/admin/opportunityDrawerFullPrefetch", () => ({
    prefetchOpportunityDrawerFull: vi.fn(),
}));

import { prefetchOpportunityDrawerOnRowIntent } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { fetchOpportunityDrawerPrimaryEntity } from "@/lib/admin/opportunityDrawerPrimaryPrefetch";
import { prefetchOpportunityDrawerFull } from "@/lib/admin/opportunityDrawerFullPrefetch";

describe("warmCreateLeadOpportunityDrawer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("reuses drawer primary fetch path and dedupes in-flight warm", async () => {
        await warmCreateLeadOpportunityDrawer("opp-1", { department_id: "dept-1" });
        await warmCreateLeadOpportunityDrawer("opp-1", { department_id: "dept-1" });

        expect(prefetchOpportunityDrawerOnRowIntent).toHaveBeenCalledTimes(1);
        expect(fetchOpportunityDrawerPrimaryEntity).toHaveBeenCalledTimes(1);
        expect(prefetchOpportunityDrawerFull).toHaveBeenCalledTimes(1);
    });
});
