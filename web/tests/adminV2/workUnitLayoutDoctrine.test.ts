import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = join(root, "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Work Unit Layout Doctrine", () => {
    it("documents canonical three-zone layout and BOS rail behavior", () => {
        const doc = readFileSync(join(webRoot, "../docs/system/work-unit-layout-doctrine.md"), "utf8");
        expect(doc).toContain("Zone 1 — Work Unit Header");
        expect(doc).toContain("Zone 2 — Queue Workspace");
        expect(doc).toContain("Zone 3 — Operational Intelligence");
        expect(doc).toContain("position: sticky");
    });

    it("reduces bounded queue height ~15–20% with intelligence peek reserve", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain("--ws-wu-queue-viewport-height-ratio: 0.825");
        expect(css).toContain("--ws-wu-queue-records-scroll-height-cap: 528px");
        expect(css).toContain("--ws-wu-queue-intelligence-peek-reserve: 10rem");
        expect(css).toContain("work-unit-layout-doctrine.md");
    });

    it("keeps queue records in an independently scrolling shell", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        const scrollShellRule = css.match(
            /\[data-ws-surface="work_unit"\]\.adminv2-ws-work-unit\.adminv2-ws-wu-v2 \.adminv2-ws-wu-queue-list-shell\s*\{[^}]+\}/,
        )?.[0];
        expect(scrollShellRule).toBeDefined();
        expect(scrollShellRule).toContain("max-height: var(--ws-wu-queue-records-scroll-max-height)");
        expect(scrollShellRule).toContain("overflow-y: auto");
    });

    it("marks operational intelligence below queue in WorkUnitWorkspace", () => {
        const shell = read("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(shell).toContain('data-workspace-zone="operational-intelligence"');
        expect(shell).toContain("primaryFooterSlot");
        expect(shell).toContain("WorkUnitAboveFoldActionsRail");
    });

    it("pins BOS command rail while primary column scrolls", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toMatch(
            /\[data-adminv2-workspace-command-column\][\s\S]*?position:\s*sticky/,
        );
        expect(css).toContain('[data-ws-surface="work_unit"].adminv2-ws-wu-v2');
    });

    it("routes all work-unit pages through WorkUnitWorkspace shell", () => {
        const deptWuPage = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(deptWuPage).toContain("<WorkUnitWorkspace");
        const slugHost = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(slugHost).toContain("AdminV2OpportunityWorkUnitPage");
    });
});
