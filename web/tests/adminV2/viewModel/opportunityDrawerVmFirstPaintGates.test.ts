import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("opportunityDrawerVmFirstPaintGates", () => {
    it("AdminEntityDrawer bypasses presentation and overview gates when VM first paint settled", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("opportunityDrawerVmFirstPaintSettled");
        expect(drawer).toContain("opportunityDrawerViewModelFirstPaintSettled");
        expect(drawer).toMatch(/if \(opportunityDrawerVmFirstPaintSettled\) \{[\s\S]*?ready: true/);
        expect(drawer).toMatch(
            /opportunityDrawerOverviewRevealReady = opportunityInquiryWorkflowDrawer[\s\S]*?opportunityDrawerVmFirstPaintSettled/
        );
    });

    it("disables post-VM first-paint refetches for tours and inquiry summary strip", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toMatch(/const tourBookingsFetchEnabled =[\s\S]*?!opportunityDrawerVmFirstPaintSettled/);
        expect(drawer).toMatch(/const inquirySummaryFetchEnabled =[\s\S]*?!opportunityDrawerVmFirstPaintSettled/);
        expect(drawer).toContain("vmFirstPaintCommit={opportunityDrawerVmFirstPaintSettled}");
    });

    it("sets belowFoldRevealed on VM apply when first_paint.settled", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toMatch(/if \(preload\.viewModel\.first_paint\.settled\) \{[\s\S]*?setOpportunityDrawerBelowFoldRevealed\(true\)/);
    });
});

describe("opportunityDrawerVmNoLegacyOverwrite", () => {
    it("keeps hard-cutover blocks on legacy hydrates", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("opportunityDrawerHardCutoverEnabled()");
        expect(drawer).toMatch(/if \(opportunityDrawerHardCutoverEnabled\(\) \|\| opportunityDrawerViewModelOpenRef/);
    });

    it("coordinator does not fallback when hard cutover enabled", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toContain("throwOpportunityDrawerViewModelHardCutoverFailure");
        expect(lib).not.toMatch(/await runOpportunityDrawerViewModelShadow/);
    });
});
