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
        expect(src).toContain('data-vm-progressive-status="pill"');
        expect(src).not.toContain("useEffect(() => {\n        fetch(");
        expect(src).not.toMatch(/useLayoutEffect[\s\S]*status-options/);
    });

    it("loads status options only after explicit interaction", () => {
        const src = read("components/admin/vmDrawer/VmProgressiveStatusDropdown.tsx");
        expect(src).toContain("/api/admin/status-options?entity_type=opportunities");
        expect(src).toContain("activateDropdown");
        expect(src).toMatch(/onClick=\{.*activateDropdown/);
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
});
