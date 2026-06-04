import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("Opportunity VM progressive status", () => {
    it("VmProgressiveStatusDropdown first paint uses readonly pill markup", () => {
        const src = read("components/admin/vmDrawer/VmProgressiveStatusDropdown.tsx");
        expect(src).toContain("VmReadonlyStatusPill");
        expect(src).toContain("data-vm-status-active");
        expect(src).not.toContain("useEffect(() => {\n        fetch(");
        expect(src).not.toMatch(/useLayoutEffect[\s\S]*status-options/);
    });

    it("exposes activation proof data attributes on status wrapper", () => {
        const src = read("components/admin/vmDrawer/VmProgressiveStatusDropdown.tsx");
        expect(src).toContain("data-vm-status-progressive-mounted");
        expect(src).toContain("data-vm-status-can-mutate");
        expect(src).toContain("data-vm-status-options-source");
        expect(src).toContain("data-vm-status-active");
        expect(src).toContain("data-vm-status-last-interaction");
        expect(src).toContain("data-vm-status-can-mutate-reason");
    });

    it("canMutate=false stays readonly and records admin auth reason", () => {
        const src = read("components/admin/vmDrawer/VmProgressiveStatusDropdown.tsx");
        expect(src).toContain("admin-auth-canMutate-false");
        expect(src).toMatch(/if \(!canMutate\)[\s\S]*setActive\("readonly"\)/);
    });

    it("canMutate=true click transitions toward loading/dropdown", () => {
        const src = read("components/admin/vmDrawer/VmProgressiveStatusDropdown.tsx");
        expect(src).toContain('void activateDropdown("click")');
        expect(src).toContain('setActive("loading")');
        expect(src).toContain('setActive("dropdown")');
    });

    it("uses VM embedded options when present before fetch", () => {
        const src = read("components/admin/vmDrawer/VmProgressiveStatusDropdown.tsx");
        expect(src).toContain("optionsFromVmStatus");
        expect(src).toContain('setOptionsSource("vm")');
        expect(src).toMatch(/embeddedOptions[\s\S]*setOptionsSource\("vm"\)/);
    });

    it("loads status options on interaction via fetch fallback when VM options absent", () => {
        const src = read("components/admin/vmDrawer/VmProgressiveStatusDropdown.tsx");
        expect(src).toContain("/api/admin/status-options?entity_type=opportunities");
        expect(src).toContain('setOptionsSource("fetch")');
        expect(src).toContain("activateDropdown");
    });

    it("upgrades to select in the same shell without unmounting rail", () => {
        const src = read("components/admin/vmDrawer/VmProgressiveStatusDropdown.tsx");
        expect(src).toContain("data-opportunity-drawer-vm-status-control");
        expect(src).toContain('data-vm-progressive-status="dropdown"');
        expect(src).toContain("firstPaintLabelRef");
    });

    it("OpportunityDrawerVmRuntime uses progressive status, not legacy controls", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("VmProgressiveStatusDropdown");
        expect(runtime).not.toContain("VmReadonlyStatusPill");
        expect(runtime).not.toContain("statusBadge");
        expect(runtime).not.toContain("VmOpportunityStatusControl");
        expect(runtime).not.toContain("opportunityInquiryWorkflowHeaderStatus");
        expect(runtime).not.toContain("status-options");
    });

    it("derives canMutate from VM header.status_can_mutate with auth fallback", () => {
        const src = read("lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusCanMutate.ts");
        expect(src).toContain("status_can_mutate");
        expect(src).toContain("hasPortalAdminMutateAccess");
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("resolveOpportunityVmStatusCanMutate");
        expect(runtime).toContain("statusCanMutate");
    });

    it("compose sets header.status_can_mutate from admin route gate", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("resolveOpportunityDrawerStatusCanMutateFromGate");
        expect(compose).toContain("status_can_mutate");
    });

    it("compose builds header_menu for Actions dropdown", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("buildOpportunityDrawerHeaderMenuActions");
        expect(compose).toContain("header_menu:");
    });

    it("runtime debug badge only when NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG is enabled", () => {
        const debug = read("lib/adminV2/drawer/drawerRuntimeDebug.ts");
        expect(debug).not.toMatch(/NODE_ENV === "development"/);
        expect(debug).toContain("NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG");
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("drawerRuntimeDebugEnabled()");
    });
});
