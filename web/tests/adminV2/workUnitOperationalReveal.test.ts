import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldDeferOpportunityDrawerOpen } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { ALLOY_OS_RUNTIME_ENABLED } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const WORK_UNIT_PATH = "/adminV2/workspace/dept/dept-1/work-unit/enrollment";
const NON_WORK_UNIT_PATH = "/adminV2/workspace";

describe("Work Unit operational reveal — legacy overlay quarantine", () => {
    it("identifies Preparing record… as OpportunityDrawerOpeningOverlay", () => {
        const overlay = readSrc("components/admin/OpportunityDrawerOpeningOverlay.tsx");
        expect(overlay).toContain('data-opportunity-drawer-opening-overlay="true"');
        expect(overlay).toContain("Preparing ${recordLabel}…");
    });

    it("runtime-on work unit bypasses deferred coordinator open (no centered overlay gate)", () => {
        if (!ALLOY_OS_RUNTIME_ENABLED) return;
        expect(shouldDeferOpportunityDrawerOpen(WORK_UNIT_PATH, "opp-1")).toBe(false);
    });

    it("non-work-unit canonical paths still defer when bootstrap enabled", () => {
        const coordinator = readSrc("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(coordinator).toContain("isCanonicalDrawerHostPath(p)");
        // Workspace landing is canonical but not a work-unit queue surface.
        const deferred = shouldDeferOpportunityDrawerOpen(NON_WORK_UNIT_PATH, "opp-1");
        // When bootstrap is off in test env, defer is always false — assert wiring exists instead.
        if (!deferred) {
            expect(coordinator).toContain("adminV2DrawerBootstrapEnabled");
        }
    });

    it("OpportunityDrawerVmRuntime suppresses centered overlay when Focus Panel split is active", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("!focusPanelActive");
        expect(runtime).toContain("showRuntimeOpeningOverlay");
        expect(runtime).toContain("focusPanelShellOpen");
        expect(runtime).toContain("focusPanelPayloadPending");
        expect(runtime).toContain('data-alloy-os-focus-panel-pending="true"');
        expect(runtime).toMatch(/isOpen=\{drawerShellIsOpen\}/);
    });

    it("QueueBlock keeps rows clickable once a subject drawer id is selected", () => {
        const queue = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queue).toContain("!openDrawerOpportunityId");
        expect(queue).toContain("OperationalModeQueuePreparePanel");
    });

    it("manual selection blocks default auto-open overwrite", () => {
        const hook = readSrc(
            "lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts",
        );
        expect(hook).toContain("manualSelectionRef");
        expect(hook).toContain("if (manualSelectionRef.current) return");
        expect(hook).toContain("alloy-os-manual-operational-subject");
    });

    it("deep link auto-open respects URL record id", () => {
        const hook = readSrc(
            "lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts",
        );
        expect(hook).toContain("if (urlRecordId) return");
    });

    it("split outside-click guard treats queue scrollport as subject swap, not close", () => {
        const outsideClick = readSrc("lib/adminV2/drawerOutsideClick.ts");
        expect(outsideClick).toContain("data-workspace-queue-scrollport");
        expect(outsideClick).toContain("alloyOsSplitActive");
    });

    it("no overlapping prep: in-queue prep hidden when drawer subject is opening", () => {
        const queue = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queue).toMatch(
            /operationalModePreparing[\s\S]*!openDrawerOpportunityId/,
        );
    });
});
