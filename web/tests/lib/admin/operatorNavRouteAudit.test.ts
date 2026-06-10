import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseOperatorWorkUnitPath } from "@/lib/admin/canonicalOperatorRoutes";
import { workUnitRouteSlugsEquivalent } from "@/lib/admin/workUnitRouteSlug";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

function hrefLiterals(source: string): string[] {
    const matches = source.match(/href:\s*"([^"]+)"/g) ?? [];
    return matches.map((m) => m.replace(/^href:\s*"/, "").replace(/"$/, ""));
}

describe("operator nav route audit", () => {
    it("sidebar lifecycle queue links use /workspace work-unit slugs", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("CANONICAL_OPERATOR_BASE");
        expect(sidebar).not.toMatch(/href:\s*"\/adminV2\/workspace/);
    });

    it("workspace root actions rail avoids /adminV2 product hrefs", () => {
        const rail = read("app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx");
        const hrefs = hrefLiterals(rail);
        expect(hrefs.some((h) => h.startsWith("/adminV2"))).toBe(false);
        expect(hrefs).toContain("/admin/forms");
    });

    it("workspace nav child builder emits operator work-unit hrefs", () => {
        const builder = read("lib/adminV2/navigation/buildWorkspaceNavDeptChildren.ts");
        expect(builder).toContain("operatorWorkUnitHrefFromKey");
        expect(builder).not.toMatch(/`\/adminV2\/workspace/);
    });

    it("keeps work-unit slug active when recordId segment is present", () => {
        const withRecord = parseOperatorWorkUnitPath("/workspace/work-unit/new-leads/opp-1");
        const withoutRecord = parseOperatorWorkUnitPath("/workspace/work-unit/new-leads");
        expect(withRecord.workUnitSlug).toBe("new-leads");
        expect(withoutRecord.workUnitSlug).toBe("new-leads");
        expect(
            workUnitRouteSlugsEquivalent(withRecord.workUnitSlug ?? "", withoutRecord.workUnitSlug ?? ""),
        ).toBe(true);
    });
});
