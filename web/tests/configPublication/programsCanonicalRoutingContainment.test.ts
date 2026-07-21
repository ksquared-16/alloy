import { describe, expect, it } from "vitest";
import { configurationModeNavItemActive } from "@/lib/adminV2/configurationModeNav";
import { CANONICAL_ORGANIZATION_PROGRAMS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
    commercialCompatChapterToSection,
    commercialSettingsHref,
    isProgramsOwnedCommercialChapter,
    normalizeCommercialCompatChapter,
} from "@/lib/commercial/commercialChapterRoutes";
import { PROGRAMS_WORKSPACE_SIBLING_CHAPTERS } from "@/lib/configRuntime/configurationObject/programsAdoptionSeam";
import { isConfigurationSoftNavEligibleHref } from "@/lib/configRuntime/configurationContinuity";
import { shouldSoftNavigate } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Programs canonical routing containment", () => {
    it("Organization Programs href stays canonical", () => {
        expect(CANONICAL_ORGANIZATION_PROGRAMS_HREF).toBe("/organization/programs");
        expect(isConfigurationSoftNavEligibleHref("/organization/programs")).toBe(true);
        expect(shouldSoftNavigate("/organization/programs")).toBe(true);
    });

    it("does not treat Commercial as Programs-active in sidebar", () => {
        expect(configurationModeNavItemActive("/organization/programs", "/organization/programs")).toBe(true);
        expect(configurationModeNavItemActive("/organization/programs", "/settings/commercial")).toBe(false);
        expect(
            configurationModeNavItemActive(
                "/organization/programs",
                "/settings/commercial?chapter=tuition",
            ),
        ).toBe(false);
    });

    it("legacy Programs chapter query is owned by Organization Programs", () => {
        expect(isProgramsOwnedCommercialChapter("programs")).toBe(true);
        expect(isProgramsOwnedCommercialChapter("programs_tuition")).toBe(true);
        expect(isProgramsOwnedCommercialChapter("tuition")).toBe(false);
        expect(normalizeCommercialCompatChapter("programs")).toBe("programs");
        expect(commercialCompatChapterToSection("programs")).toBe("fees");
        expect(commercialCompatChapterToSection(null)).toBe("fees");
    });

    it("sibling Commercial tools never use bare /settings/commercial Programs landing", () => {
        for (const chapter of PROGRAMS_WORKSPACE_SIBLING_CHAPTERS) {
            expect(chapter.href).toBe(commercialSettingsHref(chapter.id === "catalog" ? "catalog" : chapter.id));
            expect(chapter.href).not.toBe("/settings/commercial");
            expect(chapter.href).toMatch(/^\/settings\/commercial\?chapter=/);
        }
    });

    it("Commercial page redirects Programs chapter ownership server-side", () => {
        const page = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/commercial/page.tsx"),
            "utf8",
        );
        expect(page).toContain("isProgramsOwnedCommercialChapter");
        expect(page).toContain("redirect(organizationProgramsHref())");
    });

    it("Commercial workspace no longer labels Programs & tuition as a chapter", () => {
        const source = readFileSync(
            resolve(process.cwd(), "components/adminV2/commercial/CommercialConfigWorkspace.tsx"),
            "utf8",
        );
        expect(source).not.toContain("Programs & tuition");
        expect(source).toContain('label: "Tuition"');
        expect(source).toContain("commercial-open-canonical-programs");
        expect(source).toContain("isProgramsOwnedCommercialChapter");
        expect(source).toContain("organizationProgramsHref()");
    });

    it("Programs workspace sibling strip uses chapter hrefs", () => {
        const source = readFileSync(
            resolve(process.cwd(), "components/adminV2/settings/programs/ProgramsPublicationWorkspace.tsx"),
            "utf8",
        );
        expect(source).toContain("Related commercial tools");
        expect(source).toContain("chapter.href");
        expect(source).not.toContain('href="/settings/commercial"');
    });
});
