/**
 * Configuration Runtime final visual pass — typography and color balance drift prevention.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime final visual pass", () => {
    it("Work View editor renders collapsed section summaries", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("workViewEditorSummaries");
        expect(card).toContain("-summary");
        expect(card).toContain("formatWorkViewConditionsSummary");
        expect(card).toContain("formatWorkViewPresentationSummary");
        expect(card).toContain("formatWorkViewVisibilitySummary");
    });

    it("Work View expanded header avoids duplicating display name when basics open", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("open.basics");
        expect(card).toContain("process-work-view-header-title");
        expect(card).toContain("work-view-section-title");
    });

    it("Work View list column shows one clear title per row", () => {
        const list = read("components/adminV2/settings/businessProcess/BusinessProcessWorkViewsListColumn.tsx");
        expect(list).not.toContain("view.mission");
        expect(list).toContain("Untitled work view");
    });

    it("configurationRuntime.css defines visual balance and section typography", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain("work-view-section-title");
        expect(css).toContain("work-view-section-summary");
        expect(css).toContain("rgba(0, 162, 131, 0.06)");
        expect(css).toContain("[data-adminv2-settings-mode");
    });

    it("selected states remain Bend Pine in CSS", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain("rgba(0, 162, 131, 0.08)");
        expect(css).toContain("#00a283");
        expect(css).not.toContain("alloy-blue");
    });

    it("playwright final visual pass spec exists", () => {
        expect(read("playwright/tests/configuration-runtime-final-visual-pass.spec.ts")).toContain(
            "configuration-runtime-final-visual-pass",
        );
    });
});
