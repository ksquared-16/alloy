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

    it("Statuses queue shows Opportunity Status + People — 'Enrollment Participation' is retired", () => {
        const hook = read("components/adminV2/settings/statuses/useStatusDefinitionsSettings.ts");
        // The per-child OCM disposition status model ("Enrollment Participation") is no longer a
        // configurable category — the Process Instance owns execution (stage + state).
        expect(hook).toContain("Opportunity Status");
        expect(hook).toContain("People Statuses");
        // No configurable "Enrollment Participation" LABEL entry (only the retirement comment mentions it).
        expect(hook).not.toContain('"Enrollment Participation"');
        // OCM child disposition rows no longer load into /statuses.
        expect(hook).not.toContain("opportunity_customer_members");
    });

    it("Fields uses Platform Configuration shell", () => {
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("FieldsConfigurationPage");
        const fieldsPage = read("components/adminV2/settings/fields/FieldsConfigurationPage.tsx");
        expect(fieldsPage).toContain("ConfigurationContext");
        expect(fieldsPage).toContain("ConfigurationShell");
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
