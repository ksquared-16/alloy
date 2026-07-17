import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_MODE_NAV_GROUPS } from "@/lib/adminV2/configurationModeNav";
import { CANONICAL_ADMIN_CONFIG_LANDING } from "@/lib/admin/canonicalAdminRoutes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Organization Configuration Runtime", () => {
    it("uses Organization as the configuration landing without a duplicate Organization settings link", () => {
        const organization = CONFIGURATION_MODE_NAV_GROUPS.find((group) => group.id === "organization");
        expect(CANONICAL_ADMIN_CONFIG_LANDING).toBe("/organization");
        expect(organization?.items[0]?.label).toBe("Locations");
        expect(organization?.items.map((item) => item.label)).not.toContain("Organization settings");
        expect(CONFIGURATION_MODE_NAV_GROUPS.flatMap((group) => group.items).find(
            (item) => item.href === "/settings/commercial",
        )?.label).toBe("Programs");
        expect(read("next.config.ts")).toContain('{ source: "/organization", destination: "/adminV2/settings/organization" }');
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain('title="Organization"');
        expect(sidebar).not.toContain('title="Admin"');
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

    it("puts compact operational metadata directly above domain navigation", () => {
        const page = read(
            "components/adminV2/settings/organization/OrganizationConfigurationPage.tsx",
        );
        expect(page).toContain("organization-configuration-summary");
        expect(page).toContain("Configuration Domains");
        expect(page).toContain("Consuming Locations");
        expect(page).toContain("Publish Required");
        expect(page).toContain("Health");
        expect(page).toContain("Consumers");
        expect(page).toContain("Distribution");
        expect(page).toContain("ConfigDomainCard");
        expect(page).toContain("ConfigWorkspaceCard");
        expect(page).toContain("auto-rows-fr items-stretch");
        expect(page).toContain("xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]");
        expect(page.indexOf("Configuration Domains")).toBeLessThan(page.indexOf('title="Consumers"'));
        expect(page).not.toContain("organization-hero");
        expect(page).not.toContain("organization-configuration-health");
        expect(page).not.toContain("ConfigObjectHeader");
        expect(page).not.toContain("organization-shared-configuration");
        expect(page).not.toContain("<table");
        expect(page).not.toContain("ConfigApplyToDialog");
    });

    it("keeps equal-height domain cards focused on scanning and navigation", () => {
        const card = read(
            "components/adminV2/settings/configurationRuntime/workspace/ConfigDomainCard.tsx",
        );
        expect(card).toContain('data-config-object="domain"');
        expect(card).toContain("h-full");
        expect(card).toContain("slice(0, 3)");
        expect(card).toContain("Owns");
        expect(card).toContain("Used by");
        expect(card).toContain("publicationLabel(domain.publication.status)");
        expect(card).toContain("domain.ownedConfiguration");
        expect(card).not.toContain("domain.publisherLabel");
        expect(card).not.toContain("domain.inheritance");
        expect(card).not.toContain("domain.override");
        expect(card).not.toContain("domain.health");
    });

    it("does not modify the frozen Locations implementation to host organization behavior", () => {
        const locations = read(
            "components/adminV2/settings/locations/LocationsConfigurationPage.tsx",
        );
        expect(locations).not.toContain("OrganizationConfigurationPage");
        expect(locations).not.toContain("organizationConfigurationDomains");
    });
});
