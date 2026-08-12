import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { diagnoseOpportunityDrawerComposedRevealReady } from "@/lib/admin/drawer/opportunityDrawerComposedRevealDiagnostics";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";

const ROOT = process.cwd();

function read(rel: string): string {
    return readFileSync(join(ROOT, rel), "utf8");
}

const PAGE = "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx";

describe("performanceUiStabilityHotfix — drawer VM first-paint", () => {
    it("composed_not_ready returns missing_fields diagnostics from load path", () => {
        const load = read("lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel.ts");
        expect(load).toContain("diagnoseOpportunityDrawerComposedRevealReady");
        expect(load).toContain("missing_fields");
        expect(load).toContain("drawer_vm_composed_not_ready");
        expect(load).toContain("opportunityDrawerVmPreloadRevealReady");
    });

    it("VM-first reveal accepts settled VM when legacy composed gate misses", () => {
        const load = read("lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel.ts");
        expect(load).toMatch(/!legacyRevealReady && vmRevealReady/);
        expect(load).toContain("drawer_vm_composed_legacy_miss_vm_ok");
    });

    it("diagnoseOpportunityDrawerComposedRevealReady lists absent contract fields", () => {
        const missing = diagnoseOpportunityDrawerComposedRevealReady({
            opportunityId: "",
            primaryEntity: {},
            headerActions: null,
            bootstrap: { entity: null },
        } as unknown as OpportunityDrawerOpenPreload);
        expect(missing).toContain("opportunity_id");
        expect(missing).toContain("header_actions");
        expect(missing).toContain("bootstrap_entity");
    });
});

describe("performanceUiStabilityHotfix — opportunity drawer loading surface", () => {
    it("OpportunityDrawerOpeningOverlay uses canonical BOS loader, not BosExecutionLoader", () => {
        const overlay = read("components/admin/OpportunityDrawerOpeningOverlay.tsx");
        expect(overlay).toContain("AlloyCanonicalLoadingSurface");
        expect(overlay).not.toContain("BosExecutionLoader");
        expect(overlay).not.toContain("Opening Lead");
        expect(overlay).not.toContain("Preparing inquiry workspace");
    });

    it("drawer body swap has max-hold timeout", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("DRAWER_SWAP_BODY_MAX_HOLD_MS");
        expect(ctx).toContain("Promise.race");
    });
});
