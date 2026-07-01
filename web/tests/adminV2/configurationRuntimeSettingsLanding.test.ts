/**
 * Settings landing — compact Configuration Mode index (no hero card).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_MODE_HUB_SUBTITLE,
    CONFIGURATION_MODE_HUB_TITLE,
} from "@/lib/adminV2/configurationModeNav";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime — Settings landing", () => {
    it("hub uses compact ConfigurationContext instead of hero card", () => {
        const hub = read("app/adminV2/settings/SettingsConfigurationHub.tsx");
        expect(hub).toContain("ConfigurationContext");
        expect(hub).not.toContain("ConfigRuntimeHero");
        expect(hub).not.toContain("settings-configuration-hero");
        expect(hub).toContain('data-testid="settings-configuration-tiles"');
        expect(hub).toContain("settings-configuration-tiles");
    });

    it("hub title and subtitle match compact index copy", () => {
        expect(CONFIGURATION_MODE_HUB_TITLE).toBe("Settings");
        expect(CONFIGURATION_MODE_HUB_SUBTITLE).toBe("Configure Alloy by area.");
    });

    it("css defines compact tiles gap without hero panel on context bar", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain(".settings-configuration-tiles");
        expect(css).toContain("1.5rem");
        expect(css).toContain(".process-config-context-bar");
    });

    it("playwright settings landing spec exists", () => {
        expect(read("playwright/tests/configuration-runtime-settings-landing.spec.ts")).toContain(
            "configuration-runtime-settings-landing",
        );
    });
});
