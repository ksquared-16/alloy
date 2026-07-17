import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_MODE_NAV_GROUPS } from "@/lib/adminV2/configurationModeNav";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Organization Configuration Runtime", () => {
    it("adds an organization-owned landing above Locations without replacing Settings home", () => {
        const organization = CONFIGURATION_MODE_NAV_GROUPS.find((group) => group.id === "organization");
        expect(organization?.items.map((item) => item.label).slice(0, 2)).toEqual([
            "Organization settings",
            "Locations",
        ]);
        expect(organization?.items[0]?.href).toBe("/settings/organization");
        expect(CONFIGURATION_MODE_NAV_GROUPS.flatMap((group) => group.items).find(
            (item) => item.href === "/settings/commercial",
        )?.label).toBe("Programs");
        expect(read("app/adminV2/settings/page.tsx")).toContain("SettingsConfigurationHub");
    });

    it("loads organization and location identity through an org-scoped server boundary", () => {
        const page = read("app/adminV2/settings/organization/page.tsx");
        expect(page).toContain("getAdminContextCached");
        expect(page).toContain('.from("orgs")');
        expect(page).toContain('.from("locations")');
        expect(page).toContain('.eq("org_id", ctx.orgId)');
        expect(page).toContain('.eq("location_type", "site")');
        expect(page).not.toContain("createBrowserClient");
    });

    it("presents the premium runtime composition without a settings table", () => {
        const page = read(
            "components/adminV2/settings/organization/OrganizationConfigurationPage.tsx",
        );
        expect(page).toContain("organization-hero");
        expect(page).toContain("Configuration health");
        expect(page).toContain("Configuration domains");
        expect(page).toContain("Consumers");
        expect(page).toContain("Distribution");
        expect(page).toContain("ConfigDomainCard");
        expect(page).toContain("ConfigObjectHeader");
        expect(page).toContain("ConfigWorkspaceCard");
        expect(page).toContain("grid items-start");
        expect(page).not.toContain("organization-shared-configuration");
        expect(page).not.toContain("<table");
        expect(page).not.toContain("ConfigApplyToDialog");
    });

    it("uses the reusable domain card to show the complete runtime object contract", () => {
        const card = read(
            "components/adminV2/settings/configurationRuntime/workspace/ConfigDomainCard.tsx",
        );
        expect(card).toContain('data-config-object="domain"');
        for (const concern of ["Publisher", "Consumers", "Inheritance", "Overrides", "Health"]) {
            expect(card).toContain(concern);
        }
        expect(card).toContain("domain.publication.label");
        expect(card).toContain("domain.ownedConfiguration");
    });

    it("does not modify the frozen Locations implementation to host organization behavior", () => {
        const locations = read(
            "components/adminV2/settings/locations/LocationsConfigurationPage.tsx",
        );
        expect(locations).not.toContain("OrganizationConfigurationPage");
        expect(locations).not.toContain("organizationConfigurationDomains");
    });
});
