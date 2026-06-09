import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EntityDrawerOperatingShell from "@/components/admin/drawer/EntityDrawerOperatingShell";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("EntityDrawerOperatingShell", () => {
    it("renders nothing when closed (Drawer isOpen gate)", () => {
        const html = renderToStaticMarkup(
            <EntityDrawerOperatingShell
                entity="opportunity"
                isOpen={false}
                onClose={() => {}}
                title="Test Household"
                composedStickyHeader={<div data-test-composed-header="true">Header</div>}
                runtimeDataAttribute="opportunity-vm"
            >
                <p data-test-body="true">Body</p>
            </EntityDrawerOperatingShell>,
        );
        expect(html).toBe("");
    });

    it("OpportunityDrawerVmRuntime delegates frame to EntityDrawerOperatingShell", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const shell = readSrc("components/admin/drawer/EntityDrawerOperatingShell.tsx");
        expect(runtime).toContain("EntityDrawerOperatingShell");
        expect(runtime).toContain('entity="opportunity"');
        expect(runtime).toContain("headerTitleCenter={layoutCutoverHeader ? undefined : headerAttentionCenter}");
        expect(runtime).toContain("composedStickyHeader={composedProofHeader}");
        expect(runtime).toContain('runtimeDataAttribute="opportunity-vm"');
        expect(runtime).not.toContain('from "@/components/admin/Drawer"');
        expect(shell).toContain("composedStickyHeader");
        expect(shell).toContain("data-entity-drawer-operating-shell");
    });

    it("PersonsDrawerVmRuntime delegates frame to EntityDrawerOperatingShell", () => {
        const runtime = readSrc("components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx");
        expect(runtime).toContain("EntityDrawerOperatingShell");
        expect(runtime).toContain('entity={shellEntity}');
        expect(runtime).toContain('shellEntity = isChildSurface ? "child" : "person"');
        expect(runtime).toContain("composedStickyHeader={composedProofHeader}");
        expect(runtime).toContain('runtimeDataAttribute={isChildSurface ? "child-vm" : "person-vm"}');
        expect(runtime).toContain('panelClassName="max-w-5xl"');
        expect(runtime).toContain("PersonDrawerProofLayoutHeader");
        expect(runtime).toContain("data-person-drawer-vm-chrome={chrome}");
        expect(runtime).not.toContain('from "@/components/admin/Drawer"');
    });

    it("ChildDrawerVmRuntime remains unused by AdminEntityDrawer router", () => {
        const router = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(router).toContain("PersonsDrawerVmRuntime");
        expect(router).not.toContain("ChildDrawerVmRuntime");
    });

    it("renders summary strip inside scroll body without sticky overlay", () => {
        const shell = readSrc("components/admin/drawer/EntityDrawerOperatingShell.tsx");
        expect(shell).toContain('data-entity-drawer-summary-strip-scrolls="true"');
        expect(shell).toContain('data-entity-drawer-scroll-body="true"');
        expect(shell).not.toMatch(/summary-strip[\s\S]*sticky top-0/);
    });

    it("renders summary strip container only when content is provided", () => {
        const shell = readSrc("components/admin/drawer/EntityDrawerOperatingShell.tsx");
        expect(shell).toContain('data-entity-drawer-summary-strip="true"');
        expect(shell).toContain('data-entity-drawer-scroll-body="true"');
        expect(shell).toContain("showSummaryStrip");
        expect(shell).toContain("{summaryStrip}");
    });

    it("documents scroll-body markers on the strip host", () => {
        const shell = readSrc("components/admin/drawer/EntityDrawerOperatingShell.tsx");
        expect(shell).toContain('data-entity-drawer-scroll-body="true"');
        expect(shell).toContain('data-entity-drawer-summary-strip-scrolls="true"');
    });

    it("OpportunityDrawerVmRuntime wires optional summary strip boundary", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("isDrawerSummaryStripBoundaryEnabledClient");
        expect(runtime).toContain("splitDrawerLayoutDocShellZones");
        expect(runtime).toContain("DrawerLayoutRuntimeShellZoneView");
        expect(runtime).toContain("summaryStrip={");
        expect(runtime).toContain("layoutDocBodyOverride={overviewLayoutDocBodyOverride}");
    });
});
