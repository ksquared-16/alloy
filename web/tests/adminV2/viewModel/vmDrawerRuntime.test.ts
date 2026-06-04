import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate", () => ({
    opportunityDrawerHardCutoverEnabled: () => true,
}));

vi.mock("@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate", () => ({
    personDrawerHardCutoverEnabled: () => true,
}));

vi.mock("@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate", () => ({
    childDrawerHardCutoverEnabled: () => true,
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

    it("routes adminV2 persons with VM cutover to person runtime", () => {
        expect(
            resolveVmDrawerRuntimeRoute(
                { type: "persons", id: "person-1", openSource: "opportunity_primary_contact" },
                "/adminV2/workspace/dept/d1/work-unit/w1"
            )
        ).toBe("person");
    });

    it("routes adminV2 child inquiry opens to child runtime", () => {
        expect(
            resolveVmDrawerRuntimeRoute(
                {
                    type: "persons",
                    id: "child-1",
                    openSource: "opportunity_inquiry_child",
                },
                "/adminV2/workspace/dept/d1/work-unit/w1"
            )
        ).toBe("child");
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
        expect(router).toContain("PersonsDrawerVmRuntime");
        expect(router).not.toContain("PersonDrawerVmRuntime");
        expect(router).not.toContain("ChildDrawerVmRuntime");
        expect(router).toContain("AdminEntityDrawerLegacy");
        expect(router).not.toContain("opportunityInquiryWorkflowHeaderStatus");
    });

    it("PersonsDrawerVmRuntime does not use legacy fetch or skeleton paths", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const vm = readFileSync(
            join(webRoot, "components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx"),
            "utf8"
        );
        expect(vm).toContain("VmPersonStatusControl");
        expect(vm).toContain("usePersonsDrawerVmPayload");
        expect(vm).not.toContain("drawer-operational-bootstrap");
        expect(vm).not.toContain("skeleton");
        expect(vm).not.toContain("status-options");
    });

    it("VM payload hooks hold prior drawer during swap and suppress cold shell", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        for (const file of [
            "useOpportunityDrawerVmPayload.ts",
            "usePersonsDrawerVmPayload.ts",
        ]) {
            const src = readFileSync(
                join(webRoot, "lib/adminV2/viewModel/drawer/vmRuntime", file),
                "utf8"
            );
            expect(src).toContain("swap_hold_current");
            expect(src).toContain("shouldHoldPriorDrawerContent");
            expect(src).toContain("suppressFullDrawerLoading");
        }
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
        expect(status).not.toContain("skeleton-pulse");
        expect(status).not.toContain("fetchEnabled");
        expect(status).toContain("data-vm-runtime-status");
        expect(status).toContain('renderAs === "hidden"');
        expect(status).toContain("!dropdownOpen");
        expect(status).toContain('data-vm-runtime-status="readonly"');
    });

    it("OpportunityDrawerVmRuntime renders queue seed status before VM apply", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const vm = readFileSync(
            join(webRoot, "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        expect(vm).toContain("opportunityQueuePreviewSeed?.statusLabel");
        expect(vm).toContain("holdPriorPayload");
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
        expect(log).toContain("drawer_vm_runtime:${event}");
        expect(log).toContain('"mounted"');
        expect(log).toContain("swap_committed");
        expect(log).toContain("swap_hold_current");
        expect(log).toContain("related_prefetch_start");
        expect(log).toContain("compose_ok");
    });
});
