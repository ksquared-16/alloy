import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(__dirname, "..", "..");

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("workUnitCoordinatedRevealRegression", () => {
    it("page does not expose row skeleton as visible lane state", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        expect(page).toContain("resolveWorkUnitQueueLaneRevealState");
        expect(page).toContain("rowsHeld: !laneMayPaint");
        expect(page).not.toContain("page_seeded_from_cache: workUnitPageSeededWarm");
    });

    it("QueueBlock skips skeleton when lane is held", () => {
        const block = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(block).toContain("!queue.rowsHeld");
    });

    it("warm page reveal policy requires settled lane", () => {
        const policy = readSrc("lib/adminV2/workUnitPageRevealPolicy.ts");
        expect(policy).not.toContain("page_seeded_from_cache");
        expect(policy).toContain("lane_reveal_settled");
    });
});

describe("drawerCoordinatedRevealRegression (source)", () => {
    it("opportunity releases below-fold lock on primary coordinated reveal", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain(
            "opportunityDrawerOverviewRevealReady && opportunityDrawerPrimaryContractSatisfied"
        );
        expect(drawer).toContain("setOpportunityDrawerBelowFoldRevealed(true)");
    });

    it("child→opportunity restore reveals below-fold for header actions", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain('prev.type === "persons"');
        expect(drawer).toContain("restoreCanRenderFrame");
        expect(drawer).toContain("setOpportunityDrawerBelowFoldRevealed(true)");
    });

    it("person section reserves use final-size variants", () => {
        const reserve = readSrc("components/admin/entity/PersonDrawerSectionCoordinatedReserve.tsx");
        const operating = readSrc("components/admin/entity/PersonDrawerOperatingSections.tsx");
        expect(reserve).toContain("min-h-[11rem]");
        expect(operating).toContain("data-person-drawer-layout-variant={variant.variant_key}");
        expect(reserve).not.toContain("skeleton-pulse");
    });
});
