import { describe, expect, it } from "vitest";
import { configurationModeNavItemActive } from "@/lib/adminV2/configurationModeNav";
import { CANONICAL_ORGANIZATION_PROGRAMS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import { isConfigurationSoftNavEligibleHref } from "@/lib/configRuntime/configurationContinuity";
import { shouldSoftNavigate } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Programs workspace (Programs-only; Financials owns tool chapters)", () => {
    it("Organization Programs href stays canonical and soft-nav eligible", () => {
        expect(CANONICAL_ORGANIZATION_PROGRAMS_HREF).toBe("/organization/programs");
        expect(isConfigurationSoftNavEligibleHref("/organization/programs")).toBe(true);
        expect(shouldSoftNavigate("/organization/programs")).toBe(true);
    });

    it("does not treat Commercial as Programs-active in sidebar", () => {
        expect(configurationModeNavItemActive("/organization/programs", "/organization/programs")).toBe(true);
        expect(configurationModeNavItemActive("/organization/programs", "/settings/commercial")).toBe(false);
        expect(configurationModeNavItemActive("/organization/programs", "/organization/financials")).toBe(false);
    });

    it("Programs page no longer mounts Financials chapter surface", () => {
        const page = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/organization/programs/page.tsx"),
            "utf8",
        );
        const workspace = readFileSync(
            resolve(process.cwd(), "components/adminV2/settings/programs/ProgramsPublicationWorkspace.tsx"),
            "utf8",
        );
        expect(page).toContain("organizationFinancialsChapterHref");
        expect(workspace).not.toContain("ProgramsWorkspaceChapterSurface");
    });
});
