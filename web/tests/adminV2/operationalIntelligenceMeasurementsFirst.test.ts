import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    CAPACITY_RECIPES,
    capacityRecipeFromProductTypeLabel,
} from "@/lib/adminV2/settings/operationalIntelligence/oiCapacityRecipeCopy";
import {
    organizationConfigurationDomain,
    organizationConfigurationDomains,
} from "@/lib/configRuntime/organizationRuntime";
import {
    CANONICAL_ORGANIZATION_CALCULATIONS_HREF,
    organizationCalculationLibraryHref,
} from "@/lib/admin/canonicalAdminRoutes";

const WEB = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(WEB, rel), "utf8");
}

describe("OI V2 inline question builder convergence", () => {
    it("exposes operator capacity recipes without engineering nouns", () => {
        expect(CAPACITY_RECIPES).toHaveLength(2);
        for (const r of CAPACITY_RECIPES) {
            expect(r.title.toLowerCase()).not.toMatch(/fallback|coalesce|ast|projection|binding/);
            expect(r.summary.toLowerCase()).not.toMatch(/fallback|coalesce|ast|projection|binding/);
            expect(r.recipeSentence.toLowerCase()).not.toMatch(/fallback|coalesce|ast|projection|binding/);
            expect(r.sourceLine.toLowerCase()).not.toMatch(/fallback|coalesce|organization calculation v\d/);
        }
        expect(capacityRecipeFromProductTypeLabel("Operational seats when available").id).toBe(
            "capacity_operational_with_fallback",
        );
        expect(CAPACITY_RECIPES[0]!.recipeSentence).toContain("lower of physical seats");
    });

    it("OI home separates questions from measurement instances", () => {
        const ws = read(
            "components/adminV2/settings/operationalIntelligence/OperationalIntelligenceWorkspace.tsx",
        );
        expect(ws).toContain("What do you want to know?");
        expect(ws).toContain("Questions Alloy can answer");
        expect(ws).toContain("What we are measuring");
        expect(ws).toContain("OiFutureRoomCapacityBuilder");
        expect(ws).toContain("oi-builder-view");
        expect(ws).toContain("oi-post-activation");
        expect(ws).toContain("oi-product-tabs");
        expect(ws).toContain("oi-tab-");
        expect(ws).toContain('key: "questions"');
        expect(ws).toContain('key: "measurements"');
        expect(ws).toContain('key: "calculations"');
        expect(ws).toContain("OrganizationCalculationsWorkspace");
        expect(ws).toContain("embedded");
        expect(ws).not.toContain("enablement");
        expect(ws).not.toContain("active_pack_count");
        expect(ws).not.toContain("oi-home-add-measurement");
    });

    it("inline builder uses shared configure contract and Start measuring", () => {
        const builder = read(
            "components/adminV2/settings/operationalIntelligence/OiFutureRoomCapacityBuilder.tsx",
        );
        expect(builder).toContain("oi-frc-inline-builder");
        expect(builder).toContain("How should Alloy determine capacity?");
        expect(builder).toContain("Start measuring");
        expect(builder).toContain("/api/admin/operational-questions/configure");
        expect(builder).toContain("oi-builder-recipe");
        expect(builder).toContain("Try it");
        expect(builder).not.toContain("Business Information");
        expect(builder).not.toContain(">Publish<");
        expect(builder).not.toContain("Step ");
    });

    it("measurement workspace uses Overview / History / Settings", () => {
        const panel = read(
            "components/adminV2/settings/operationalIntelligence/OiOrgCalcMeasurementPanel.tsx",
        );
        expect(panel).toContain('label: "Overview"');
        expect(panel).toContain('label: "History"');
        expect(panel).toContain('label: "Settings"');
        expect(panel).toContain("How this is measured");
        expect(panel).toContain("Warn me when capacity is below");
        expect(panel).toContain("Get answer");
        expect(panel).toContain("oi-org-calc-room");
        expect(panel).toContain("Use the newer definition");
        expect(panel).toContain("View definition");
        expect(panel).toContain("organizationCalculationLibraryHref");
        expect(panel).not.toContain("Source binding");
        expect(panel).not.toContain("Run observation");
        expect(panel).not.toContain('label: "Check a room"');
    });

    it("Calculations is not a primary Organization peer; library lives in OI", () => {
        const keys = organizationConfigurationDomains().map((d) => d.key);
        expect(keys).not.toContain("organization-calculations");
        expect(keys).toContain("operational-intelligence");
        const domain = organizationConfigurationDomain("organization-calculations");
        expect(domain?.label).toBe("Calculation library");
        expect(domain?.href).toContain("operational-intelligence");
        expect(domain?.href).toContain("view=calculations");
        expect(organizationCalculationLibraryHref({ calculationId: "abc" })).toBe(
            "/organization/operational-intelligence?view=calculations&calculationId=abc",
        );
        expect(CANONICAL_ORGANIZATION_CALCULATIONS_HREF).toBe("/organization/calculations");
    });

    it("compatibility calculations page redirects into OI library", () => {
        const page = read("app/adminV2/settings/organization/calculations/page.tsx");
        expect(page).toContain("redirect(");
        expect(page).toContain("organizationCalculationLibraryHref");
        expect(page).not.toContain("<OrganizationCalculationsWorkspace");
    });

    it("calculation library supports embedded mount without forking", () => {
        const lib = read(
            "components/adminV2/settings/organizationCalculations/OrganizationCalculationsWorkspace.tsx",
        );
        expect(lib).toContain("embedded");
        expect(lib).toContain("data-oi-embedded-library");
        expect(lib).toContain("New definition");
        expect(lib).toContain("Where used");
        expect(lib).toContain("organizationCalculationLibraryHref");
        expect(lib).toContain("where-used-measurement");
    });
});
