/**
 * Configuration Runtime V1 final — frozen shell widths and Locations Configuration Mode.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_SHELL_OBJECT_QUEUE_WIDTH_PX,
    CONFIGURATION_SHELL_SECTION_QUEUE_WIDTH_PX,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const V1_CONFIGURATION_PAGES = [
    "components/adminV2/settings/locations/LocationsConfigurationPage.tsx",
    "components/adminV2/settings/fields/FieldsConfigurationPage.tsx",
    "components/adminV2/settings/statuses/StatusesConfigurationPage.tsx",
    "components/adminV2/settings/access/AccessWorkspaceSurface.tsx",
    "components/adminV2/settings/organization/OrganizationCommunicationsPage.tsx",
    "components/adminV2/settings/businessProcess/BusinessProcessConfigurationShell.tsx",
] as const;

describe("Configuration Runtime V1 final", () => {
    it("exports frozen shell width constants", () => {
        expect(CONFIGURATION_SHELL_SECTION_QUEUE_WIDTH_PX).toBe(260);
        expect(CONFIGURATION_SHELL_OBJECT_QUEUE_WIDTH_PX).toBe(320);
    });

    it("configurationRuntime.css defines shell width variables", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain("--config-section-queue-width: 260px");
        expect(css).toContain("--config-object-queue-width: 320px");
        expect(css).toContain(".configuration-section-queue");
        expect(css).toContain(".configuration-object-queue");
        expect(css).toContain(".configuration-workspace");
    });

    it("ConfigurationShell applies semantic queue and workspace classes", () => {
        const layout = read("components/adminV2/settings/configurationRuntime/ConfigurationModeLayout.tsx");
        expect(layout).toContain("configuration-section-queue");
        expect(layout).toContain("configuration-object-queue");
        expect(layout).toContain("configuration-workspace");
    });

    it("V1 configuration pages use ConfigurationShell without per-page width hacks", () => {
        for (const page of V1_CONFIGURATION_PAGES) {
            const src = read(page);
            const usesShell =
                src.includes("ConfigurationShell") || src.includes("SettingsConfigurationSurfaceShell");
            expect(usesShell).toBe(true);
            expect(src).not.toMatch(/width:\s*\d+px/);
            expect(src).not.toContain("17.5rem");
            expect(src).not.toContain("15.5rem");
        }
        expect(read("components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell.tsx")).toContain(
            "ConfigurationShell",
        );
    });

    it("Locations uses Configuration Mode with an object selector and owned-concern tabs", () => {
        const loc = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const selector = read("components/adminV2/settings/locations/LocationsObjectSelector.tsx");
        expect(loc).toContain("LocationsObjectSelector");
        expect(selector).toContain('data-testid="locations-object-selector"');
        expect(loc).toContain("LOCATION_WORKSPACE_TABS");
        expect(loc).not.toContain("locations-section-queue");
        expect(loc).not.toContain("LocationsHierarchySettingsClient");
        expect(loc).not.toContain("data-locations-editor-table");
    });

    it("configuration-runtime-v1 doctrine is frozen", () => {
        const doc = readFileSync(resolve(root, "../docs/system/configuration-runtime-v1.md"), "utf8");
        expect(doc).toContain("Frozen");
        expect(doc).toContain("Surfaces");
        expect(doc).toContain("/settings/locations");
    });

    it("playwright v1 final screenshot spec captures required files", () => {
        expect(read("playwright/tests/configuration-runtime-v1-final.spec.ts")).toContain("01-settings-index.png");
        expect(read("playwright/tests/configuration-runtime-v1-final.spec.ts")).toContain("07-locations.png");
        expect(read("playwright/tests/configuration-runtime-v1-final.spec.ts")).toContain("08-full-bos.png");
    });
});
