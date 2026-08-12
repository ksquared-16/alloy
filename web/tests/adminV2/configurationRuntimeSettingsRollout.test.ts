/**
 * Configuration Runtime settings rollout — Fields, Actions, Users & Roles, Communications.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const ROLLOUT_PAGES = [
    "app/adminV2/settings/fields/page.tsx",
    "app/adminV2/settings/actions/page.tsx",
    "app/adminV2/settings/users-roles/page.tsx",
    "app/adminV2/settings/entities/page.tsx",
] as const;

describe("Configuration Runtime settings rollout", () => {
    it("rollout pages use configuration components, not pattern placeholders", () => {
        for (const page of ROLLOUT_PAGES) {
            const src = read(page);
            expect(src).not.toContain("ConfigurationPatternPlaceholder");
        }
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("dataModelSectionHref");
        expect(read("app/adminV2/settings/actions/page.tsx")).toContain("SettingsConfigurationSurfaceShell");
        expect(read("app/adminV2/settings/users-roles/page.tsx")).toContain("UsersRolesConfigurationPage");
        expect(read("app/adminV2/settings/organization/communications/page.tsx")).toContain(
            "OrganizationCommunicationsPage",
        );
        expect(read("app/adminV2/settings/entities/page.tsx")).toContain("dataModelSectionHref");
        // Data Model's primary experience is the Entity workspace, not a legacy category embed.
        expect(read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx")).toContain(
            "EntitiesWorkspaceSurface",
        );
    });

    it("priority rollout surfaces use Platform Configuration shell primitives", () => {
        expect(read("components/adminV2/settings/fields/FieldsConfigurationPage.tsx")).toContain("ConfigurationShell");
        expect(read("components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx")).toContain(
            "AccessWorkspaceSurface",
        );
        expect(read("components/adminV2/settings/access/AccessWorkspaceSurface.tsx")).toContain("ConfigurationShell");
        // Communications converged onto the canonical Organization chrome
        // (`/organization/communications`), so it uses ConfigurationShell directly
        // rather than the settings-surface wrapper the retired page used.
        expect(read("components/adminV2/settings/organization/OrganizationCommunicationsPage.tsx")).toContain(
            "ConfigurationShell",
        );
        expect(read("components/adminV2/settings/entities/EntitiesConfigurationPage.tsx")).toContain(
            "SettingsConfigurationSurfaceShell",
        );
    });

    it("Fields uses entity queue in configuration shell", () => {
        const fieldsPage = read("components/adminV2/settings/fields/FieldsConfigurationPage.tsx");
        expect(fieldsPage).toContain("ConfigurationQueue");
        expect(fieldsPage).toContain("fields-configuration-entity-queue");
    });

    it("Access (Users & Roles) and Communications embed their product workspaces under configuration shell", () => {
        expect(read("components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx")).toContain(
            "AccessWorkspaceSurface",
        );
        expect(read("components/adminV2/settings/access/AccessWorkspaceSurface.tsx")).toContain(
            "AccessUsersConfigurationPage",
        );
        // The provider-binding table was replaced by channel cards plus a configure
        // dialog; there is no separate embedded setup client any more.
        expect(read("components/adminV2/settings/organization/OrganizationCommunicationsPage.tsx")).toContain(
            "CommunicationsChannelDialog",
        );
    });

    it("rollout surfaces avoid blue/slate active styling", () => {
        for (const component of [
            "components/adminV2/settings/fields/FieldsConfigurationPage.tsx",
            "components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessWorkspaceSurface.tsx",
            "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessScopesPage.tsx",
            "components/adminV2/settings/access/AccessSecurityPage.tsx",
            "components/adminV2/settings/organization/OrganizationCommunicationsPage.tsx",
            "components/adminV2/settings/entities/EntitiesConfigurationPage.tsx",
        ]) {
            const src = read(component);
            expect(src).not.toMatch(/\bbg-blue-/);
            expect(src).not.toMatch(/\btext-blue-/);
            expect(src).not.toMatch(/\bbg-slate-/);
            expect(src).not.toMatch(/\btext-slate-/);
        }
    });
});
