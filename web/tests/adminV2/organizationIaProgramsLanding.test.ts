import { describe, expect, it } from "vitest";
import { CONFIGURATION_MODE_NAV_ITEMS } from "@/lib/adminV2/configurationModeNav";
import {
    organizationConfigurationDomain,
    organizationConfigurationDomains,
} from "@/lib/configRuntime/organizationRuntime";
import {
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
    CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF,
} from "@/lib/admin/canonicalAdminRoutes";
import { ORGANIZATION_LOCATIONS_PATH } from "@/lib/admin/canonicalLocationSettingsRoutes";
import { buildProgramsLocationsLandingTiles } from "@/lib/configRuntime/programsLocationsLandingModel";
import { readFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
}

describe("Organization IA — Programs & Locations domain", () => {
    it("Organization landing peers Programs & Locations and keeps Financials; excludes Programs/Locations peers", () => {
        const keys = organizationConfigurationDomains().map((d) => d.key);
        expect(keys).toContain("programs-locations");
        expect(keys).toContain("financials");
        expect(keys).not.toContain("programs");
        expect(keys).not.toContain("locations");
        expect(keys).toHaveLength(9);
        expect(organizationConfigurationDomain("programs-locations")?.href).toBe(
            CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF,
        );
    });

    it("Programs and Locations lookups remain intact for collections", () => {
        expect(organizationConfigurationDomain("programs")?.href).toBe(
            CANONICAL_ORGANIZATION_PROGRAMS_HREF,
        );
        expect(organizationConfigurationDomain("locations")?.href).toBe(ORGANIZATION_LOCATIONS_PATH);
        expect(organizationConfigurationDomain("commercial")?.key).toBe("programs");
    });

    it("landing tiles open existing Programs and Locations collections only", () => {
        const tiles = buildProgramsLocationsLandingTiles();
        expect(tiles.map((t) => t.id)).toEqual(["programs", "locations"]);
        expect(tiles.find((t) => t.id === "programs")?.href).toBe(CANONICAL_ORGANIZATION_PROGRAMS_HREF);
        expect(tiles.find((t) => t.id === "locations")?.href).toBe(ORGANIZATION_LOCATIONS_PATH);
    });

    it("config-mode nav uses Programs & Locations peer", () => {
        expect(
            CONFIGURATION_MODE_NAV_ITEMS.some((item) => item.href === CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF),
        ).toBe(true);
        expect(CONFIGURATION_MODE_NAV_ITEMS.some((item) => item.href === "/organization/locations")).toBe(
            false,
        );
        expect(CONFIGURATION_MODE_NAV_ITEMS.some((item) => item.href === "/organization/programs")).toBe(
            false,
        );
        expect(CONFIGURATION_MODE_NAV_ITEMS.some((item) => item.href === "/organization/financials")).toBe(
            true,
        );
    });

    it("rewrites and breadcrumbs wire the relationship landing", () => {
        expect(read("next.config.ts")).toContain('source: "/organization/programs-locations"');
        expect(read("app/adminV2/settings/organization/programs-locations/page.tsx")).toContain(
            "ProgramsLocationsPublicationWorkspace",
        );
        expect(read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx")).toContain(
            "locations-breadcrumb-programs-locations",
        );
        expect(read("components/adminV2/settings/programs/ProgramsConfigurationPage.tsx")).toContain(
            "programs-breadcrumb-programs-locations",
        );
    });
});
