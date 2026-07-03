/**
 * Configuration Runtime settings pattern rollout — Processes + Statuses share Context → Queue → Workspace → BOS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime settings pattern rollout", () => {
    it("shared configuration primitives exist and are exported from ConfigurationModeShell", () => {
        const layout = read("components/adminV2/settings/configurationRuntime/ConfigurationModeLayout.tsx");
        expect(layout).toContain("export function ConfigurationContext");
        expect(layout).toContain("export function ConfigurationQueue");
        expect(layout).toContain("export function ConfigurationWorkspace");
        expect(layout).toContain("export function ConfigurationQueueItem");
        expect(layout).toContain("export function ConfigurationPrimaryButton");
        expect(layout).toContain("export function ConfigurationDetailCard");
        expect(layout).toContain("export function ConfigurationShell");

        const shell = read("components/adminV2/settings/configurationRuntime/ConfigurationModeShell.tsx");
        expect(shell).toContain("ConfigurationContext");
        expect(shell).toContain("ConfigurationShell");
        expect(shell).toContain("BusinessProcessConfigurationShell");
    });

    it("Processes shell uses shared ConfigurationShell", () => {
        const bpShell = read("components/adminV2/settings/businessProcess/BusinessProcessConfigurationShell.tsx");
        expect(bpShell).toContain("ConfigurationShell");
        expect(bpShell).not.toContain("process-config-setup-workspace");
    });

    it("Statuses page uses queue/workspace configuration page, not legacy accordion client", () => {
        const page = read("app/adminV2/settings/statuses/page.tsx");
        expect(page).toContain("StatusesConfigurationPage");
        expect(page).not.toContain("StatusesClient");

        const statusesPage = read("components/adminV2/settings/statuses/StatusesConfigurationPage.tsx");
        expect(statusesPage).toContain("ConfigurationContext");
        expect(statusesPage).toContain("ConfigurationShell");
        expect(statusesPage).toContain("statuses-category-queue");
        expect(statusesPage).toContain("statuses-status-list");
        expect(statusesPage).not.toContain("accordion");
    });

    it("Statuses detail workspace uses ConfigurationDetailCard and pine primary save", () => {
        const detail = read("components/adminV2/settings/statuses/StatusConfigurationDetailPanel.tsx");
        expect(detail).toContain("ConfigurationDetailCard");
        expect(detail).toContain("config-primary-btn");
        expect(detail).toContain("status-detail-open-processes");
    });

    it("Statuses queue labels match enrollment, lead/case, and people groups", () => {
        const hook = read("components/adminV2/settings/statuses/useStatusDefinitionsSettings.ts");
        expect(hook).toContain("Enrollment Participation");
        expect(hook).toContain("Lead Statuses");
        expect(hook).toContain("People Statuses");
    });

    it("Fields documents next pattern without full implementation", () => {
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("ConfigurationPatternPlaceholder");
        expect(read("components/adminV2/settings/configurationRuntime/ConfigurationPatternPlaceholder.tsx")).toContain(
            "fields-configuration-pattern-placeholder",
        );
    });

    it("configuration CSS avoids blue/slate accordion styling for statuses surface", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain("#00a283");
        expect(css).not.toContain("alloy-blue");
    });

    it("rollout doc and playwright settings-pattern spec exist", () => {
        expect(
            readFileSync(
                resolve(root, "../docs/sprints/06_2026/configuration_runtime_settings_pattern_rollout.md"),
                "utf8",
            ),
        ).toContain("Context → Queue → Workspace → BOS");
        expect(read("playwright/tests/configuration-runtime-settings-pattern.spec.ts")).toContain(
            "configuration-runtime-settings-pattern",
        );
    });
});
