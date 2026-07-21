import { describe, expect, it } from "vitest";
import { configurationModeNavItemActive } from "@/lib/adminV2/configurationModeNav";
import { CANONICAL_ORGANIZATION_PROGRAMS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
    commercialEntryToProgramsHref,
    commercialSettingsHref,
    isProgramsOwnedCommercialChapter,
    normalizeProgramsWorkspaceChapter,
    organizationProgramsChapterHref,
    PROGRAMS_WORKSPACE_CHAPTERS,
} from "@/lib/commercial/commercialChapterRoutes";
import { PROGRAMS_WORKSPACE_SIBLING_CHAPTERS } from "@/lib/configRuntime/configurationObject/programsAdoptionSeam";
import { isConfigurationSoftNavEligibleHref } from "@/lib/configRuntime/configurationContinuity";
import { shouldSoftNavigate } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Programs workspace chapters (Commercial migration)", () => {
    it("Organization Programs href stays canonical and soft-nav eligible", () => {
        expect(CANONICAL_ORGANIZATION_PROGRAMS_HREF).toBe("/organization/programs");
        expect(isConfigurationSoftNavEligibleHref("/organization/programs")).toBe(true);
        expect(shouldSoftNavigate("/organization/programs?chapter=tuition")).toBe(true);
    });

    it("does not treat Commercial as Programs-active in sidebar", () => {
        expect(configurationModeNavItemActive("/organization/programs", "/organization/programs")).toBe(true);
        expect(configurationModeNavItemActive("/organization/programs", "/settings/commercial")).toBe(false);
    });

    it("maps every Commercial chapter onto /organization/programs", () => {
        for (const chapter of PROGRAMS_WORKSPACE_CHAPTERS) {
            expect(organizationProgramsChapterHref(chapter)).toBe(
                `/organization/programs?chapter=${chapter}`,
            );
            expect(commercialEntryToProgramsHref(chapter)).toBe(
                `/organization/programs?chapter=${chapter}`,
            );
            expect(commercialSettingsHref(chapter)).toBe(`/organization/programs?chapter=${chapter}`);
        }
        expect(commercialEntryToProgramsHref(null)).toBe("/organization/programs");
        expect(commercialEntryToProgramsHref("programs")).toBe("/organization/programs");
        expect(normalizeProgramsWorkspaceChapter("fees")).toBe("catalog");
        expect(isProgramsOwnedCommercialChapter("programs")).toBe(true);
    });

    it("sibling chapter links stay on Organization Programs", () => {
        for (const chapter of PROGRAMS_WORKSPACE_SIBLING_CHAPTERS) {
            expect(chapter.href).toMatch(/^\/organization\/programs\?chapter=/);
            expect(chapter.href).not.toContain("/settings/commercial");
        }
    });

    it("Commercial page is redirect-only compatibility", () => {
        const page = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/commercial/page.tsx"),
            "utf8",
        );
        expect(page).toContain("commercialEntryToProgramsHref");
        expect(page).toContain("redirect(");
        expect(page).not.toContain("CommercialConfigWorkspace");
    });

    it("Programs page accepts chapter search param and mounts chapter surface", () => {
        const page = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/organization/programs/page.tsx"),
            "utf8",
        );
        const workspace = readFileSync(
            resolve(process.cwd(), "components/adminV2/settings/programs/ProgramsPublicationWorkspace.tsx"),
            "utf8",
        );
        const surface = readFileSync(
            resolve(process.cwd(), "components/adminV2/settings/programs/ProgramsWorkspaceChapterSurface.tsx"),
            "utf8",
        );
        expect(page).toContain("initialChapter");
        expect(workspace).toContain("ProgramsWorkspaceChapterSurface");
        expect(surface).toContain("programs-workspace-chapter-tabs");
        expect(surface).toContain("TuitionGridWorkspace");
        expect(surface).toContain("CommercialCatalogPanel");
        expect(surface).toContain("CommercialPoliciesPanel");
        expect(surface).toContain("AccountingReferencePanel");
        expect(surface).toContain("CommercialSimulatorPanel");
        expect(surface).toContain("programs-chapter-funding");
    });
});
