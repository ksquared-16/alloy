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
    "app/adminV2/settings/communications/page.tsx",
    "app/adminV2/settings/entities/page.tsx",
] as const;

describe("Configuration Runtime settings rollout", () => {
    it("rollout pages use configuration components, not pattern placeholders", () => {
        for (const page of ROLLOUT_PAGES) {
            const src = read(page);
            expect(src).not.toContain("ConfigurationPatternPlaceholder");
        }
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("FieldsConfigurationPage");
        expect(read("app/adminV2/settings/actions/page.tsx")).toContain("SettingsConfigurationSurfaceShell");
        expect(read("app/adminV2/settings/users-roles/page.tsx")).toContain("UsersRolesConfigurationPage");
        expect(read("app/adminV2/settings/communications/page.tsx")).toContain("CommunicationsConfigurationPage");
        expect(read("app/adminV2/settings/entities/page.tsx")).toContain("EntitiesConfigurationPage");
    });

    it("priority rollout surfaces use Platform Configuration shell primitives", () => {
        expect(read("components/adminV2/settings/fields/FieldsConfigurationPage.tsx")).toContain("ConfigurationShell");
        expect(read("components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx")).toContain(
            "SettingsConfigurationSurfaceShell",
        );
        expect(read("components/adminV2/settings/communications/CommunicationsConfigurationPage.tsx")).toContain(
            "SettingsConfigurationSurfaceShell",
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

    it("Users & Roles and Communications embed existing workspace clients under configuration shell", () => {
        expect(read("components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx")).toContain(
            "UsersRolesSettingsClient",
        );
        expect(read("components/adminV2/settings/communications/CommunicationsConfigurationPage.tsx")).toContain(
            "CommunicationsSetupClient",
        );
    });

    it("rollout surfaces avoid blue/slate active styling", () => {
        for (const component of [
            "components/adminV2/settings/fields/FieldsConfigurationPage.tsx",
            "components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx",
            "components/adminV2/settings/communications/CommunicationsConfigurationPage.tsx",
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
