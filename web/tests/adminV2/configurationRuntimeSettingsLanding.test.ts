/**
 * Settings landing — Configuration Platform index (frozen visual).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_MODE_HUB_SUBTITLE,
    CONFIGURATION_MODE_HUB_TITLE,
    CONFIGURATION_MODE_NAV_GROUPS,
    CONFIGURATION_MODE_NAV_ITEMS,
} from "@/lib/adminV2/configurationModeNav";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Platform — Settings landing", () => {
    it("hub uses two-column section rows without eyebrow or tile grid", () => {
        const hub = read("app/adminV2/settings/SettingsConfigurationHub.tsx");
        expect(hub).toContain("ConfigurationContext");
        expect(hub).toContain("ConfigurationSection");
        expect(hub).toContain("ConfigurationSectionItem");
        expect(hub).not.toContain("eyebrow");
        expect(hub).not.toContain("badge");
        expect(hub).not.toContain("ConfigRuntimePrimaryTile");
        expect(hub).not.toContain("settings-configuration-tiles");
        expect(hub).toContain('data-testid="settings-configuration-sections"');
    });

    it("hub copy matches Platform Configuration title without Settings eyebrow", () => {
        expect(CONFIGURATION_MODE_HUB_TITLE).toBe("Platform Configuration");
        expect(CONFIGURATION_MODE_HUB_SUBTITLE).toContain("across your organization");
        expect(read("lib/adminV2/configurationModeNav.ts")).not.toContain("CONFIGURATION_MODE_HUB_EYEBROW");
    });

    it("nav groups mirror the four configuration chapters", () => {
        expect(CONFIGURATION_MODE_NAV_GROUPS.map((g) => g.id)).toEqual([
            "organization",
            "data_model",
            "operations",
            "business",
        ]);
    });

    it("exposes Entities without New badge and hides Financials", () => {
        const entities = CONFIGURATION_MODE_NAV_ITEMS.find((item) => item.label === "Entities");
        expect(entities?.href).toBe("/settings/entities");
        expect(CONFIGURATION_MODE_NAV_ITEMS.map((item) => item.label)).not.toContain("Financials");
        expect(read("lib/adminV2/configurationModeNav.ts")).not.toMatch(/badge:\s*"New"/);
    });

    it("css locks identity column width and strengthens section hierarchy", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain("--config-platform-identity-width");
        expect(css).toContain("font-weight: 700");
        expect(css).toContain(".config-platform-section");
        expect(css).toContain(".config-platform-row");
        expect(css).toContain("translateX(2px)");
    });

    it("sidebar does not render nav badges", () => {
        const sidebar = read("app/adminV2/components/SidebarConfigurationModeNav.tsx");
        expect(sidebar).not.toContain("item.badge");
    });
});
