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
        expect(vm).toContain("VmReadonlyStatusPill");
        expect(vm).not.toContain("VmOpportunityStatusControl");
        expect(vm).not.toContain("statusBadge");
        expect(vm).toContain("OpportunityDrawerInquiryWorkflowOverview");
        expect(vm).not.toContain("VmInquiryRightColumn");
        expect(vm).not.toContain("opportunityInquiryWorkflowHeaderStatus");
        expect(vm).not.toContain("opportunityDrawerOverviewRevealReady");
        expect(vm).not.toContain("OpportunityOperationalCompactStrip");
        expect(vm).not.toContain("DrawerOpportunityOperationalLoadingComposition");
        expect(vm).not.toContain("opportunityDrawerPipeline");
    });

    it("VmReadonlyStatusPill has no skeleton, select, or hooks", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const pill = readFileSync(
            join(webRoot, "components/admin/vmDrawer/VmReadonlyStatusPill.tsx"),
            "utf8"
        );
        expect(pill).not.toContain("skeleton");
        expect(pill).not.toContain("<select");
        expect(pill).not.toContain("useState");
        expect(pill).toContain("data-vm-readonly-status-pill");
    });

    it("OpportunityDrawerVmRuntime resolves status in title rail before actions mount", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const vm = readFileSync(
            join(webRoot, "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        expect(vm).toContain("resolveOpportunityVmStatusLabel");
        expect(vm).toContain("data-drawer-vm-status-rail");
        expect(vm).not.toContain("statusBadge");
    });

    it("OpportunityDrawerInquiryWorkflowOverview uses production right column not VmInquiryRightColumn", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const overview = readFileSync(
            join(webRoot, "components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx"),
            "utf8"
        );
        expect(overview).toContain("OpportunityInquirySummaryRightColumn");
        expect(overview).not.toContain("VmInquiryRightColumn");
        expect(overview).toContain("fetchEnabled={false}");
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
