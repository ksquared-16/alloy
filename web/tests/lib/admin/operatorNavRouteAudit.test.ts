import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseOperatorWorkUnitPath } from "@/lib/admin/canonicalOperatorRoutes";
import { workUnitRouteSlugsEquivalent } from "@/lib/admin/workUnitRouteSlug";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

function hrefLiterals(source: string): string[] {
    const matches = source.match(/href:\s*"([^"]+)"/g) ?? [];
    return matches.map((m) => m.replace(/^href:\s*"/, "").replace(/"$/, ""));
}

const PRODUCT_NAV_FILES = [
    "app/adminV2/components/Sidebar.tsx",
    "app/adminV2/components/TopNavBar.tsx",
    "app/adminV2/components/AdminV2ProfileMenu.tsx",
    "app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx",
    "lib/admin/actions/applyRegistryResolvedActionClient.ts",
    "lib/adminV2/navigation/buildWorkspaceNavDeptChildren.ts",
    "app/adminV2/workflows/page.tsx",
    "components/adminV2/settings/LifecycleRelatedSettingsLinks.tsx",
] as const;

const FORBIDDEN_EMIT_PATTERNS = [
    /href=\{?"\/adminV2\/(workspace|settings)/,
    /href=\{?"\/admin\/workspace/,
    /router\.(push|replace)\(\s*`?\/adminV2\/(workspace|settings)/,
    /router\.(push|replace)\(\s*`?\/admin\/workspace/,
    /return\s+"\/adminV2\/workspace"/,
] as const;

describe("operator nav route audit", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sidebar lifecycle queue links use /workspace work-unit slugs", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("CANONICAL_OPERATOR_BASE");
        expect(sidebar).not.toMatch(/href:\s*"\/adminV2\/workspace/);
    });

    it("workspace root actions rail avoids hardcoded legacy hrefs", () => {
        const rail = read("app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx");
        const hrefs = hrefLiterals(rail);
        expect(hrefs.some((h) => h.startsWith("/adminV2"))).toBe(false);
        expect(hrefs.some((h) => h.startsWith("/legacy-admin"))).toBe(false);
        expect(hrefs.some((h) => h.startsWith("/admin/forms"))).toBe(false);
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

    it.each(PRODUCT_NAV_FILES)("product nav file %s does not emit forbidden workspace paths", (rel) => {
        const src = read(rel);
        for (const pattern of FORBIDDEN_EMIT_PATTERNS) {
            expect(src, `${rel} must not match ${pattern}`).not.toMatch(pattern);
        }
    });
});
