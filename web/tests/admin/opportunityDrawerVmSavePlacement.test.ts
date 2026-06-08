import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Opportunity drawer VM save placement", () => {
    it("uses floating bottom-right save rail in drawer runtime shell", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const overview = readSrc("components/admin/vmDrawer/OpportunityDrawerOverviewBody.tsx");
        const saveBar = readSrc("components/admin/vmDrawer/OpportunityDrawerBodySaveBar.tsx");
        expect(runtime).toContain("OpportunityDrawerBodySaveBar");
        expect(overview).not.toContain("OpportunityDrawerBodySaveBar");
        expect(saveBar).toContain("absolute inset-x-0 bottom-0");
        expect(saveBar).toContain("ADMINV2_SHELL_COMMAND_INSET");
    });
});

describe("VM drawer action modal portal", () => {
    it("portals registry modals above drawer panel", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const portal = readSrc("components/admin/vmDrawer/VmDrawerActionModalsPortal.tsx");
        expect(runtime).toContain("VmDrawerActionModalsPortal");
        expect(portal).toContain("createPortal");
        expect(portal).toContain('data-vm-drawer-action-modals-host="true"');
    });
});
