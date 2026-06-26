/**
 * Configuration Runtime final ownership cleanup — IA, Actions demotion, Access rename.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_MODE_INTERNAL_NAV_ITEMS,
    CONFIGURATION_MODE_NAV_GROUPS,
    CONFIGURATION_MODE_NAV_ITEMS,
} from "@/lib/adminV2/configurationModeNav";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime final ownership cleanup", () => {
    it("primary Configuration nav excludes Actions and includes Access + Surfaces", () => {
        const labels = CONFIGURATION_MODE_NAV_ITEMS.map((i) => i.label);
        expect(labels).not.toContain("Actions");
        expect(labels).toContain("Access");
        expect(labels).toContain("Surfaces");
        expect(labels).toContain("Communications");
        expect(labels).toContain("Fields");
        expect(labels).toContain("Statuses");
        expect(labels).toContain("Processes");
        expect(labels).toContain("Automation");
    });

    it("Actions route uses internal definition catalog page", () => {
        expect(read("app/adminV2/settings/actions/page.tsx")).toContain("ActionDefinitionCatalogPage");
        expect(read("components/adminV2/settings/actions/ActionDefinitionCatalogPage.tsx")).toContain(
            "action-definition-catalog-page",
        );
        expect(CONFIGURATION_MODE_INTERNAL_NAV_ITEMS.some((i) => i.href.includes("/actions"))).toBe(true);
    });

    it("sidebar renders grouped Configuration nav without Actions", () => {
        const sidebar = read("app/adminV2/components/SidebarConfigurationModeNav.tsx");
        expect(sidebar).toContain("CONFIGURATION_MODE_NAV_GROUPS");
        expect(sidebar).not.toContain("config-mode-nav-actions");
    });

    it("Access page shows people-first queue rows", () => {
        const access = read("components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx");
        expect(access).toContain('title="Access"');
        expect(access).toContain("wrapTitle");
        expect(access).toContain("memberSubtitle");
    });

    it("login page has password visibility toggle", () => {
        expect(read("app/login/page.tsx")).toContain("login-password-visibility-toggle");
        expect(read("app/login/page.tsx")).toContain("Eye");
    });

    it("ownership doctrine documents frozen model", () => {
        const doc = readFileSync(resolve(root, "../docs/system/configuration-ownership-doctrine.md"), "utf8");
        expect(doc).toContain("Surfaces");
        expect(doc).toContain("Frozen");
    });

    it("configuration workspace domains removed Actions from operator tiles", () => {
        const domains = read("lib/adminV2/configurationWorkspaceDomains.ts");
        expect(domains).not.toContain('label: "Action buttons"');
        expect(domains).toContain('label: "Access"');
        expect(domains).toContain('label: "Surfaces"');
    });

    it("playwright v1 final screenshot spec exists", () => {
        expect(read("playwright/tests/configuration-runtime-v1-final.spec.ts")).toContain(
            "01-settings-index.png",
        );
    });

    it("nav groups include Organization section", () => {
        expect(CONFIGURATION_MODE_NAV_GROUPS[0]?.label).toBe("Organization");
        expect(CONFIGURATION_MODE_NAV_GROUPS[0]?.items.some((i) => i.label === "Access")).toBe(true);
    });
});
