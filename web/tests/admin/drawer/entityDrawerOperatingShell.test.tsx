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

});
