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
] as const;

const ROLLOUT_COMPONENTS = [
    "components/adminV2/settings/fields/FieldsConfigurationPage.tsx",
    "components/adminV2/settings/actions/ActionsConfigurationPage.tsx",
    "components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx",
    "components/adminV2/settings/communications/CommunicationsConfigurationPage.tsx",
] as const;

describe("Configuration Runtime settings rollout", () => {
    it("rollout pages use configuration components, not pattern placeholders", () => {
        for (const page of ROLLOUT_PAGES) {
            const src = read(page);
            expect(src).not.toContain("ConfigurationPatternPlaceholder");
            expect(src).not.toContain("SettingsPageHeader");
        }
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("FieldsConfigurationPage");
        expect(read("app/adminV2/settings/actions/page.tsx")).toContain("ActionDefinitionCatalogPage");
        expect(read("app/adminV2/settings/users-roles/page.tsx")).toContain("UsersRolesConfigurationPage");
        expect(read("app/adminV2/settings/communications/page.tsx")).toContain("CommunicationsConfigurationPage");
    });

    it("rollout surfaces use ConfigurationShell with queue and workspace", () => {
        for (const component of ROLLOUT_COMPONENTS) {
            const src = read(component);
            expect(src).toContain("ConfigurationContext");
            expect(src).toContain("ConfigurationShell");
            expect(src).toContain("ConfigurationQueue");
        }
    });

    it("Fields hides raw field keys outside Advanced details", () => {
        const fieldsPage = read("components/adminV2/settings/fields/FieldsConfigurationPage.tsx");
        const detail = read("components/adminV2/settings/fields/FieldConfigurationDetailPanel.tsx");
        expect(fieldsPage).not.toContain("field_key");
        expect(detail).toContain("<details");
        expect(detail).toContain("Field key:");
        expect(detail).not.toMatch(/config-typo-queue-item-title[\s\S]*field_key/);
    });

    it("Actions internal catalog is not primary operator configuration", () => {
        const page = read("app/adminV2/settings/actions/page.tsx");
        const catalog = read("components/adminV2/settings/actions/ActionDefinitionCatalogPage.tsx");
        expect(page).toContain("ActionDefinitionCatalogPage");
        expect(catalog).toContain("action-definition-catalog-page");
        expect(read("lib/adminV2/configurationModeNav.ts")).not.toMatch(/label: "Actions"/);
    });

    it("Users & Roles uses queue + workspace, not legacy tab bar client", () => {
        const page = read("app/adminV2/settings/users-roles/page.tsx");
        const client = read("components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx");
        expect(page).not.toContain("UsersRolesSettingsClient");
        expect(client).toContain("users-roles-configuration-shell");
        expect(client).not.toContain("SettingsEntityTabBar");
    });

    it("Communications uses queue + workspace pattern", () => {
        const comm = read("components/adminV2/settings/communications/CommunicationsConfigurationPage.tsx");
        expect(comm).toContain("communications-configuration-shell");
        expect(comm).not.toContain("mid-build");
        expect(comm).not.toContain("bg-amber");
    });

    it("rollout surfaces avoid blue/slate active styling", () => {
        for (const component of ROLLOUT_COMPONENTS) {
            const src = read(component);
            expect(src).not.toMatch(/\bbg-blue-/);
            expect(src).not.toMatch(/\btext-blue-/);
            expect(src).not.toMatch(/\bbg-slate-/);
            expect(src).not.toMatch(/\btext-slate-/);
        }
    });

    it("queue route uses total not total_count property on QueueItemsResult", () => {
        const route = read("app/api/admin/queues/[workUnitId]/[queueKey]/route.ts");
        expect(route).toMatch(/\btotal:\s*\n?\s*typeof result\.total/);
        expect(route).not.toMatch(/^\s*total_count:/m);
    });

    it("playwright rollout screenshot spec exists", () => {
        expect(read("playwright/tests/configuration-runtime-settings-rollout.spec.ts")).toContain(
            "configuration-runtime-settings-rollout",
        );
    });
});
