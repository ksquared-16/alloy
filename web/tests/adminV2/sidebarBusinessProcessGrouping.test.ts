/**
 * "BUSINESS PROCESSES" — a quiet grouping in the operator rail.
 *
 * Enrollment and its Work Views used to sit directly under Analytics, so the rail read as one
 * flat list in which a Business Process had no more standing than a modal launcher. The heading
 * names the section; it does not become another thing to click, and it does not put any Work
 * View into the source.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const sidebar = () => read("app/adminV2/components/Sidebar.tsx");

/** The lifecycle (Business Process) section of the rail, from its heading to the closing tag. */
function processSection(src: string): string {
    const start = src.indexOf('data-sidebar-group-label="business-processes"');
    expect(start, "the group label must exist").toBeGreaterThan(-1);
    return src.slice(start, src.indexOf("const lifecycleNavCollapsed", start) + 1 || src.length);
}

describe("operator rail — Business Process grouping", () => {
    it("labels the section 'Business Processes'", () => {
        expect(sidebar()).toContain(">\n                Business Processes\n            </p>");
    });

    it("never shortens to a name that collides with Processing", () => {
        const section = processSection(sidebar());
        // "Processes" / "Process" as the heading would sit three rows under the Processing
        // launcher and read as the same area. The full name is the point.
        expect(section).not.toMatch(/>\s*Process(es)?\s*</);
        // Processing itself is untouched and still its own entry.
        expect(sidebar()).toContain("SidebarProcessingNavItem");
    });

    it("is structural, not a destination — no link, no button, no handler", () => {
        const src = sidebar();
        const anchor = src.indexOf('data-sidebar-group-label="business-processes"');
        // The element that carries the label: from its opening tag to its closing one.
        const label = src.slice(src.lastIndexOf("<", anchor), src.indexOf("</p>", anchor) + 4);
        expect(label).toContain("<p");
        expect(label).not.toContain("AdminV2NavLink");
        expect(label).not.toContain("onClick");
        expect(label).not.toContain("href");
    });

    it("wears the same eyebrow class as the Organization rail's group headings", () => {
        expect(sidebar()).toContain("adminv2-sidebar-section-label");
        expect(read("app/adminV2/components/SidebarConfigurationModeNav.tsx"))
            .toContain("adminv2-sidebar-section-label");
        expect(read("app/adminV2/adminV2.css")).toContain(".adminv2-sidebar-section-label");
    });

    it("hardcodes no Business Process and no Work View", () => {
        const src = sidebar();
        // The processes and their views come from the lifecycle catalog at runtime. Naming any
        // of them here is how a configured rail turns into a fixed one.
        for (const configured of [
            "Enrollment",
            "Active Pipeline",
            "Enrolled children",
            "Waitlist",
            "Registration",
            "Tours",
        ]) {
            expect(src, configured).not.toContain(`>${configured}<`);
        }
        expect(src).toContain("lifecycleCards.map");
        expect(src).toContain("lifecycle.workQueues.map");
    });

    it("leaves routing, counts, selected state and expansion where they were", () => {
        const src = sidebar();
        expect(src).toContain("workspaceHref(lifecycle.entryHref)");
        expect(src).toContain("workUnitRouteSlugsEquivalent");
        expect(src).toContain("workViewTotals.get");
        expect(src).toContain("toggleLifecycleExpanded");
        expect(src).toContain("aria-expanded={isExpanded}");
    });
});
