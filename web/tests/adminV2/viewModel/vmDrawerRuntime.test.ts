import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate", () => ({
    opportunityDrawerHardCutoverEnabled: () => true,
}));

import { resolveVmDrawerRuntimeRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute";
import {
    shouldAllowColdOpenLoading,
    shouldHoldPriorDrawerContent,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";

describe("vmDrawerRuntimeRoute", () => {
    it("routes adminV2 opportunities with VM cutover to opportunity runtime", () => {
        expect(
            resolveVmDrawerRuntimeRoute(
                { type: "opportunities", id: "opp-1" },
                "/adminV2/workspace/dept/d1/work-unit/w1"
            )
        ).toBe("opportunity");
    });

    it("keeps legacy for non-adminV2 surfaces", () => {
        expect(
            resolveVmDrawerRuntimeRoute({ type: "opportunities", id: "opp-1" }, "/admin/legacy")
        ).toBe("legacy");
    });

    it("keeps legacy for non-VM entity types", () => {
        expect(
            resolveVmDrawerRuntimeRoute({ type: "jobs", id: "job-1" }, "/adminV2/workspace")
        ).toBe("legacy");
    });
});

describe("VM drawer runtime wiring", () => {
    it("AdminEntityDrawer is a thin router to VmRuntime vs Legacy", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const router = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(router).toContain("OpportunityDrawerVmRuntime");
        expect(router).toContain("AdminEntityDrawerLegacy");
        expect(router).not.toContain("opportunityInquiryWorkflowHeaderStatus");
    });

    it("OpportunityDrawerVmRuntime does not use legacy status or pill fetch paths", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const vm = readFileSync(
            join(webRoot, "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        expect(vm).toContain("VmOpportunityStatusControl");
        expect(vm).toContain("VmInquiryRightColumn");
        expect(vm).not.toContain("opportunityInquiryWorkflowHeaderStatus");
        expect(vm).not.toContain("opportunityDrawerOverviewRevealReady");
        expect(vm).not.toContain("OpportunityOperationalCompactStrip");
        expect(vm).not.toContain("DrawerOpportunityOperationalLoadingComposition");
        expect(vm).not.toContain("opportunityDrawerPipeline");
    });

    it("VmOpportunityStatusControl has no skeleton or null return for settled VM", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const status = readFileSync(
            join(webRoot, "components/admin/vmDrawer/VmOpportunityStatusControl.tsx"),
            "utf8"
        );
        expect(status).not.toContain("skeleton");
        expect(status).not.toContain("return null");
        expect(status).toContain("data-vm-runtime-status");
    });

    it("VmInquiryRightColumn renders tasks without fetchEnabled", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const col = readFileSync(join(webRoot, "components/admin/vmDrawer/VmInquiryRightColumn.tsx"), "utf8");
        expect(col).not.toContain("fetchEnabled");
        expect(col).not.toContain("OpportunityOperationalCompactStrip");
        expect(col).not.toContain("skeleton");
    });

    it("swap phases suppress full loading shell", () => {
        expect(shouldHoldPriorDrawerContent("swap_preparing")).toBe(true);
        expect(
            shouldAllowColdOpenLoading({ phase: "swap_preparing", hasVisibleDrawerContent: true })
        ).toBe(false);
    });

    it("logs drawer_vm_runtime client events", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const log = readFileSync(
            join(webRoot, "lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog.ts"),
            "utf8"
        );
        expect(log).toContain("[drawer_vm_runtime:mounted]");
        expect(log).toContain("[drawer_vm_runtime:swap_committed]");
        expect(log).toContain("[drawer_vm_runtime_server:compose_ok]");
    });
});
