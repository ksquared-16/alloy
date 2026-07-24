import { describe, expect, it } from "vitest";
import { configurationModeNavItemActive } from "@/lib/adminV2/configurationModeNav";
import {
    CANONICAL_ORGANIZATION_FINANCIALS_HREF,
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    commercialEntryToProgramsHref,
    commercialSettingsHref,
    FINANCIALS_WORKSPACE_CHAPTERS,
    normalizeFinancialsWorkspaceChapter,
    organizationFinancialsChapterHref,
} from "@/lib/commercial/commercialChapterRoutes";
import {
    buildFinancialsLandingSections,
    FINANCIALS_LANDING_HREF,
    financialsSectionHref,
} from "@/lib/financials/financialsLandingModel";
import { organizationConfigurationDomains } from "@/lib/configRuntime/organizationRuntime";
import { isConfigurationSoftNavEligibleHref } from "@/lib/configRuntime/configurationContinuity";
import { shouldSoftNavigate } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Organization Financials landing (Slice 1)", () => {
    it("canonical Financials landing is bare /organization/financials", () => {
        expect(CANONICAL_ORGANIZATION_FINANCIALS_HREF).toBe("/organization/financials");
        expect(FINANCIALS_LANDING_HREF).toBe("/organization/financials");
        expect(organizationFinancialsChapterHref(null)).toBe("/organization/financials");
        expect(isConfigurationSoftNavEligibleHref("/organization/financials")).toBe(true);
        expect(shouldSoftNavigate("/organization/financials")).toBe(true);
    });

    it("Organization domain tile points at Financials landing (not Tuition)", () => {
        const financials = organizationConfigurationDomains().find((d) => d.key === "financials");
        expect(financials?.href).toBe("/organization/financials");
        expect(financials?.href).not.toContain("chapter=");
    });

    it("does not automatically select Tuition on the landing route", () => {
        const page = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/organization/financials/page.tsx"),
            "utf8",
        );
        expect(page).toContain("initialChapter");
        expect(page).toContain("null");
        expect(page).not.toContain("FINANCIALS_DEFAULT_CHAPTER");
        expect(normalizeFinancialsWorkspaceChapter(undefined)).toBeNull();
        expect(normalizeFinancialsWorkspaceChapter("")).toBeNull();
    });

    it("section tiles use canonical ?chapter= routes (history-correct)", () => {
        const sections = buildFinancialsLandingSections();
        expect(sections.map((s) => s.id)).toEqual([...FINANCIALS_WORKSPACE_CHAPTERS]);
        for (const section of sections) {
            expect(section.href).toBe(`/organization/financials?chapter=${section.id}`);
            expect(financialsSectionHref(section.id)).toBe(section.href);
            expect(commercialSettingsHref(section.id)).toBe(section.href);
        }
        expect(sections.some((s) => s.id === "tuition")).toBe(true);
        expect(sections.every((s) => !s.href.includes("/programs"))).toBe(true);
    });

    it("Programs is excluded from Financials landing tiles", () => {
        const sections = buildFinancialsLandingSections();
        expect(sections.some((s) => s.label === "Programs")).toBe(false);
        expect(commercialEntryToProgramsHref("programs")).toBe(CANONICAL_ORGANIZATION_PROGRAMS_HREF);
    });

    it("sidebar treats Financials as distinct from Programs", () => {
        expect(configurationModeNavItemActive("/organization/financials", "/organization/financials")).toBe(true);
        expect(configurationModeNavItemActive("/organization/financials", "/organization/programs")).toBe(false);
        expect(configurationModeNavItemActive("/organization/programs", "/organization/financials")).toBe(false);
    });

    it("Financials page mounts landing when chapter is absent", () => {
        const page = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/organization/financials/page.tsx"),
            "utf8",
        );
        const workspace = readFileSync(
            resolve(process.cwd(), "components/adminV2/settings/financials/FinancialsPublicationWorkspace.tsx"),
            "utf8",
        );
        const landing = readFileSync(
            resolve(process.cwd(), "components/adminV2/settings/financials/FinancialsLanding.tsx"),
            "utf8",
        );
        expect(workspace).toContain("FinancialsLanding");
        expect(workspace).toContain("FinancialsWorkspaceSurface");
        expect(landing).toContain("financials-landing-tiles");
        expect(landing).toContain("financials-landing-open-");
        expect(landing).toContain("Open {section.label}");
        expect(page).toContain("FinancialsPublicationWorkspace");
    });

    it("next.config rewrites Financials and Commercial tools land on Financials", () => {
        const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
        expect(nextConfig).toContain('source: "/organization/financials"');
        expect(nextConfig).toContain('destination: "/adminV2/settings/organization/financials"');
        expect(nextConfig).toContain('destination: "/organization/financials?chapter=tuition"');
    });
});
