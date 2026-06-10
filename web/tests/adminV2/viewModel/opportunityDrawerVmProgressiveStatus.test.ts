import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("Opportunity VM drawer header status", () => {
    it("VmDrawerHeaderStatusSelect renders native select on first paint when editable", () => {
        const src = read("components/admin/vmDrawer/VmDrawerHeaderStatusSelect.tsx");
        expect(src).toContain("<select");
        expect(src).toContain('data-vm-status-dropdown-affordance="select"');
        expect(src).not.toContain("activateDropdown");
        expect(src).not.toContain('onFocus={() => void activateDropdown');
    });

    it("loads status options on mount via fetch fallback when VM options absent", () => {
        const src = read("components/admin/vmDrawer/VmDrawerHeaderStatusSelect.tsx");
        expect(src).toContain("statusOptionsFetchUrl");
        expect(src).toContain("/api/admin/status-options?entity_type=");
        expect(src).toContain("useEffect");
    });

    it("uses VM embedded options when present before fetch", () => {
        const src = read("components/admin/vmDrawer/VmDrawerHeaderStatusSelect.tsx");
        expect(src).toContain("optionsFromVmStatus");
        expect(src).toContain("embeddedOptions");
    });

    it("canMutate=false stays readonly pill", () => {
        const src = read("components/admin/vmDrawer/VmDrawerHeaderStatusSelect.tsx");
        expect(src).toContain("VmReadonlyStatusPill");
        expect(src).toMatch(/const showSelect = canMutate/);
    });

    it("OpportunityDrawerVmRuntime uses progressive status wrapper", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("VmProgressiveStatusDropdown");
        expect(runtime).not.toContain("statusBadge");
    });

    it("compose builds dropdown status control when multiple opportunity defs exist", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelHeader.ts");
        expect(compose).toContain('renderAs: "dropdown"');
    });

    it("runtime debug badge only when NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG is enabled", () => {
        const debug = read("lib/adminV2/drawer/drawerRuntimeDebug.ts");
        expect(debug).toContain("NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG");
    });
});
