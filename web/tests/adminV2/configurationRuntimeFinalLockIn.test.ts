/**
 * Configuration Runtime final lock-in — pine primary actions and workspace structure.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime final lock-in", () => {
    it("config primary buttons use config-primary-btn class", () => {
        expect(read("app/adminV2/settings/configurationRuntime.css")).toContain(".config-primary-btn");
        expect(read("components/adminV2/settings/businessProcess/BusinessProcessProcessSelectorStrip.tsx")).toContain(
            "config-primary-btn",
        );
        expect(read("components/adminV2/settings/businessProcess/BusinessProcessWorkViewsListColumn.tsx")).toContain(
            "config-primary-btn",
        );
        expect(read("components/adminV2/settings/businessProcess/BusinessProcessStagesListColumn.tsx")).toContain(
            "config-primary-btn",
        );
        expect(read("components/adminV2/settings/businessProcess/BusinessProcessWorkViewsSetupWorkspace.tsx")).toContain(
            "config-primary-btn",
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx")).toContain(
            "config-primary-btn",
        );
    });

    it("selected states use Bend Pine in configurationRuntime.css", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain("rgba(0, 162, 131, 0.08)");
        expect(css).toContain("#00a283");
        expect(css).not.toContain("alloy-blue");
    });

    it("process shell defines queue/workspace dividers", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain(".process-config-list-column");
        expect(css).toContain("border-right: 1px solid rgba(89, 103, 139, 0.14)");
        expect(css).toContain(".process-config-workspace-toolbar");
    });

    it("Work View collapsed summaries render without duplicate header title", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("work-view-section-summary");
        expect(card).toContain("formatWorkViewConditionsSummary");
        expect(card).toContain("open.basics");
    });

    it("Configuration Health label and process-level copy exist", () => {
        const labels = read("lib/lifecycle/businessProcessUiLabels.ts");
        expect(labels).toContain("Configuration Health");
        expect(labels).toContain("BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY");
        expect(read("components/adminV2/settings/businessProcess/BusinessProcessHealthQueueWorkspace.tsx")).toContain(
            "BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY",
        );
    });

    it("statuses page uses config surface wrapper", () => {
        expect(read("app/adminV2/settings/statuses/page.tsx")).toContain("statuses-config-surface");
    });

    it("playwright final lock-in screenshot spec exists", () => {
        expect(read("playwright/tests/configuration-runtime-final-lock-in.spec.ts")).toContain(
            "configuration-runtime-final-lock-in",
        );
    });
});
