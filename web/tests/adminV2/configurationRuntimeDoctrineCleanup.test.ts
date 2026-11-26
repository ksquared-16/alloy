/**
 * Configuration Mode doctrine cleanup — typography, copy, Statuses detail, rollout placeholders.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function readDoc(rel: string): string {
    return readFileSync(resolve(root, "..", rel), "utf8");
}

const USER_FACING_CONFIG_PATHS = [
    "components/adminV2/settings/statuses/StatusesConfigurationPage.tsx",
    "components/adminV2/settings/statuses/StatusConfigurationDetailPanel.tsx",
    "components/adminV2/settings/businessProcess/BusinessProcessWorkViewsListColumn.tsx",
    "components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx",
    "lib/lifecycle/businessProcessUiLabels.ts",
];

describe("Configuration Mode doctrine cleanup", () => {
    it("typography tokens exist in configurationRuntime.css and shared primitives", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        for (const token of [
            "config-typo-page-title",
            "config-typo-workspace-title",
            "config-typo-queue-item-title",
            "config-typo-field-label",
            "config-typo-sublabel",
            "config-typo-meta",
        ]) {
            expect(css, token).toContain(`.${token}`);
        }

        const layout = read("components/adminV2/settings/configurationRuntime/ConfigurationModeLayout.tsx");
        expect(layout).toContain("config-typo-page-title");
        expect(layout).toContain("config-typo-workspace-title");
        expect(layout).toContain("config-typo-queue-item-title");
        expect(layout).toContain("config-typo-queue-section-label");
        expect(layout).toContain("config-typo-sublabel");
        expect(read("components/adminV2/settings/statuses/StatusConfigurationDetailPanel.tsx")).toContain(
            "config-typo-field-label",
        );
    });

    it("no user-facing legacy copy in processes, work views, or statuses", () => {
        for (const file of USER_FACING_CONFIG_PATHS) {
            const src = read(file);
            expect(src, file).not.toMatch(/legacy stage perspectives|seeded from legacy|legacy perspectives/i);
            expect(src, file).not.toMatch(/\blegacy\b/i);
        }
    });

    it("Work Views operator copy describes operator focus, not migration", () => {
        const labels = read("lib/lifecycle/businessProcessUiLabels.ts");
        expect(labels).toContain("Work Views define how operators focus on work in this process.");
        expect(labels).not.toContain("WORK_VIEW_COMPAT_NOTE");
    });

    it("Status detail does not render Display Style", () => {
        const detail = read("components/adminV2/settings/statuses/StatusConfigurationDetailPanel.tsx");
        expect(detail).not.toContain("Display style");
        expect(detail).not.toContain("displayStyleSummary");
        expect(detail).not.toContain("StatusDrawerSourceBadgeList");
        expect(detail).toContain("status-detail-open-processes");
    });

    it("Statuses page redirects into the Data Model Statuses category", () => {
        const page = read("app/adminV2/settings/statuses/page.tsx");
        expect(page).toContain("dataModelSectionHref");
        expect(page).toContain('"statuses"');
        expect(page).not.toContain("LifecycleSettingsCrossLinkBanner");
        expect(read("components/adminV2/settings/statuses/StatusesConfigurationPage.tsx")).toContain(
            "ConfigurationShell",
        );
    });

    it("hybrid settings surfaces use configuration shell instead of rollout placeholders", () => {
        const shell = read("components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell.tsx");
        expect(shell).toContain("ConfigurationContext");
        expect(shell).toContain("ConfigurationShell");
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("dataModelSectionHref");
        // IA-8: the Access workspace has one renderer, and it is the `/organization/access` page.
        expect(read("app/adminV2/settings/organization/access/page.tsx")).toContain("UsersRolesConfigurationPage");
        expect(read("app/adminV2/settings/organization/communications/page.tsx")).toContain(
            "OrganizationCommunicationsPage",
        );
        expect(read("app/adminV2/settings/entities/page.tsx")).toContain("dataModelSectionHref");
        expect(read("app/adminV2/settings/actions/page.tsx")).toContain("SettingsConfigurationSurfaceShell");
        for (const path of [
            "app/adminV2/settings/fields/page.tsx",
            "app/adminV2/settings/organization/access/page.tsx",
            "app/adminV2/settings/organization/communications/page.tsx",
            "app/adminV2/settings/entities/page.tsx",
            "app/adminV2/settings/actions/page.tsx",
        ]) {
            expect(read(path)).not.toContain("ConfigurationPatternPlaceholder");
        }
    });

    it("workflows documented as diagnostic/future automation surface", () => {
        const doc = readDoc("docs/sprints/archive/06_2026/configuration_runtime_settings_pattern_rollout.md");
        expect(doc).toMatch(/diagnostic|early automation/i);
        expect(doc).toMatch(/Automation|automation/i);
        expect(doc).not.toMatch(/Workflows.*polished Configuration Mode/i);
    });

    it("shared config CSS avoids blue/slate active tokens", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain("#00a283");
        expect(css).not.toContain("alloy-blue");
    });

    it("doctrine cleanup playwright spec exists", () => {
        expect(read("playwright/tests/configuration-runtime-doctrine-cleanup.spec.ts")).toContain(
            "configuration-runtime-doctrine-cleanup",
        );
    });
});
