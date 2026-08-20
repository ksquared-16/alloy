/**
 * Grouped configuration landing simplification — no conceptual header cards.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";
import { ACCESS_WORKSPACE_CHAPTERS } from "@/lib/access/accessChapterRoutes";
import { buildFinancialsLandingSections } from "@/lib/financials/financialsLandingModel";
import { buildProgramsLocationsLandingTiles } from "@/lib/configRuntime/programsLocationsLandingModel";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("grouped configuration landing simplification", () => {
    it("Financials landing uses compact launcher only — no conceptual card row", () => {
        const landing = read("components/adminV2/settings/financials/FinancialsLanding.tsx");
        const workspace = read("components/adminV2/settings/financials/FinancialsPublicationWorkspace.tsx");
        expect(landing).toContain("CompactConfigurationLauncher");
        expect(landing).toContain("Choose the financial area you need to configure.");
        expect(landing).not.toContain("Financial Domains");
        expect(landing).not.toContain("Choose a domain");
        expect(landing).not.toContain("Separate domain");
        expect(workspace).toContain("CompactGroupedLandingShell");
        expect(workspace).not.toContain("ConfigScopeContextBar");
        expect(workspace).not.toContain("FINANCIALS_LANDING_SUBTITLE");

        const sections = buildFinancialsLandingSections();
        expect(sections.map((s) => s.id)).toEqual([
            "tuition",
            "catalog",
            "policies",
            "accounting",
            "simulator",
            "funding",
        ]);
    });

    it("Programs & Locations landing uses compact launcher only — no conceptual card row", () => {
        const landing = read("components/adminV2/settings/organization/ProgramsLocationsLanding.tsx");
        const workspace = read(
            "components/adminV2/settings/organization/ProgramsLocationsPublicationWorkspace.tsx",
        );
        expect(landing).toContain("CompactConfigurationLauncher");
        expect(landing).toContain("Programs are authored once and assigned to Locations.");
        expect(landing).not.toContain("One operational system");
        expect(landing).not.toContain("Define once");
        expect(landing).not.toContain("Local ownership");
        expect(workspace).toContain("CompactGroupedLandingShell");
        expect(workspace).not.toContain("ConfigScopeContextBar");

        const tiles = buildProgramsLocationsLandingTiles();
        expect(tiles.map((t) => t.id)).toEqual(["programs", "locations"]);
    });

    it("Access landing has empty summaryCards and four launch destinations", () => {
        const model = buildAccessLandingModel(ACCESS_WORKSPACE_CHAPTERS);
        expect(model.summaryCards).toEqual([]);
        expect(model.tiles.map((t) => t.id)).toEqual(["users", "roles", "scopes", "security"]);
        expect(model.tiles.find((t) => t.id === "users")?.label).toBe("Users");
        expect(model.tiles.find((t) => t.id === "scopes")?.label).toBe("Access Scopes");
        expect(model.tiles.find((t) => t.id === "security")?.label).toBe("Security");

        const shared = read("components/adminV2/settings/organization/OrganizationDomainLanding.tsx");
        expect(shared).toContain("CompactConfigurationLauncher");
        expect(shared).toContain("CompactGroupedLandingShell");
        expect(shared).not.toContain("summaryCards.map");
        expect(shared).not.toContain("ConfigScopeContextBar");
    });

    it("shared compact launcher does not encourage conceptual hero cards", () => {
        const launcher = read(
            "components/adminV2/settings/configurationRuntime/CompactConfigurationLauncher.tsx",
        );
        expect(launcher).toContain("No conceptual KPI");
        expect(launcher).toContain("testId}-tiles");
        expect(launcher).toContain("Open {item.label}");
    });
});
